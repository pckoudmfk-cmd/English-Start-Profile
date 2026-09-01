/**
 * Этап 13 — ПОДГОТОВКА К ПИЛОТНОМУ ТЕСТИРОВАНИЮ: сценарии.
 *
 * Прогоняет заявленные в задании Этапа 13 сценарии поверх ПОСТОЯННОГО
 * тестового набора, созданного `npm run pilot:setup` (см. setup-pilot-
 * test-kit.ts — Teacher Test Account, Student A/B/C, Тестовая группа).
 * Запускать после pilot:setup. Безопасно перезапускать повторно —
 * каждый прогон использует новые, явно помеченные "(ПИЛОТ-ТЕСТ N)"
 * названия мероприятий/заданий, поэтому не путается с предыдущими
 * прогонами и не создаёт дублей аккаунтов/группы.
 *
 * Покрывает:
 *   - Teacher Dashboard видит всех трёх студентов; Student Profile
 *     показывает результаты диагностики именно выбранного студента;
 *   - Student B: achievement workflow (заявка → проверка → +1 балл),
 *     повторено 5 раз (разные мероприятия) + явная попытка получить
 *     ВТОРОЙ балл за то же мероприятие — заблокирована;
 *   - Credit: Student A (0 баллов) → «Устная часть обязательна»;
 *     Student B (5 баллов) → «Устная часть освобождена»/«Зачёт
 *     завершён»;
 *   - Progress Check: Student C не может открыть его до назначения
 *     преподавателем; после назначения — может.
 *
 * Запуск: npm run pilot:scenarios (после pilot:setup).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, request } from "./lib/testClient";
import { PILOT, PILOT_PASSWORD } from "./setup-pilot-test-kit";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

async function login(email: string, password: string): Promise<CookieJar> {
  const jar: CookieJar = {};
  const res = await request("/api/auth/login", { method: "POST", jar, body: { email, password } });
  if (res.status !== 200) throw new Error(`Не удалось войти как ${email}: ${JSON.stringify(res.body)}`);
  return jar;
}

async function findGroupAndCourse(teacherJar: CookieJar) {
  const years = await request("/api/teacher/academic-years", { jar: teacherJar });
  const year = years.body.find((y: any) => y.name === PILOT.academicYearName);
  const courses = await request("/api/teacher/courses", { jar: teacherJar });
  const course = courses.body.find((c: any) => c.name === PILOT.courseName && c.academicYearId === year.id);
  const groups = await request("/api/teacher/groups", { jar: teacherJar });
  const group = groups.body.find((g: any) => g.name === PILOT.groupName && g.courseId === course.id);
  return { year, course, group };
}

async function giveQualificationPoint(studentJar: CookieJar, teacherJar: CookieJar, groupId: string, eventName: string, eventDate: string) {
  const created = await request("/api/student/achievements", {
    method: "POST",
    jar: studentJar,
    body: { groupId, eventName, eventDate, organizer: "МГУ (ПИЛОТ-ТЕСТ)", eventType: "CONFERENCE", claimedResult: "PRIZE_PLACE", resultPlace: "II место" },
  });
  if (created.status !== 201) throw new Error(`Не удалось создать достижение: ${JSON.stringify(created.body)}`);
  const submit = await request(`/api/student/achievements/${created.body.id}/submit`, { method: "POST", jar: studentJar });
  if (submit.status !== 200) throw new Error(`Не удалось отправить достижение на проверку: ${JSON.stringify(submit.body)}`);
  const decision = await request(`/api/teacher/achievements/${created.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "CONFIRM" } });
  return { achievement: created.body, decision };
}

async function submitAndConfirmDictionary(studentJar: CookieJar, teacherJar: CookieJar, groupId: string) {
  const submit = await request(`/api/student/credit/${groupId}/dictionary`, {
    method: "POST",
    jar: studentJar,
    body: { wordCount: 900, description: "Словарь по финансовой лексике (ПИЛОТ-ТЕСТ)" },
  });
  if (submit.status !== 201) throw new Error(`Не удалось отправить заявку на допуск: ${JSON.stringify(submit.body)}`);
  await request(`/api/teacher/credit/dictionary/${submit.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "OPEN" } });
  const confirm = await request(`/api/teacher/credit/dictionary/${submit.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "CONFIRM" } });
  return confirm;
}

// Идемпотентно: при повторном запуске сценариев (лимит попыток теста
// по умолчанию — 1) уже завершённый тест не пересдаётся заново, а
// принимается как достаточное свидетельство — иначе повторный прогон
// сценариев на постоянном пилотном наборе падал бы на втором запуске.
async function takeCreditTest(studentJar: CookieJar, groupId: string) {
  const existing = await request(`/api/student/credit/${groupId}`, { jar: studentJar });
  if (existing.body?.test?.status === "COMPLETED") {
    return { status: 200, body: { alreadyCompleted: true, correctCount: existing.body.test.latestAttempt?.correctCount, totalCount: existing.body.test.latestAttempt?.totalCount } };
  }
  const start = await request(`/api/student/credit/${groupId}/test/attempts`, { method: "POST", jar: studentJar });
  if (![200, 201].includes(start.status)) throw new Error(`Не удалось начать зачётный тест: ${JSON.stringify(start.body)}`);
  const attemptId = start.body.id;
  const detail = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}`, { jar: studentJar });
  for (const item of detail.body.items) {
    await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/items/${item.itemId}/answer`, {
      method: "PATCH",
      jar: studentJar,
      body: { selectedOptionIndex: 1 }, // правильный вариант ("goes") для всех пилотных заданий
    });
  }
  return request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
}

async function main() {
  const stamp = Date.now();
  console.log("\n=== Этап 13: сценарии пилотного тестирования ===\n");

  const teacherJar = await login(PILOT.teacher.email, PILOT_PASSWORD);
  const studentAJar = await login(PILOT.studentA.email, PILOT_PASSWORD);
  const studentBJar = await login(PILOT.studentB.email, PILOT_PASSWORD);
  const studentCJar = await login(PILOT.studentC.email, PILOT_PASSWORD);
  const meA = await request("/api/auth/me", { jar: studentAJar });
  const meB = await request("/api/auth/me", { jar: studentBJar });
  const meC = await request("/api/auth/me", { jar: studentCJar });

  const { group, course } = await findGroupAndCourse(teacherJar);
  check("Тестовая группа и курс найдены (созданы pilot:setup)", !!group && !!course, { group: group?.id, course: course?.id });

  // === Сценарий: Teacher Dashboard видит студента, Student Profile — результаты ===
  console.log("=== Dashboard и Student Profile ===");
  const dashboard = await request(`/api/teacher/groups/${group.id}/dashboard`, { jar: teacherJar });
  check("Dashboard тестовой группы загружается (200)", dashboard.status === 200, dashboard.body);
  const ids = (dashboard.body.students ?? []).map((s: any) => s.studentId);
  check("Dashboard видит всех трёх тестовых студентов (A, B, C)", [meA.body.id, meB.body.id, meC.body.id].every((id) => ids.includes(id)), ids);

  const profileA = await request(`/api/teacher/groups/${group.id}/students/${meA.body.id}`, { jar: teacherJar });
  check("Student Profile Student A открывается (200)", profileA.status === 200, profileA.body);
  check(
    "Student Profile Student A показывает завершённую диагностику именно этого студента",
    profileA.body?.header?.diagnosticStatus === "COMPLETED",
    profileA.body?.header
  );

  // === Сценарий: достижения и квалификационные баллы (Student B) ===========
  console.log("\n=== Достижения → квалификационные баллы: Student B (5 раз) + анти-дублирование ===");
  const events = [1, 2, 3, 4, 5].map((n) => ({ name: `Пилотная конференция ${n} (ПИЛОТ-ТЕСТ ${stamp})`, date: `2026-11-0${n}` }));
  let pointsSoFar = 0;
  for (const ev of events) {
    const { decision } = await giveQualificationPoint(studentBJar, teacherJar, group.id, ev.name, ev.date);
    pointsSoFar++;
    check(`Достижение «${ev.name}» подтверждено с баллом (qualificationPoint=1)`, decision.status === 200 && decision.body?.qualificationPoint === 1, decision.body);
  }
  const summaryAfter5 = await request(`/api/teacher/credit/groups/${group.id}/students/${meB.body.id}/summary`, { jar: teacherJar });
  check("После 5 подтверждённых мероприятий у Student B ровно 5 квалификационных баллов", summaryAfter5.body?.qualification?.points === 5, summaryAfter5.body?.qualification);

  console.log("\n--- Анти-дублирование: попытка второго балла за ПЕРВОЕ мероприятие ---");
  const duplicateClaim = await request("/api/student/achievements", {
    method: "POST",
    jar: studentBJar,
    body: { groupId: group.id, eventName: events[0].name, eventDate: events[0].date, organizer: "МГУ (ПИЛОТ-ТЕСТ)", eventType: "CONFERENCE", claimedResult: "PUBLISHED" },
  });
  await request(`/api/student/achievements/${duplicateClaim.body.id}/submit`, { method: "POST", jar: studentBJar });
  const duplicateDecision = await request(`/api/teacher/achievements/${duplicateClaim.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "CONFIRM" } });
  check(
    "Второй балл за то же мероприятие (другая заявка, то же название+дата) — заблокирован (409 DUPLICATE_POINT_BLOCKED)",
    duplicateDecision.status === 409 && duplicateDecision.body?.error === "DUPLICATE_POINT_BLOCKED",
    duplicateDecision.body
  );
  const summaryAfterDuplicate = await request(`/api/teacher/credit/groups/${group.id}/students/${meB.body.id}/summary`, { jar: teacherJar });
  check(
    "Баллов у Student B по-прежнему ровно 5 (не 6) — одно мероприятие даёт максимум 1 балл",
    summaryAfterDuplicate.body?.qualification?.points === 5,
    summaryAfterDuplicate.body?.qualification
  );

  // === Сценарий: зачёт — Student A (0 баллов) → устная часть обязательна ===
  console.log("\n=== Зачёт: Student A (0 баллов) → «Устная часть обязательна» ===");
  await submitAndConfirmDictionary(studentAJar, teacherJar, group.id);
  const testA = await takeCreditTest(studentAJar, group.id);
  check("Student A завершил зачётный тест", testA.status === 200, testA.body);
  // overallStatus/overallStatusLabel ("Итог") отдаёт именно
  // преподавательский маршрут сводки — студенческий GET /api/student/
  // credit/:groupId возвращает уже переинтерпретированный "topStatus"
  // (8-значную студенческую витрину), см. analytics/credit.ts.
  const creditA = await request(`/api/teacher/credit/groups/${group.id}/students/${meA.body.id}/summary`, { jar: teacherJar });
  check("Student A: квалификационных баллов — 0", creditA.body?.qualification?.points === 0, creditA.body?.qualification);
  check(
    "Student A: «Итог» — «Устная часть обязательна» (ORAL_REQUIRED)",
    creditA.body?.overallStatus === "ORAL_REQUIRED",
    { overallStatus: creditA.body?.overallStatus, overallStatusLabel: creditA.body?.overallStatusLabel }
  );

  // === Сценарий: зачёт — Student B (5 баллов) → устная часть освобождена ===
  console.log("\n=== Зачёт: Student B (5 баллов) → «Устная часть освобождена» ===");
  await submitAndConfirmDictionary(studentBJar, teacherJar, group.id);
  const testB = await takeCreditTest(studentBJar, group.id);
  check("Student B завершил зачётный тест", testB.status === 200, testB.body);
  const creditB = await request(`/api/teacher/credit/groups/${group.id}/students/${meB.body.id}/summary`, { jar: teacherJar });
  check("Student B: квалификационных баллов — 5", creditB.body?.qualification?.points === 5, creditB.body?.qualification);
  check("Student B: устная часть освобождена (oralPartExempt=true)", creditB.body?.qualification?.oralPartExempt === true, creditB.body?.qualification);
  check(
    "Student B: «Итог» — «Зачёт завершён» (COMPLETED, без устной части — освобождён баллами)",
    creditB.body?.overallStatus === "COMPLETED",
    { overallStatus: creditB.body?.overallStatus, overallStatusLabel: creditB.body?.overallStatusLabel }
  );
  check("Student B: устная часть зафиксирована как EXEMPTED (запись сохранена для истории)", creditB.body?.oral?.status === "EXEMPTED", creditB.body?.oral);

  // === Сценарий: Progress Check — Student C не может открыть сам =========
  console.log("\n=== Progress Check: Student C не может открыть до назначения преподавателем ===");
  const beforeAssign = await request(`/api/student/progress-check/${group.id}/test`, { jar: studentCJar });
  check("До назначения — попытка открыть Progress Check возвращает 404 NOT_ASSIGNED", beforeAssign.status === 404 && beforeAssign.body?.code === "NOT_ASSIGNED", beforeAssign.body);

  const assign = await request(`/api/teacher/progress-check/groups/${group.id}/assign`, {
    method: "POST",
    jar: teacherJar,
    body: { studentIds: [meC.body.id], periodStartAt: new Date().toISOString(), periodEndAt: null },
  });
  check("Преподаватель назначил Progress Check студенту C", assign.status === 201, assign.body);

  const afterAssign = await request(`/api/student/progress-check/${group.id}`, { jar: studentCJar });
  check("После назначения Student C видит, что диагностика назначена (assigned=true)", afterAssign.body?.assigned === true, afterAssign.body);
  const afterAssignOpen = await request(`/api/student/progress-check/${group.id}/test`, { jar: studentCJar });
  check("После назначения Student C МОЖЕТ открыть тест Progress Check (200, не 404)", afterAssignOpen.status === 200, afterAssignOpen.body);

  const studentDirectAssignAttempt = await request(`/api/teacher/progress-check/groups/${group.id}/assign`, {
    method: "POST",
    jar: studentCJar,
    body: { studentIds: [meC.body.id], periodStartAt: new Date().toISOString() },
  });
  check("Student C не может назначить Progress Check сам себе (403)", studentDirectAssignAttempt.status === 403, studentDirectAssignAttempt.body);

  await prisma.$disconnect();
  summarize();
}

main().catch(async (err) => {
  console.error("Скрипт сценариев завершился с ошибкой:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
