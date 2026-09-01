/**
 * Критическая проверка Этапа 10 (ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА — Progress
 * Check). Реальные HTTP-запросы к работающему backend.
 *
 * Покрывает: назначение только преподавателем (студент не может ни
 * создать попытку сам, ни пройти раньше срока, ни изменить результат,
 * ни переоткрыть завершённую попытку); Form A vs Form B (разные
 * задания, тот же охват навыков); сравнение "СТАРТ → СЕЙЧАС" (навыки,
 * самооценка/мотивация/самостоятельность, цели, достижения); историю
 * (Start Diagnostic не переписывается); защиту от гонки на уровне БД;
 * изоляцию доступа.
 *
 * Запуск: npm run verify:progress-check (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";
import { getVisibleQuestions, hasAnswer, type QuestionDef } from "../src/questionnaire/definition";
import { DIAGNOSTIC_ITEMS } from "../src/diagnostic/itemBank";
import { DIAGNOSTIC_ITEMS_B } from "../src/diagnostic/itemBankB";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

function defaultValueFor(q: QuestionDef): unknown {
  switch (q.type) {
    case "TEXT":
    case "TEXTAREA":
      return "Тестовый ответ.";
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

async function setup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  const teacher = await registerUser(teacherJar, `teacher-pc-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год P ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс P ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа P ${suffix} ${stamp}`, courseId: course.body.id } });

  const studentJar: CookieJar = {};
  const student = await registerUser(studentJar, `student-pc-${suffix}-${stamp}@example.com`, "Password123!", "STUDENT");
  await request("/api/student/groups/join", { method: "POST", jar: studentJar, body: { code: group.body.joinCode.code } });

  return { teacherJar, teacher, studentJar, student, group: group.body, course: course.body };
}

// --- Стартовая анкета (Start Questionnaire) --------------------------------

async function fillStartQuestionnaire(studentJar: CookieJar, groupId: string, overrides: Record<string, unknown>) {
  const start = await request("/api/student/questionnaire/attempts", { method: "POST", jar: studentJar, body: { groupId } });
  const attemptId = start.body.id;
  for (const [code, value] of Object.entries(overrides)) {
    await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, { method: "PUT", jar: studentJar, body: { code, value } });
  }
  for (let pass = 0; pass < 6; pass++) {
    const attempt = (await request(`/api/student/questionnaire/attempts/${attemptId}`, { jar: studentJar })).body;
    const answers = attempt.answers as Record<string, unknown>;
    const visible = getVisibleQuestions(answers);
    const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length === 0) break;
    for (const q of missing) {
      if (q.code in overrides) continue;
      await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, { method: "PUT", jar: studentJar, body: { code: q.code, value: defaultValueFor(q) } });
    }
  }
  const completed = await request(`/api/student/questionnaire/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить стартовую анкету: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

// --- Стартовая диагностика (Form A), заданная точность по навыку ----------

async function completeStartDiagnostic(studentJar: CookieJar, groupId: string, wrongPerSkill: Record<string, number>) {
  const start = await request("/api/student/diagnostic/attempts", { method: "POST", jar: studentJar, body: { groupId } });
  const attemptId = start.body.id;
  const wrongLeft = { ...wrongPerSkill };
  for (const item of DIAGNOSTIC_ITEMS) {
    const makeWrong = (wrongLeft[item.skill] ?? 0) > 0;
    if (makeWrong) wrongLeft[item.skill]--;
    const selected = makeWrong ? (item.correctOptionIndex + 1) % item.optionsEn.length : item.correctOptionIndex;
    await request(`/api/student/diagnostic/attempts/${attemptId}/items/${item.id}/answer`, { method: "POST", jar: studentJar, body: { selectedOptionIndex: selected } });
  }
  const completed = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить стартовую диагностику: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

// --- Промежуточный тест (Form B) -------------------------------------------

async function completeProgressTest(studentJar: CookieJar, groupId: string, wrongPerSkill: Record<string, number> = {}) {
  const open = await request(`/api/student/progress-check/${groupId}/test`, { jar: studentJar });
  const wrongLeft = { ...wrongPerSkill };
  for (const item of DIAGNOSTIC_ITEMS_B) {
    const makeWrong = (wrongLeft[item.skill] ?? 0) > 0;
    if (makeWrong) wrongLeft[item.skill]--;
    const selected = makeWrong ? (item.correctOptionIndex + 1) % item.optionsEn.length : item.correctOptionIndex;
    await request(`/api/student/progress-check/${groupId}/test/items/${item.id}/answer`, { method: "PATCH", jar: studentJar, body: { selectedOptionIndex: selected } });
  }
  const completed = await request(`/api/student/progress-check/${groupId}/test/complete`, { method: "POST", jar: studentJar });
  return { open, completed };
}

async function fillProgressQuestionnaire(studentJar: CookieJar, groupId: string, overrides: Record<string, unknown>) {
  const open = await request(`/api/student/progress-check/${groupId}/questionnaire`, { jar: studentJar });
  for (const [code, value] of Object.entries(overrides)) {
    await request(`/api/student/progress-check/${groupId}/questionnaire/answers`, { method: "PUT", jar: studentJar, body: { code, value } });
  }
  for (let pass = 0; pass < 6; pass++) {
    const attempt = (await request(`/api/student/progress-check/${groupId}/questionnaire`, { jar: studentJar })).body;
    const answers = attempt.answers as Record<string, unknown>;
    const visible = getVisibleQuestions(answers);
    const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length === 0) break;
    for (const q of missing) {
      if (q.code in overrides) continue;
      await request(`/api/student/progress-check/${groupId}/questionnaire/answers`, { method: "PUT", jar: studentJar, body: { code: q.code, value: defaultValueFor(q) } });
    }
  }
  return request(`/api/student/progress-check/${groupId}/questionnaire/complete`, { method: "POST", jar: studentJar });
}

async function giveConfirmedAchievement(studentJar: CookieJar, teacherJar: CookieJar, groupId: string, eventName: string) {
  const created = await request("/api/student/achievements", { method: "POST", jar: studentJar, body: { groupId, eventName, eventDate: "2026-11-01", organizer: "МГУ", eventType: "CONFERENCE", claimedResult: "PRIZE_PLACE" } });
  await request(`/api/student/achievements/${created.body.id}/submit`, { method: "POST", jar: studentJar });
  return request(`/api/teacher/achievements/${created.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "CONFIRM" } });
}

async function main() {
  const stamp = Date.now();

  // === Форма A vs Форма B — разный контент, тот же охват навыков =========
  console.log("Форма A vs Форма B");
  const idsA = new Set(DIAGNOSTIC_ITEMS.map((i) => i.id));
  const idsB = new Set(DIAGNOSTIC_ITEMS_B.map((i) => i.id));
  const overlap = [...idsA].filter((id) => idsB.has(id));
  check("Form A и Form B не пересекаются по id заданий", overlap.length === 0, overlap);
  check("Form B — тот же объём (32 задания)", DIAGNOSTIC_ITEMS_B.length === DIAGNOSTIC_ITEMS.length, DIAGNOSTIC_ITEMS_B.length);
  for (const skill of ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"]) {
    const countA = DIAGNOSTIC_ITEMS.filter((i) => i.skill === skill).length;
    const countB = DIAGNOSTIC_ITEMS_B.filter((i) => i.skill === skill).length;
    check(`Form B: тот же охват навыка ${skill} (${countA} заданий)`, countA === countB, { countA, countB });
  }

  // === Сценарий: студент не может ни назначить сам, ни начать раньше срока ===
  console.log("\nДоступ: только преподаватель назначает");
  const t = await setup(stamp, "a");

  const studentTriesAssign = await request(`/api/teacher/progress-check/groups/${t.group.id}/assign`, {
    method: "POST",
    jar: t.studentJar,
    body: { studentIds: [t.student.id], periodStartAt: new Date().toISOString() },
  });
  check("Студент не может вызвать маршрут назначения — 403", studentTriesAssign.status === 403, studentTriesAssign);

  const beforeAssign = await request(`/api/student/progress-check/${t.group.id}`, { jar: t.studentJar });
  check("До назначения: assigned=false", beforeAssign.status === 200 && beforeAssign.body.assigned === false, beforeAssign.body);

  const testBeforeAssign = await request(`/api/student/progress-check/${t.group.id}/test`, { jar: t.studentJar });
  check("Тест недоступен до назначения — 404 NOT_ASSIGNED", testBeforeAssign.status === 404 && testBeforeAssign.body.code === "NOT_ASSIGNED", testBeforeAssign.body);

  const futurePeriod = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const assignFuture = await request(`/api/teacher/progress-check/groups/${t.group.id}/assign`, { method: "POST", jar: t.teacherJar, body: { studentIds: [t.student.id], periodStartAt: futurePeriod } });
  check("Преподаватель назначает с будущим периодом — 201", assignFuture.status === 201 && assignFuture.body.results[0].outcome === "ASSIGNED", assignFuture.body);

  const testTooEarly = await request(`/api/student/progress-check/${t.group.id}/test`, { jar: t.studentJar });
  check("Студент не может пройти раньше назначенного срока — 403 TOO_EARLY", testTooEarly.status === 403 && testTooEarly.body.code === "TOO_EARLY", testTooEarly.body);

  const reassign = await request(`/api/teacher/progress-check/groups/${t.group.id}/assign`, { method: "POST", jar: t.teacherJar, body: { studentIds: [t.student.id], periodStartAt: futurePeriod } });
  check("Повторное назначение — идемпотентно (ALREADY_ASSIGNED)", reassign.status === 201 && reassign.body.results[0].outcome === "ALREADY_ASSIGNED", reassign.body);

  // === Основной сценарий: полный workflow + сравнение СТАРТ → СЕЙЧАС ======
  console.log("\nПолный workflow и сравнение «Старт → Сейчас»");
  const m = await setup(stamp, "main");

  // Достижение №1 — ДО завершения Start Diagnostic (должно войти в "на старте").
  const ach1 = await giveConfirmedAchievement(m.studentJar, m.teacherJar, m.group.id, `Конференция до старта ${stamp}`);
  check("Достижение №1 подтверждено с баллом (до старта)", ach1.status === 200 && ach1.body.qualificationPoint === 1, ach1.body);

  // Q15/Q16/Q21/Q22 — SINGLE_CHOICE (не числовая шкала): значения ниже
  // подобраны так, чтобы ordinalScore (analytics/scoring.ts) дал ровно
  // 2 балла на старте и 4 — в промежуточной анкете (см. направление
  // ASC/DESC и текст вариантов там же).
  await fillStartQuestionnaire(m.studentJar, m.group.id, {
    Q12: { reading: 2, listening: 2, speaking: 2, writing: 2, professional: 2 },
    Q15: "dont_like_but_willing", // DESC, индекс 3 из 5 → балл 2
    Q16: "probably_no", // DESC, индекс 3 из 5 → балл 2
    Q21: "up_to_30", // ASC, индекс 1 из 5 → балл 2
    Q22: "irregularly", // DESC, индекс 3 из 5 → балл 2
    Q37: ["improve_general_english", "stop_fearing_english"],
  });
  // Половина заданий каждого навыка — намеренно неверно (Grammar 6/12,
  // Vocabulary 5/10, Reading 3/6, Listening 2/4 неверных → каждый навык 50%).
  await completeStartDiagnostic(m.studentJar, m.group.id, { GRAMMAR: 6, VOCABULARY: 5, READING: 3, LISTENING: 2 });

  // Достижение №2 — ПОСЛЕ завершения Start Diagnostic (должно войти
  // только в "сейчас", не в "на старте").
  const ach2 = await giveConfirmedAchievement(m.studentJar, m.teacherJar, m.group.id, `Конференция после старта ${stamp}`);
  check("Достижение №2 подтверждено с баллом (после старта)", ach2.status === 200 && ach2.body.qualificationPoint === 1, ach2.body);

  const immediatePeriod = new Date(Date.now() - 1000).toISOString();
  const assignNow = await request(`/api/teacher/progress-check/groups/${m.group.id}/assign`, { method: "POST", jar: m.teacherJar, body: { studentIds: [m.student.id], periodStartAt: immediatePeriod } });
  check("Назначение с периодом «уже открыт» — 201", assignNow.status === 201, assignNow.body);

  const overviewOpen = await request(`/api/student/progress-check/${m.group.id}`, { jar: m.studentJar });
  check("После назначения с открытым периодом: openNow=true", overviewOpen.body.openNow === true, overviewOpen.body);

  // Все задания — верно (100% по каждому навыку) → чистая дельта +50 по каждому.
  const { open: testOpen, completed: testCompleted } = await completeProgressTest(m.studentJar, m.group.id);
  check("Попытка Form B открыта, статус транзитировал в IN_PROGRESS", testOpen.body.status === "IN_PROGRESS", testOpen.body.status);
  check("Промежуточный тест завершён: 32/32", testCompleted.status === 200 && testCompleted.body.overallCorrect === 32 && testCompleted.body.overallTotal === 32, testCompleted.body);

  const questCompleted = await fillProgressQuestionnaire(m.studentJar, m.group.id, {
    Q12: { reading: 4, listening: 4, speaking: 4, writing: 4, professional: 4 },
    Q15: "understand_need_medium_interest", // DESC, индекс 1 из 5 → балл 4
    Q16: "probably_yes", // DESC, индекс 1 из 5 → балл 4
    Q21: "h1_2", // ASC, индекс 3 из 5 → балл 4
    Q22: "clear_instruction", // DESC, индекс 1 из 5 → балл 4
    Q37: ["improve_general_english", "pass_tests"],
  });
  check("Промежуточная анкета завершена", questCompleted.status === 200 && questCompleted.body.status === "COMPLETED", questCompleted.body);

  // Повторное завершение теста — идемпотентно, не пересчитывает.
  const recompleteTest = await request(`/api/student/progress-check/${m.group.id}/test/complete`, { method: "POST", jar: m.studentJar });
  check("Повторное завершение теста — тот же результат (идемпотентно)", recompleteTest.status === 200 && recompleteTest.body.overallCorrect === 32, recompleteTest.body);

  // Изменить ответ после завершения — нельзя.
  const firstItemB = DIAGNOSTIC_ITEMS_B[0];
  const changeAfterComplete = await request(`/api/student/progress-check/${m.group.id}/test/items/${firstItemB.id}/answer`, { method: "PATCH", jar: m.studentJar, body: { selectedOptionIndex: 0 } });
  check("Изменить ответ завершённого теста нельзя — 409", changeAfterComplete.status === 409 && changeAfterComplete.body.error === "ATTEMPT_COMPLETED", changeAfterComplete.body);

  // --- Сравнение "Старт → Сейчас" (собственный результат студента) -------
  const summary = await request(`/api/student/progress-check/${m.group.id}/summary`, { jar: m.studentJar });
  check("summary: progressStatus = COMPLETED", summary.body.progressStatus === "COMPLETED", summary.body.progressStatus);
  for (const row of summary.body.skillTable) {
    check(`Навык ${row.skill}: старт 50%, сейчас 100%, изменение +50`, row.start === 50 && row.now === 100 && row.changePoints === 50, row);
  }
  check("Самооценка: старт 2, сейчас 4, изменение +2", summary.body.selfAssessment.start === 2 && summary.body.selfAssessment.now === 4 && summary.body.selfAssessment.change === 2, summary.body.selfAssessment);
  check("Мотивация: старт 2, сейчас 4, изменение +2", summary.body.motivation.start === 2 && summary.body.motivation.now === 4 && summary.body.motivation.change === 2, summary.body.motivation);
  check("Самостоятельность: старт 2, сейчас 4, изменение +2", summary.body.autonomy.start === 2 && summary.body.autonomy.now === 4 && summary.body.autonomy.change === 2, summary.body.autonomy);

  const goals = summary.body.goals;
  check("Цели: осталась 'improve_general_english'", goals.kept.some((g: any) => g.code === "improve_general_english") && goals.kept.length === 1, goals);
  check("Цели: добавилась 'pass_tests'", goals.added.some((g: any) => g.code === "pass_tests") && goals.added.length === 1, goals);
  check("Цели: пропала 'stop_fearing_english'", goals.removed.some((g: any) => g.code === "stop_fearing_english") && goals.removed.length === 1, goals);

  check("Достижения: на старте 1, сейчас 2, изменение +1", summary.body.achievements.atStart === 1 && summary.body.achievements.now === 2 && summary.body.achievements.change === 1, summary.body.achievements);

  // --- Тот же расчёт доступен и преподавателю (единая функция) -----------
  const teacherSummary = await request(`/api/teacher/progress-check/groups/${m.group.id}/students/${m.student.id}/summary`, { jar: m.teacherJar });
  check("Сравнение преподавателя совпадает со студенческим (единая функция расчёта)", JSON.stringify(teacherSummary.body) === JSON.stringify(summary.body), { teacher: teacherSummary.body, student: summary.body });

  // --- Ростер группы отражает актуальный статус ---------------------------
  const roster = await request(`/api/teacher/progress-check/groups/${m.group.id}/roster`, { jar: m.teacherJar });
  const rosterRow = roster.body.find((r: any) => r.studentId === m.student.id);
  check("Ростер: startDiagnosticCompleted=true, status=COMPLETED", rosterRow?.startDiagnosticCompleted === true && rosterRow?.status === "COMPLETED", rosterRow);

  // === История: Start Diagnostic не переписан ===============================
  console.log("\nИстория: Start Diagnostic не переписан");
  const startAttemptDb = await prisma.diagnosticAttempt.findFirst({ where: { studentId: m.student.id, groupId: m.group.id, kind: "START" }, include: { result: true } });
  check("Start Diagnostic остаётся COMPLETED с исходным результатом (50%)", startAttemptDb?.status === "COMPLETED" && startAttemptDb?.result?.overallPercentage === 50, startAttemptDb?.result);
  const progressAttemptDb = await prisma.diagnosticAttempt.findFirst({ where: { studentId: m.student.id, groupId: m.group.id, kind: "PROGRESS" } });
  check("Progress — отдельная строка (не тот же id, что Start)", progressAttemptDb?.id !== startAttemptDb?.id, { start: startAttemptDb?.id, progress: progressAttemptDb?.id });
  check("Progress хранит assignedByTeacherId/periodStartAt (назначение зафиксировано)", progressAttemptDb?.assignedByTeacherId === m.teacher.id && progressAttemptDb?.periodStartAt !== null, progressAttemptDb);

  // === Защита от гонки на уровне БД ==========================================
  console.log("\nЗащита от гонки на уровне БД");
  const raceStudentJar: CookieJar = {};
  const raceStudent = await registerUser(raceStudentJar, `student-pc-race-${stamp}@example.com`, "Password123!", "STUDENT");
  await request("/api/student/groups/join", { method: "POST", jar: raceStudentJar, body: { code: m.group.joinCode.code } });
  // academicYearId — снимок-строка (не FK, см. schema.prisma), поэтому
  // для проверки самого уникального индекса (studentId+groupId+kind)
  // достаточно любого непустого значения.
  const raceData = { studentId: raceStudent.id, groupId: m.group.id, courseId: m.course.id, academicYearId: "race-test", kind: "PROGRESS", status: "ASSIGNED" };
  await prisma.diagnosticAttempt.create({ data: raceData as any });
  let raceBlocked = false;
  try {
    await prisma.diagnosticAttempt.create({ data: raceData as any });
  } catch (err: any) {
    raceBlocked = err?.code === "P2002";
  }
  check("Прямая повторная попытка того же kind в обход HTTP отклонена БД (P2002)", raceBlocked);

  // === Изоляция доступа =======================================================
  console.log("\nИзоляция доступа");
  const otherTeacherJar: CookieJar = {};
  await registerUser(otherTeacherJar, `teacher-pc-other-${stamp}@example.com`, "Password123!", "TEACHER");
  const crossRoster = await request(`/api/teacher/progress-check/groups/${m.group.id}/roster`, { jar: otherTeacherJar });
  check("Чужой преподаватель не видит ростер группы — 404", crossRoster.status === 404, crossRoster);
  const crossAssign = await request(`/api/teacher/progress-check/groups/${m.group.id}/assign`, { method: "POST", jar: otherTeacherJar, body: { studentIds: [m.student.id], periodStartAt: new Date().toISOString() } });
  check("Чужой преподаватель не может назначить диагностику — 404", crossAssign.status === 404, crossAssign);
  const crossSummary = await request(`/api/teacher/progress-check/groups/${m.group.id}/students/${m.student.id}/summary`, { jar: otherTeacherJar });
  check("Чужой преподаватель не видит сравнение — 404", crossSummary.status === 404, crossSummary);

  const otherStudentJar: CookieJar = {};
  await registerUser(otherStudentJar, `student-pc-other-${stamp}@example.com`, "Password123!", "STUDENT");
  await request("/api/student/groups/join", { method: "POST", jar: otherStudentJar, body: { code: m.group.joinCode.code } });
  const crossStudentTest = await request(`/api/student/progress-check/${m.group.id}/test`, { jar: otherStudentJar });
  check("Студент без назначения не видит попытку другого студента — 404", crossStudentTest.status === 404, crossStudentTest.body);

  const noAuth = await request(`/api/student/progress-check/${m.group.id}`, {});
  check("Без токена — 401", noAuth.status === 401, noAuth);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
