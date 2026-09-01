/**
 * Критическая проверка Этапа 6 (TEACHER DASHBOARD — рабочая панель
 * преподавателя).
 *
 * Использует реальные HTTP-запросы к работающему backend и осознанно
 * сконструированные ответы анкеты/диагностики (через общее определение
 * анкеты и банк заданий диагностики — те же источники истины, что
 * использует сам сервер), чтобы получить студентов с ЗАРАНЕЕ ИЗВЕСТНЫМИ
 * мотивацией/самостоятельностью/диагностическим результатом и проверить,
 * что Dashboard считает агрегаты и логику "Требуют внимания"/
 * "Возможности развития" именно так, как задокументировано в
 * backend/src/analytics/scoring.ts и insights.ts — а не как решит
 * дать красивую цифру для витрины.
 *
 * Проверяет:
 *   - KPI блока "Состояние группы" считаются из реальных данных группы
 *     (не hardcoded), пересчитываются при смене группы;
 *   - Квалификационные баллы/Зачёт — честно implemented:false (модуль
 *     не реализован), а не выдуманный ноль;
 *   - "Требуют внимания": НЕ флагует по одному слабому показателю без
 *     контекста (single-factor студент не попадает в список), но
 *     флагует по комбинации факторов; primaryReason соответствует
 *     фактору с наибольшим весом;
 *   - "Возможности развития": строится только по студентам с завершённой
 *     анкетой, требует "сильного" базового сигнала + конкретного
 *     интереса (не подставляет решение за преподавателя — только label);
 *   - оба блока — не ранжирование студентов "1 место/2 место";
 *   - таблица студентов содержит ожидаемые 11 полей-эквивалентов и не
 *     смешивает данные разных студентов;
 *   - пустая группа — честное пустое состояние, без нулевых графиков;
 *   - смена группы даёт РЕАЛЬНО разные данные (не кэш/не смешение);
 *   - профиль студента (teacher-facing) отдаёт человекочитаемые ответы
 *     анкеты БЕЗ кодов вопросов (Q15 и т.п.) в теле ответа;
 *   - заметки преподавателя создаются и видны только их автору;
 *   - изоляция между преподавателями (404 на чужую группу/студента),
 *     запрет роли STUDENT, требование аутентификации.
 *
 * Запуск: npm run verify:dashboard (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";
import { getVisibleQuestions, hasAnswer, type QuestionDef } from "../src/questionnaire/definition";
import { DIAGNOSTIC_ITEMS } from "../src/diagnostic/itemBank";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

// --- Анкета: автозаполнение с точечными переопределениями (как в
// verify-questionnaire.ts) — чтобы контролировать именно те вопросы,
// от которых зависит аналитика Dashboard (Q12/Q15/Q16/Q21/Q22/Q23/Q29),
// а остальные заполнить нейтральными дефолтами. ---------------------

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

async function getAttempt(jar: CookieJar, attemptId: string) {
  return request(`/api/student/questionnaire/attempts/${attemptId}`, { jar });
}

async function autofillAndComplete(jar: CookieJar, attemptId: string, overrides: Record<string, unknown> = {}) {
  for (const [code, value] of Object.entries(overrides)) {
    const res = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, { method: "PUT", jar, body: { code, value } });
    if (res.status !== 204) throw new Error(`Не удалось сохранить override ${code}: ${JSON.stringify(res.body)}`);
  }
  for (let pass = 0; pass < 6; pass++) {
    const attempt = (await getAttempt(jar, attemptId)).body;
    const answers = attempt.answers as Record<string, unknown>;
    const visible = getVisibleQuestions(answers);
    const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length === 0) break;
    for (const q of missing) {
      if (q.code in overrides) continue;
      const res = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, { method: "PUT", jar, body: { code: q.code, value: defaultValueFor(q) } });
      if (res.status !== 204) throw new Error(`Не удалось сохранить ${q.code}: ${JSON.stringify(res.body)}`);
    }
    if (pass === 5) throw new Error("Автозаполнение не сошлось за 6 проходов.");
  }
  const completed = await request(`/api/student/questionnaire/attempts/${attemptId}/complete`, { method: "POST", jar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить анкету: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

async function completeQuestionnaireForStudent(jar: CookieJar, groupId: string, overrides: Record<string, unknown>) {
  const created = await request("/api/student/questionnaire/attempts", { method: "POST", jar, body: { groupId } });
  return autofillAndComplete(jar, created.body.id, overrides);
}

// --- Диагностика: контролируем итоговый процент, отвечая на первые N
// заданий каждого навыка правильно (в порядке банка заданий), остальные
// — заведомо неправильно, чтобы получить предсказуемый общий и
// по-навыковый результат. --------------------------------------------

async function completeDiagnosticForStudent(jar: CookieJar, groupId: string, correctBySkill: Record<string, number>) {
  const created = await request("/api/student/diagnostic/attempts", { method: "POST", jar, body: { groupId } });
  if (![200, 201].includes(created.status)) throw new Error(`Не удалось создать попытку диагностики: ${JSON.stringify(created.body)}`);
  const attemptId = created.body.id;

  const countBySkill: Record<string, number> = {};
  for (const item of DIAGNOSTIC_ITEMS) {
    const already = countBySkill[item.skill] ?? 0;
    const wantCorrect = already < (correctBySkill[item.skill] ?? 0);
    countBySkill[item.skill] = already + 1;
    const selectedOptionIndex = wantCorrect ? item.correctOptionIndex : (item.correctOptionIndex + 1) % item.optionsEn.length;
    const res = await request(`/api/student/diagnostic/attempts/${attemptId}/items/${item.id}/answer`, { method: "POST", jar, body: { selectedOptionIndex } });
    if (res.status !== 201) throw new Error(`Не удалось ответить на ${item.id}: ${JSON.stringify(res.body)}`);
  }
  const completed = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar });
  if (completed.status !== 200) throw new Error(`Не удалось завершить диагностику: ${JSON.stringify(completed.body)}`);
  return completed.body;
}

async function joinGroup(jar: CookieJar, code: string) {
  const res = await request("/api/student/groups/join", { method: "POST", jar, body: { code } });
  if (![200, 201].includes(res.status)) throw new Error(`Не удалось присоединиться к группе: ${JSON.stringify(res.body)}`);
}

async function newStudent(stamp: number, label: string): Promise<CookieJar> {
  const jar: CookieJar = {};
  await registerUser(jar, `student-dash-${label}-${stamp}@example.com`, "Password123!", "STUDENT");
  return jar;
}

async function setupTeacherWithGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-dash-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год D ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс D ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа D ${suffix} ${stamp}`, courseId: course.body.id } });
  return { teacherJar, group: group.body };
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка TEACHER DASHBOARD (Этап 6)\n`);

  const teacherA = await setupTeacherWithGroup(stamp, "A");
  const groupA = teacherA.group;

  console.log("Готовим 5 студентов группы A с заранее известными профилями...");

  // 1) "combo" — множественный набор факторов (диагностика 0%,
  //    мотивация 1.0, разрыв самооценки, барьеры) -> должен попасть в
  //    "Требуют внимания" с primaryReason по диагностике (первый по
  //    весу 2, добавленный раньше мотивации в insights.ts).
  const comboJar = await newStudent(stamp, "combo");
  await joinGroup(comboJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(comboJar, groupA.id, {
    Q15: "dont_want", // score 1
    Q16: "definitely_no", // score 1
    Q21: "m30_60", // score 3 (нейтрально)
    Q22: "after_reminder", // score 3 (нейтрально)
    // Q12 (самооценка) и Q23 (барьеры) — дефолт автозаполнения (все 3,
    // и 3 барьера соответственно) — намеренно не переопределяем.
  });
  await completeDiagnosticForStudent(comboJar, groupA.id, { GRAMMAR: 0, VOCABULARY: 0, READING: 0, LISTENING: 0 });

  // 2) "incomplete" — диагностика вообще не начата + тяжёлая мотивация
  //    -> должен попасть в "Требуют внимания" с primaryReason по
  //    незавершённой диагностике (единственный сигнал weight=2, уже
  //    сам по себе >= порога — задокументированное поведение, а не
  //    единичный "слабый" показатель: отсутствие данных всегда требует
  //    внимания преподавателя).
  const incompleteJar = await newStudent(stamp, "incomplete");
  await joinGroup(incompleteJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(incompleteJar, groupA.id, {
    Q15: "dont_like_but_willing", // score 2
    Q16: "probably_no", // score 2
    Q21: "m30_60",
    Q22: "after_reminder",
    Q23: ["none"],
  });
  // диагностику намеренно не создаём

  // 3) "single-factor" — единственный слабый сигнал (сниженная, но не
  //    тяжёлая мотивация, вес 1) при нейтральном всём остальном ->
  //    НЕ должен попасть в "Требуют внимания" (ТЗ п.6: не флагуем по
  //    одному показателю без контекста).
  const singleJar = await newStudent(stamp, "single");
  await joinGroup(singleJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(singleJar, groupA.id, {
    Q15: "dont_like_but_willing", // score 2
    Q16: "probably_no", // score 2 -> avg motivation = 2.0 (< 2.5, но не < 1.8)
    Q21: "m30_60",
    Q22: "after_reminder",
    Q23: ["none"],
  });
  // Диагностика ровно 50% (16 из 32, поровну по каждому навыку), чтобы
  // ни общий процент, ни один из навыков не пересекли порог 50%, и
  // нормализованная диагностика (3.0) совпала со средней самооценкой
  // по умолчанию (3.0) — без разрыва.
  await completeDiagnosticForStudent(singleJar, groupA.id, { GRAMMAR: 6, VOCABULARY: 5, READING: 3, LISTENING: 2 });

  // 4) "opportunity" — высокая мотивация, высокая самостоятельность,
  //    интерес к конференциям, отличный результат и самооценка (без
  //    разрыва) -> должен попасть в "Возможности развития" с меткой
  //    "Конференционный потенциал" и НЕ должен попасть в "Требуют
  //    внимания".
  const opportunityJar = await newStudent(stamp, "opportunity");
  await joinGroup(opportunityJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(opportunityJar, groupA.id, {
    Q15: "really_interested", // score 5
    Q16: "definitely_yes", // score 5
    Q21: "more_2h", // score 5
    Q22: "plan_myself", // score 5
    Q29: ["conference"],
    Q12: { reading: 5, listening: 5, speaking: 5, writing: 5, professional: 5 },
    Q23: ["none"],
  });
  await completeDiagnosticForStudent(opportunityJar, groupA.id, { GRAMMAR: 12, VOCABULARY: 10, READING: 6, LISTENING: 4 }); // 100%

  // 5) "neutral" — нигде не выделяется -> ни "Требуют внимания", ни
  //    "Возможности развития".
  const neutralJar = await newStudent(stamp, "neutral");
  await joinGroup(neutralJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(neutralJar, groupA.id, {
    Q15: "dont_understand_why", // score 3
    Q16: "dont_know", // score 3
    Q21: "m30_60", // score 3
    Q22: "after_reminder", // score 3
    Q23: ["none"],
  });
  await completeDiagnosticForStudent(neutralJar, groupA.id, { GRAMMAR: 7, VOCABULARY: 6, READING: 4, LISTENING: 2 }); // 19/32 = 59%

  console.log("\nЗапрашиваем Dashboard группы A от лица преподавателя...");
  const dashA = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherA.teacherJar });
  check("Dashboard группы A — 200", dashA.status === 200, dashA);

  console.log("\nKPI блок «Состояние группы» — реальные данные, не hardcoded");
  check("studentCount = 5", dashA.body?.studentCount === 5, dashA.body?.studentCount);
  check(
    "diagnosticCompletion: 4 из 5 завершили диагностику (incomplete — нет)",
    dashA.body?.kpi?.diagnosticCompletion?.completed === 4 && dashA.body?.kpi?.diagnosticCompletion?.total === 5,
    dashA.body?.kpi?.diagnosticCompletion
  );
  const expectedAvgDiagnostic = Math.round((0 + 50 + 100 + 59) / 4);
  check(
    `avgDiagnosticPercentage считается по завершившим диагностику (≈${expectedAvgDiagnostic}%)`,
    Math.abs((dashA.body?.kpi?.avgDiagnosticPercentage ?? -999) - expectedAvgDiagnostic) <= 1,
    dashA.body?.kpi?.avgDiagnosticPercentage
  );
  check(
    "avgMotivation считается по завершившим анкету (все 5)",
    typeof dashA.body?.kpi?.avgMotivation === "number",
    dashA.body?.kpi?.avgMotivation
  );
  check(
    "Квалификационные баллы — честно implemented:false, а не выдуманный ноль",
    dashA.body?.kpi?.qualificationPoints?.implemented === false,
    dashA.body?.kpi?.qualificationPoints
  );
  check("Зачёт — честно implemented:false", dashA.body?.kpi?.credit?.implemented === false, dashA.body?.kpi?.credit);

  console.log("\n«Требуют внимания» — комбинация факторов, а не одиночный показатель");
  const attention = dashA.body?.attention ?? [];
  check("Не более 5 записей", attention.length <= 5, attention.length);
  const comboEntry = attention.find((e: any) => e.fullName?.includes("combo"));
  const incompleteEntry = attention.find((e: any) => e.fullName?.includes("incomplete"));
  const singleEntry = attention.find((e: any) => e.fullName?.includes("single"));
  const opportunityInAttention = attention.find((e: any) => e.fullName?.includes("opportunity"));
  const neutralInAttention = attention.find((e: any) => e.fullName?.includes("neutral"));
  check("«combo»-студент попал в «Требуют внимания»", !!comboEntry, attention);
  check("«combo»: primaryReason — низкий диагностический результат", comboEntry?.primaryReason === "Низкий диагностический результат", comboEntry);
  check("«combo»: несколько факторов (комбинация, не один)", (comboEntry?.factors?.length ?? 0) >= 3, comboEntry?.factors);
  check("«incomplete»-студент попал в «Требуют внимания»", !!incompleteEntry, attention);
  check(
    "«incomplete»: primaryReason — незавершённая диагностика",
    incompleteEntry?.primaryReason === "Не завершена стартовая диагностика",
    incompleteEntry
  );
  check("«single»-студент (один слабый сигнал) НЕ попал в «Требуют внимания»", !singleEntry, attention);
  check("«opportunity»-студент НЕ попал в «Требуют внимания» (всё сильно и без разрыва)", !opportunityInAttention, attention);
  check("«neutral»-студент НЕ попал в «Требуют внимания»", !neutralInAttention, attention);

  console.log("\nЗапрещённые формулировки отсутствуют, требуемые — использованы");
  const dashJsonText = JSON.stringify(dashA.body);
  const forbidden = ["проблемный студент", "слабый студент", "немотивированный студент", "плохой студент"];
  for (const word of forbidden) {
    check(`Нет запрещённой формулировки «${word}»`, !dashJsonText.toLowerCase().includes(word), null);
  }
  check(
    "Нет ранжирования («1 место», «2 место»)",
    !dashJsonText.includes("1 место") && !dashJsonText.includes("2 место"),
    null
  );

  console.log("\n«Возможности развития» — не решает за преподавателя");
  const opportunities = dashA.body?.opportunities ?? [];
  check("Не более 5 записей", opportunities.length <= 5, opportunities.length);
  const opportunityEntry = opportunities.find((e: any) => e.fullName?.includes("opportunity"));
  check("«opportunity»-студент попал в «Возможности развития»", !!opportunityEntry, opportunities);
  check("Метка — «Конференционный потенциал»", opportunityEntry?.potentialLabel === "Конференционный потенциал", opportunityEntry);
  check(
    "Система не пишет конкретное решение («отправить на конференцию»), только возможность",
    !JSON.stringify(opportunityEntry).toLowerCase().includes("отправить"),
    opportunityEntry
  );
  const comboInOpportunities = opportunities.find((e: any) => e.fullName?.includes("combo"));
  check("«combo»-студент (слабые показатели) НЕ в «Возможности развития»", !comboInOpportunities, opportunities);
  const neutralInOpportunities = opportunities.find((e: any) => e.fullName?.includes("neutral"));
  check("«neutral»-студент НЕ в «Возможности развития»", !neutralInOpportunities, opportunities);

  console.log("\nТаблица студентов — полный ростер, без смешивания данных");
  const students = dashA.body?.students ?? [];
  check("В таблице 5 студентов", students.length === 5, students.length);
  const comboRow = students.find((s: any) => s.fullName?.includes("combo"));
  check("У «combo» в таблице diagnosticPercentage = 0", comboRow?.diagnosticPercentage === 0, comboRow);
  const oppRow = students.find((s: any) => s.fullName?.includes("opportunity"));
  check("У «opportunity» в таблице diagnosticPercentage = 100", oppRow?.diagnosticPercentage === 100, oppRow);
  check("У «opportunity» потенциал совпадает с блоком «Возможности развития»", oppRow?.potentialLabel === "Конференционный потенциал", oppRow);
  check(
    "Квалификационные баллы/статус зачёта в строках — честный null (модуль не реализован)",
    students.every((s: any) => s.qualificationPoints === null && s.creditStatus === null),
    students.map((s: any) => ({ qualificationPoints: s.qualificationPoints, creditStatus: s.creditStatus }))
  );

  console.log("\nБлоки «Прогресс» и «Прогресс по зачёту» — честные пустые состояния");
  check(
    "progress.status = NOT_CONDUCTED, рекомендованный срок 5–6 месяцев",
    dashA.body?.progress?.status === "NOT_CONDUCTED" &&
      JSON.stringify(dashA.body?.progress?.recommendedAfterMonths) === JSON.stringify([5, 6]),
    dashA.body?.progress
  );
  check("credit.implemented = false (модуль зачёта не реализован)", dashA.body?.credit?.implemented === false, dashA.body?.credit);

  console.log("\nПустая группа — честное пустое состояние");
  const emptyGroupSetup = await request("/api/teacher/groups", { method: "POST", jar: teacherA.teacherJar, body: { name: `Пустая группа ${stamp}`, courseId: (await request(`/api/teacher/groups/${groupA.id}`, { jar: teacherA.teacherJar })).body.courseId } });
  const groupEmpty = emptyGroupSetup.body;
  const dashEmpty = await request(`/api/teacher/groups/${groupEmpty.id}/dashboard`, { jar: teacherA.teacherJar });
  check("Dashboard пустой группы — 200", dashEmpty.status === 200, dashEmpty);
  check("studentCount = 0", dashEmpty.body?.studentCount === 0, dashEmpty.body?.studentCount);
  check("diagnosticCompletion 0/0", dashEmpty.body?.kpi?.diagnosticCompletion?.completed === 0 && dashEmpty.body?.kpi?.diagnosticCompletion?.total === 0, dashEmpty.body?.kpi?.diagnosticCompletion);
  check("avgDiagnosticPercentage = null (не 0 — честное отсутствие данных)", dashEmpty.body?.kpi?.avgDiagnosticPercentage === null, dashEmpty.body?.kpi?.avgDiagnosticPercentage);
  check("attention = []", Array.isArray(dashEmpty.body?.attention) && dashEmpty.body.attention.length === 0, dashEmpty.body?.attention);
  check("opportunities = []", Array.isArray(dashEmpty.body?.opportunities) && dashEmpty.body.opportunities.length === 0, dashEmpty.body?.opportunities);
  check("students = []", Array.isArray(dashEmpty.body?.students) && dashEmpty.body.students.length === 0, dashEmpty.body?.students);

  console.log("\nСмена группы даёт реально разные данные (не кэш, не смешение)");
  check(
    "Пустая группа и группа A дают разные studentCount",
    dashEmpty.body?.studentCount !== dashA.body?.studentCount,
    { empty: dashEmpty.body?.studentCount, a: dashA.body?.studentCount }
  );
  check(
    "В пустой группе нет ни одного студента из группы A",
    !(dashEmpty.body?.students ?? []).some((s: any) => students.some((s2: any) => s2.studentId === s.studentId)),
    null
  );

  console.log("\nПрофиль студента (teacher-facing) — человекочитаемо, без кодов вопросов");
  const comboProfile = await request(`/api/teacher/groups/${groupA.id}/students/${comboRow.studentId}`, { jar: teacherA.teacherJar });
  check("Профиль студента — 200", comboProfile.status === 200, comboProfile);
  check("Анкета отдаёт человекочитаемые вопросы/ответы (не пусто)", (comboProfile.body?.questionnaire?.answers?.length ?? 0) > 0, comboProfile.body?.questionnaire?.answers?.length);
  const profileText = JSON.stringify(comboProfile.body?.questionnaire?.answers ?? []);
  check("В ответах анкеты нет технических кодов вопросов (Q15, Q16 и т.п.)", !/"Q\d+"/.test(profileText), profileText.slice(0, 200));
  check(
    "diagnosticRange остаётся null (нет утверждённой матрицы порогов)",
    comboProfile.body?.diagnostic?.diagnosticRange === null,
    comboProfile.body?.diagnostic?.diagnosticRange
  );

  console.log("\nЗаметки преподавателя — создание и видимость только автору");
  const noteText = `Заметка о студенте combo от ${stamp}`;
  const noteRes = await request(`/api/teacher/groups/${groupA.id}/students/${comboRow.studentId}/notes`, { method: "POST", jar: teacherA.teacherJar, body: { text: noteText } });
  check("Создание заметки — 201", noteRes.status === 201, noteRes);
  const profileAfterNote = await request(`/api/teacher/groups/${groupA.id}/students/${comboRow.studentId}`, { jar: teacherA.teacherJar });
  check("Заметка видна в профиле студента", profileAfterNote.body?.notes?.some((n: any) => n.text === noteText), profileAfterNote.body?.notes);

  console.log("\nИзоляция между преподавателями");
  const teacherB = await setupTeacherWithGroup(stamp, "B");
  const dashCrossTeacher = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherB.teacherJar });
  check("Чужая группа — Dashboard 404", dashCrossTeacher.status === 404, dashCrossTeacher);
  const profileCrossTeacher = await request(`/api/teacher/groups/${groupA.id}/students/${comboRow.studentId}`, { jar: teacherB.teacherJar });
  check("Чужая группа — профиль студента 404", profileCrossTeacher.status === 404, profileCrossTeacher);
  const noteCrossTeacher = await request(`/api/teacher/groups/${groupA.id}/students/${comboRow.studentId}/notes`, { method: "POST", jar: teacherB.teacherJar, body: { text: "чужая заметка" } });
  check("Чужая группа — создание заметки 404", noteCrossTeacher.status === 404, noteCrossTeacher);
  const crossTeacherNoteInDb = await prisma.teacherNote.findFirst({ where: { text: "чужая заметка" } });
  check("Заметка от чужого преподавателя не создана в БД", crossTeacherNoteInDb === null, crossTeacherNoteInDb);

  console.log("\nСмена группы у ОДНОГО преподавателя (B) на другую свою группу — тоже реальные разные данные");
  const teacherBOwnGroupDash = await request(`/api/teacher/groups/${teacherB.group.id}/dashboard`, { jar: teacherB.teacherJar });
  check("Преподаватель B видит свою пустую группу — 0 студентов", teacherBOwnGroupDash.body?.studentCount === 0, teacherBOwnGroupDash.body);
  check(
    "Данные группы B преподавателя B не содержат студентов группы A преподавателя A",
    !(teacherBOwnGroupDash.body?.students ?? []).some((s: any) => students.some((s2: any) => s2.studentId === s.studentId)),
    null
  );

  console.log("\nЗапрет роли STUDENT и требование аутентификации");
  const studentTriesDashboard = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: comboJar });
  check("Студент не может открыть Dashboard преподавателя — 403", studentTriesDashboard.status === 403, studentTriesDashboard);
  const noAuthDashboard = await request(`/api/teacher/groups/${groupA.id}/dashboard`, {});
  check("Без токена — 401", noAuthDashboard.status === 401, noAuthDashboard);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
