/**
 * Скрипт критической проверки (см. ТЗ Этапа 1, п.9).
 *
 * Запускает реальные HTTP-запросы к работающему backend (не моки, не
 * заглушки) и проверяет разграничение доступа на уровне API:
 *
 *   Сценарий A/B — Teacher A не видит данные Teacher B и наоборот.
 *   Сценарий C/D — Student A не видит данные Student B и наоборот.
 *   Прямой доступ — студент не может вызвать преподавательский
 *                    эндпоинт (и наоборот) даже зная точный URL.
 *   Без токена   — защищённые маршруты недоступны без входа в систему.
 *
 * Использование:
 *   1. Запустить backend: npm run dev (в отдельном терминале)
 *   2. npm run verify:access
 *
 * Скрипт создаёт четырёх новых пользователей с уникальными email
 * (timestamp в адресе), поэтому его безопасно перезапускать повторно.
 */

const BASE_URL = process.env.API_URL || "http://localhost:4000";

type CookieJar = { cookie?: string };

function extractCookie(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) return undefined;
  // Берём только пару name=value, отбрасывая атрибуты (Path, HttpOnly, ...).
  return setCookieHeader.split(";")[0];
}

async function request(
  path: string,
  opts: { method?: string; body?: unknown; jar?: CookieJar } = {}
) {
  const { method = "GET", body, jar } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jar?.cookie) headers.Cookie = jar.cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (jar) {
    const setCookie = res.headers.get("set-cookie");
    const c = extractCookie(setCookie);
    if (c) jar.cookie = c;
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json };
}

let passCount = 0;
let failCount = 0;

function check(label: string, condition: boolean, details?: unknown) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.log(`  ❌ ${label}`);
    if (details !== undefined) console.log("     ", JSON.stringify(details));
  }
}

async function registerAndLogin(email: string, password: string, role: "TEACHER" | "STUDENT") {
  const jar: CookieJar = {};
  const res = await request("/api/auth/register", { method: "POST", body: { email, password, role }, jar });
  if (res.status !== 201) {
    throw new Error(`Не удалось зарегистрировать ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { jar, userId: res.body.id as string };
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка доступа к API English Start Profile (${BASE_URL})\n`);

  console.log("Подготовка: создаём Teacher A, Teacher B, Student A, Student B...");
  const teacherA = await registerAndLogin(`teacher-a-${stamp}@example.com`, "Password123!", "TEACHER");
  const teacherB = await registerAndLogin(`teacher-b-${stamp}@example.com`, "Password123!", "TEACHER");
  const studentA = await registerAndLogin(`student-a-${stamp}@example.com`, "Password123!", "STUDENT");
  const studentB = await registerAndLogin(`student-b-${stamp}@example.com`, "Password123!", "STUDENT");
  console.log("Готово.\n");

  console.log("Заполняем профили Teacher A и Teacher B разными данными...");
  await request("/api/teacher/profile", {
    method: "PUT",
    jar: teacherA.jar,
    body: { fullName: "Иванова Анна Сергеевна", organization: "Колледж А", department: "Кафедра A", position: "Преподаватель", workEmail: "" },
  });
  await request("/api/teacher/profile", {
    method: "PUT",
    jar: teacherB.jar,
    body: { fullName: "Петров Борис Николаевич", organization: "Колледж Б", department: "Кафедра B", position: "Доцент", workEmail: "" },
  });

  console.log("Заполняем профили Student A и Student B разными данными...");
  await request("/api/student/profile", {
    method: "PUT",
    jar: studentA.jar,
    body: { fullName: "Сидорова Алина", email: "student-a@example.com", specialty: "Финансы и экономика", course: "1", academicYear: "2026/2027" },
  });
  await request("/api/student/profile", {
    method: "PUT",
    jar: studentB.jar,
    body: { fullName: "Борисов Богдан", email: "student-b@example.com", specialty: "Логистика", course: "1", academicYear: "2026/2027" },
  });

  console.log("\nСценарий A/B: Teacher A и Teacher B видят только свой профиль");
  const teacherAProfile = await request("/api/teacher/profile", { jar: teacherA.jar });
  const teacherBProfile = await request("/api/teacher/profile", { jar: teacherB.jar });
  check("Teacher A получает свой профиль (200)", teacherAProfile.status === 200);
  check(
    "Профиль Teacher A содержит его собственное ФИО, а не Teacher B",
    teacherAProfile.body?.fullName === "Иванова Анна Сергеевна",
    teacherAProfile.body
  );
  check(
    "Профиль Teacher B содержит его собственное ФИО, а не Teacher A",
    teacherBProfile.body?.fullName === "Петров Борис Николаевич",
    teacherBProfile.body
  );
  check(
    "Ответы для Teacher A и Teacher B различаются (нет утечки чужих данных)",
    JSON.stringify(teacherAProfile.body) !== JSON.stringify(teacherBProfile.body)
  );

  console.log("\nСценарий C/D: Student A и Student B видят только свой профиль");
  const studentAProfile = await request("/api/student/profile", { jar: studentA.jar });
  const studentBProfile = await request("/api/student/profile", { jar: studentB.jar });
  check(
    "Профиль Student A содержит его собственное ФИО, а не Student B",
    studentAProfile.body?.fullName === "Сидорова Алина",
    studentAProfile.body
  );
  check(
    "Профиль Student B содержит его собственное ФИО, а не Student A",
    studentBProfile.body?.fullName === "Борисов Богдан",
    studentBProfile.body
  );

  console.log("\nПрямой доступ к чужой роли через точный URL (API), не через скрытие меню");
  const studentTriesTeacherDashboard = await request("/api/teacher/profile", { jar: studentA.jar });
  check(
    "Student не может открыть /api/teacher/profile напрямую (403)",
    studentTriesTeacherDashboard.status === 403,
    studentTriesTeacherDashboard
  );

  const teacherTriesStudentEndpoint = await request("/api/student/profile", { jar: teacherA.jar });
  check(
    "Teacher не может открыть /api/student/profile напрямую (403)",
    teacherTriesStudentEndpoint.status === 403,
    teacherTriesStudentEndpoint
  );

  console.log("\nБез аутентификации");
  const noAuthTeacher = await request("/api/teacher/profile");
  const noAuthStudent = await request("/api/student/profile");
  check("Без токена /api/teacher/profile недоступен (401)", noAuthTeacher.status === 401, noAuthTeacher);
  check("Без токена /api/student/profile недоступен (401)", noAuthStudent.status === 401, noAuthStudent);

  console.log("\nПодмена cookie другого пользователя не даёт доступа к чужим данным");
  const mixedJar: CookieJar = { cookie: teacherB.jar.cookie };
  const crossAccess = await request("/api/teacher/profile", { jar: mixedJar });
  check(
    "Запрос с валидной cookie Teacher B возвращает именно данные Teacher B (не A)",
    crossAccess.body?.fullName === "Петров Борис Николаевич",
    crossAccess.body
  );

  console.log(`\nИтог: ${passCount} пройдено, ${failCount} провалено.\n`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
});
