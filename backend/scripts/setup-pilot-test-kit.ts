/**
 * Этап 13 — ПОДГОТОВКА К ПИЛОТНОМУ ТЕСТИРОВАНИЮ.
 *
 * В отличие от всех verify-*.ts (которые создают ОДНОРАЗОВЫХ,
 * помеченных timestamp'ом пользователей и не рассчитаны на повторный
 * запуск с теми же данными), этот скрипт создаёт ПОСТОЯННЫЙ набор
 * тестовых аккаунтов, предназначенных для использования людьми
 * (методистом/пилотными преподавателями) при ручном тестировании —
 * и безопасно перезапускается повторно (идемпотентен: находит уже
 * существующие сущности вместо создания дублей).
 *
 * ОТДЕЛЕНИЕ ОТ РЕАЛЬНЫХ ДАННЫХ (ТЗ Этапа 13, явное требование):
 *   - домен email — ".test" (зарезервирован IANA специально для
 *     тестирования/документации, гарантированно не существует и не
 *     может совпасть с реальным адресом: RFC 2606);
 *   - каждое ФИО, название группы/курса/года содержит маркер
 *     "(ПИЛОТ-ТЕСТ)" — не спутать с реальными данными визуально нигде
 *     в интерфейсе;
 *   - все константы вынесены в начало файла одним блоком — чтобы перед
 *     реальным запуском пилота эти аккаунты можно было гарантированно
 *     найти и удалить одним SQL-запросом по email LIKE '%@pilot.test'.
 *
 * Запуск: npm run pilot:setup (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, request } from "./lib/testClient";
import { getVisibleQuestions, hasAnswer, type QuestionDef } from "../src/questionnaire/definition";
import { DIAGNOSTIC_ITEMS } from "../src/diagnostic/itemBank";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

// --- Тестовые учётные данные (пилот) --------------------------------------
export const PILOT_PASSWORD = "PilotTest2026!";
export const PILOT = {
  teacher: { email: "teacher@pilot.test", fullName: "Тестовый Преподаватель (ПИЛОТ-ТЕСТ)" },
  studentA: { email: "student.a@pilot.test", fullName: "Тестовый Студент A (ПИЛОТ-ТЕСТ)" },
  studentB: { email: "student.b@pilot.test", fullName: "Тестовый Студент B (ПИЛОТ-ТЕСТ)" },
  studentC: { email: "student.c@pilot.test", fullName: "Тестовый Студент C (ПИЛОТ-ТЕСТ)" },
  academicYearName: "2026/2027 (ПИЛОТ-ТЕСТ)",
  courseName: "Английский язык — Финансы (ПИЛОТ-ТЕСТ)",
  groupName: "Тестовая группа (ПИЛОТ-ТЕСТ)",
};

// --- Идемпотентные помощники -----------------------------------------------

async function registerOrLogin(jar: CookieJar, email: string, password: string, role: "TEACHER" | "STUDENT") {
  const reg = await request("/api/auth/register", { method: "POST", jar, body: { email, password, role } });
  if (reg.status === 201) return { ...reg.body, wasCreated: true as const };
  if (reg.status === 409) {
    const login = await request("/api/auth/login", { method: "POST", jar, body: { email, password } });
    if (login.status !== 200) throw new Error(`Не удалось войти существующим тестовым аккаунтом ${email}: ${JSON.stringify(login.body)}`);
    return { ...login.body, wasCreated: false as const };
  }
  throw new Error(`Не удалось создать тестовый аккаунт ${email}: ${JSON.stringify(reg.body)}`);
}

async function findOrCreateAcademicYear(teacherJar: CookieJar, name: string) {
  const list = await request("/api/teacher/academic-years", { jar: teacherJar });
  const existing = (list.body ?? []).find((y: any) => y.name === name);
  if (existing) return existing;
  const created = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name } });
  if (created.status !== 201) throw new Error(`Не удалось создать учебный год: ${JSON.stringify(created.body)}`);
  return created.body;
}

async function findOrCreateCourse(teacherJar: CookieJar, name: string, academicYearId: string) {
  const list = await request("/api/teacher/courses", { jar: teacherJar });
  const existing = (list.body ?? []).find((c: any) => c.name === name && c.academicYearId === academicYearId);
  if (existing) return existing;
  const created = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name, academicYearId } });
  if (created.status !== 201) throw new Error(`Не удалось создать курс: ${JSON.stringify(created.body)}`);
  return created.body;
}

async function findOrCreateGroup(teacherJar: CookieJar, name: string, courseId: string) {
  const list = await request("/api/teacher/groups", { jar: teacherJar });
  const existing = (list.body ?? []).find((g: any) => g.name === name && g.courseId === courseId);
  if (existing) return existing;
  const created = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name, courseId, specialty: "Финансы и экономика" } });
  if (created.status !== 201) throw new Error(`Не удалось создать группу: ${JSON.stringify(created.body)}`);
  return created.body;
}

async function ensureTestBank(teacherJar: CookieJar, courseId: string, minCount = 10) {
  const list = await request(`/api/teacher/credit/courses/${courseId}/test-items`, { jar: teacherJar });
  const activeCount = (list.body ?? []).filter((i: any) => i.active).length;
  if (activeCount >= minCount) return;
  const topics = ["PRESENT_SIMPLE", "PRESENT_PERFECT", "PAST_SIMPLE", "FUTURE_SIMPLE", "PASSIVE_VOICE", "QUANTIFIERS", "PHRASAL_VERBS", "COMPARISON_DEGREES", "PRESENT_CONTINUOUS", "PRESENT_PERFECT_CONTINUOUS"];
  for (let i = activeCount; i < minCount; i++) {
    await request(`/api/teacher/credit/courses/${courseId}/test-items`, {
      method: "POST",
      jar: teacherJar,
      body: {
        question: `(ПИЛОТ-ТЕСТ) Choose the correct form — item ${i + 1}.`,
        options: ["go", "goes", "went", "gone"],
        correctOptionIndex: 1,
        grammarTopic: topics[i % topics.length],
        vocabularyTopic: "Finance vocabulary (pilot)",
        explanationRu: "Пояснение к правильному ответу (пилотное задание).",
      },
    });
  }
}

// --- Стартовая анкета / диагностика (переиспользованный паттерн Этапа 10) --

function defaultValueFor(q: QuestionDef): unknown {
  switch (q.type) {
    case "TEXT":
    case "TEXTAREA":
      return "Тестовый ответ (ПИЛОТ-ТЕСТ).";
    case "SINGLE_CHOICE":
      return q.options![0].value;
    case "MULTI_CHOICE": {
      const n = Math.min(q.maxSelections ?? 1, q.options!.length);
      return q.options!.slice(0, n).map((o) => o.value);
    }
    case "SCALE_1_5":
      return 3;
    case "MATRIX_SCALE_1_5":
      return Object.fromEntries(q.matrixItems!.map((i) => [i.value, 3]));
    default:
      throw new Error(`Unknown question type for ${q.code}`);
  }
}

async function ensureStartQuestionnaireCompleted(studentJar: CookieJar, groupId: string) {
  const start = await request("/api/student/questionnaire/attempts", { method: "POST", jar: studentJar, body: { groupId } });
  const attemptId = start.body.id;
  if (start.body.status === "COMPLETED") return start.body;
  for (let pass = 0; pass < 6; pass++) {
    const attempt = (await request(`/api/student/questionnaire/attempts/${attemptId}`, { jar: studentJar })).body;
    const answers = attempt.answers as Record<string, unknown>;
    const visible = getVisibleQuestions(answers);
    const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length === 0) break;
    for (const q of missing) {
      await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, { method: "PUT", jar: studentJar, body: { code: q.code, value: defaultValueFor(q) } });
    }
  }
  const completed = await request(`/api/student/questionnaire/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить стартовую анкету: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

async function ensureStartDiagnosticCompleted(studentJar: CookieJar, groupId: string, wrongPerSkill: Record<string, number> = {}) {
  const start = await request("/api/student/diagnostic/attempts", { method: "POST", jar: studentJar, body: { groupId } });
  const attemptId = start.body.id;
  if (start.body.status !== "COMPLETED") {
    const wrongLeft = { ...wrongPerSkill };
    for (const item of DIAGNOSTIC_ITEMS) {
      if (item.id in (start.body.answers ?? {})) continue;
      const makeWrong = (wrongLeft[item.skill] ?? 0) > 0;
      if (makeWrong) wrongLeft[item.skill]--;
      const selected = makeWrong ? (item.correctOptionIndex + 1) % item.optionsEn.length : item.correctOptionIndex;
      await request(`/api/student/diagnostic/attempts/${attemptId}/items/${item.id}/answer`, { method: "POST", jar: studentJar, body: { selectedOptionIndex: selected } });
    }
  }
  const completed = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить стартовую диагностику: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

async function main() {
  console.log("\n=== Этап 13: настройка постоянного пилотного тестового набора (ПИЛОТ-ТЕСТ) ===\n");

  // --- Преподаватель ---------------------------------------------------
  const teacherJar: CookieJar = {};
  const teacher = await registerOrLogin(teacherJar, PILOT.teacher.email, PILOT_PASSWORD, "TEACHER");
  check(`Teacher Test Account готов (${PILOT.teacher.email}, ${teacher.wasCreated ? "создан" : "уже существовал"})`, true);
  await request("/api/teacher/profile", {
    method: "PUT",
    jar: teacherJar,
    body: { fullName: PILOT.teacher.fullName, organization: "Пилотный колледж (ПИЛОТ-ТЕСТ)", department: "Кафедра английского языка", position: "Преподаватель", workEmail: "" },
  });

  const year = await findOrCreateAcademicYear(teacherJar, PILOT.academicYearName);
  const course = await findOrCreateCourse(teacherJar, PILOT.courseName, year.id);
  const group = await findOrCreateGroup(teacherJar, PILOT.groupName, course.id);
  const groupDetail = await request(`/api/teacher/groups/${group.id}`, { jar: teacherJar });
  const joinCode: string = groupDetail.body.joinCode.code;
  check(`Тестовая группа готова («${PILOT.groupName}»), код подключения: ${joinCode}`, !!joinCode);
  await ensureTestBank(teacherJar, course.id, 10);

  // --- Студенты A/B/C: регистрация + профиль + присоединение по коду ---
  const students: Record<"A" | "B" | "C", { jar: CookieJar; id: string; email: string }> = {} as any;
  for (const [key, def] of [
    ["A", PILOT.studentA],
    ["B", PILOT.studentB],
    ["C", PILOT.studentC],
  ] as const) {
    const jar: CookieJar = {};
    const user = await registerOrLogin(jar, def.email, PILOT_PASSWORD, "STUDENT");
    check(`Student ${key} Test Account готов (${def.email}, ${user.wasCreated ? "создан" : "уже существовал"})`, true);
    await request("/api/student/profile", {
      method: "PUT",
      jar,
      body: { fullName: def.fullName, email: def.email, specialty: "Финансы и экономика", course: "1", academicYear: "2026/2027" },
    });
    const join = await request("/api/student/groups/join", { method: "POST", jar, body: { code: joinCode } });
    check(`Student ${key} присоединён к тестовой группе по коду (200/201, alreadyMember=${join.body?.alreadyMember ?? false})`, [200, 201].includes(join.status), join.body);
    students[key] = { jar, id: user.id, email: def.email };
  }

  // --- Полный путь студента: анкета + стартовая диагностика ------------
  console.log("\n=== Полный путь: Start Profile + Start Diagnostic для всех трёх студентов ===");
  await ensureStartQuestionnaireCompleted(students.A.jar, group.id);
  await ensureStartDiagnosticCompleted(students.A.jar, group.id, { GRAMMAR: 4, VOCABULARY: 3, READING: 2, LISTENING: 1 });
  check("Student A: Start Profile + Start Diagnostic завершены", true);

  await ensureStartQuestionnaireCompleted(students.B.jar, group.id);
  await ensureStartDiagnosticCompleted(students.B.jar, group.id, { GRAMMAR: 2, VOCABULARY: 1 });
  check("Student B: Start Profile + Start Diagnostic завершены", true);

  await ensureStartQuestionnaireCompleted(students.C.jar, group.id);
  await ensureStartDiagnosticCompleted(students.C.jar, group.id, {});
  check("Student C: Start Profile + Start Diagnostic завершены", true);

  await prisma.$disconnect();
  summarize();

  console.log("\nГотово. Учётные данные — см. вывод выше и docs/STAGE_13_PILOT_TEST_REPORT.md.");
  console.log(`Пароль для всех тестовых аккаунтов: ${PILOT_PASSWORD}`);
  console.log(`Код подключения тестовой группы: ${joinCode}`);
}

// Запускаем main() ТОЛЬКО при прямом запуске этого файла (`npm run
// pilot:setup`), а не при импорте PILOT/PILOT_PASSWORD из
// run-pilot-scenarios.ts — иначе оба скрипта выполнялись бы
// одновременно против одного backend (гонка, перепутанный вывод).
if (require.main === module) {
  main().catch(async (err) => {
    console.error("Скрипт настройки пилотного набора завершился с ошибкой:", err);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
}
