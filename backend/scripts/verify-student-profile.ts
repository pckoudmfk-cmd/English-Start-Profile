/**
 * Критическая проверка Этапа 7 (ПОЛНЫЙ ПРОФИЛЬ СТУДЕНТА).
 *
 * Реальные HTTP-запросы, осознанно сконструированные ответы анкеты и
 * диагностики (тот же приём, что и в verify-dashboard.ts) — чтобы
 * получить студента с заранее известными сильными/слабыми сторонами,
 * потенциалом, барьерами и целями и проверить, что backend строит из
 * них именно то, что задокументировано в analytics/profile.ts, а не
 * произвольный текст.
 *
 * Проверяет:
 *   - Обзор (GET .../students/:id) лёгкий: не содержит полных 45
 *     ответов анкеты и полной истории диагностики;
 *   - сильные стороны/зоны развития — не более 4, построены из
 *     реальных диагностики/самооценки/мотивации/барьеров;
 *   - потенциал — несколько меток одновременно, только когда есть
 *     основания; при их отсутствии список пуст (не выдумывается);
 *   - рекомендуемый фокус — не более 3, у каждой рекомендации есть
 *     обоснование (dataLines) и источник, без готовых решений вида
 *     "отправить на...";
 *   - самооценка по навыкам — сравнение с объективным результатом
 *     только там, где объективная пара есть (Reading/Listening),
 *     Speaking/Writing/Professional — explicit hasObjectiveComparison=false;
 *   - вкладка «Анкета» — полные ответы по всем 13 блокам, без кодов
 *     вопросов; вкладка «Диагностика» — Progress/Final отсутствуют
 *     честно (модуль не реализован), Письмо/Говорение — assessed:false;
 *   - цели — статус ставит только преподаватель, не меняется
 *     автоматически; попытка выставить статус цели, которую студент не
 *     выбирал — 404; изменение статуса пишет запись в историю
 *     (StudentGoalStatusEvent), повторная установка ТОГО ЖЕ статуса не
 *     плодит дубликат события;
 *   - заметки с типом (noteType) сохраняются и возвращаются;
 *   - изоляция между преподавателями на всех новых маршрутах.
 *
 * Запуск: npm run verify:student-profile (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";
import { getVisibleQuestions, hasAnswer, type QuestionDef } from "../src/questionnaire/definition";
import { DIAGNOSTIC_ITEMS } from "../src/diagnostic/itemBank";

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
  await registerUser(jar, `student-profile-${label}-${stamp}@example.com`, "Password123!", "STUDENT");
  return jar;
}

async function setupTeacherWithGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-profile-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год P ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс P ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа P ${suffix} ${stamp}`, courseId: course.body.id } });
  return { teacherJar, group: group.body };
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка ПОЛНОГО ПРОФИЛЯ СТУДЕНТА (Этап 7)\n`);

  const teacherA = await setupTeacherWithGroup(stamp, "A");
  const groupA = teacherA.group;

  console.log("Готовим «богатого» студента: сильные/слабые стороны, потенциал, барьеры, цели...");
  const richJar = await newStudent(stamp, "rich");
  await joinGroup(richJar, groupA.joinCode.code);
  await completeQuestionnaireForStudent(richJar, groupA.id, {
    Q12: { reading: 5, listening: 2, speaking: 5, writing: 3, professional: 3 }, // самооценка: сильное чтение/говорение, слабое аудирование
    Q13: 5, // высокий комфорт говорить, рискуя ошибиться -> потенциал публичного выступления
    Q15: "really_interested", // мотивация 5
    Q16: "definitely_yes",
    Q21: "more_2h", // самостоятельность 5
    Q22: "plan_myself",
    Q23: ["fear_speaking_public", "listening_difficulty"], // барьеры -> рекомендации
    Q28: ["public_speaking"],
    Q29: ["conference", "speaking_in_english"], // конференционный потенциал
    Q37: ["speak_confidently", "use_in_profession", "improve_general_english"], // 3 цели года
  });
  // Диагностика: Listening заведомо слабый (0/4=0%), остальное сильное —
  // должно совпасть с self-assessment (Listening self=2, слабое; Reading
  // self=5, но диагностика тоже покрывает Reading — не должно дублироваться
  // с self-assessment в списке сильных сторон).
  await completeDiagnosticForStudent(richJar, groupA.id, { GRAMMAR: 11, VOCABULARY: 9, READING: 6, LISTENING: 0 });

  console.log("\nGET Обзора — лёгкий (без полных 45 ответов и полной истории диагностики)");
  const dashAfterSetup = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherA.teacherJar });
  const richStudentId = dashAfterSetup.body.students[0].studentId;
  const overview = await request(`/api/teacher/groups/${groupA.id}/students/${richStudentId}`, { jar: teacherA.teacherJar });
  const studentId = overview.body?.student?.id;
  check("Обзор — 200", overview.status === 200, overview);
  check("Обзор НЕ содержит полного массива ответов анкеты (нет sections/answers[45])", overview.body?.questionnaire === undefined && overview.body?.sections === undefined, Object.keys(overview.body ?? {}));
  check("Обзор НЕ содержит полной истории диагностики (нет history[])", overview.body?.diagnostic?.history === undefined, overview.body?.diagnostic);

  console.log("\nKPI Обзора");
  check("diagnosticPercentage = 63% (26 из 41 верно... фактически 11+9+6+0=26 из 32)", overview.body?.kpi?.diagnosticPercentage === Math.round((26 / 32) * 100), overview.body?.kpi?.diagnosticPercentage);
  check("selfAssessment = 3,6 (среднее 5,2,5,3,3)", overview.body?.kpi?.selfAssessment === 3.6, overview.body?.kpi?.selfAssessment);
  check("motivation = 5", overview.body?.kpi?.motivation === 5, overview.body?.kpi?.motivation);
  check("autonomy = 5", overview.body?.kpi?.autonomy === 5, overview.body?.kpi?.autonomy);
  check(
    // Этап 8: модуль достижений реализован — баллы теперь реальные (0,
    // этот студент ничего не подтверждал в этом тесте), а не заглушка.
    "Квалификационные баллы — implemented:true, реальные данные (Этап 8)",
    overview.body?.kpi?.qualificationPoints?.implemented === true && overview.body?.kpi?.qualificationPoints?.points === 0,
    overview.body?.kpi?.qualificationPoints
  );

  console.log("\n«Обзор»: сильные/слабые стороны, потенциал, рекомендации");
  const strengths: string[] = overview.body?.overview?.strengths ?? [];
  const weaknesses: string[] = overview.body?.overview?.weaknesses ?? [];
  check("Сильных сторон не более 4", strengths.length <= 4, strengths);
  check("Слабых сторон не более 4", weaknesses.length <= 4, weaknesses);
  check("«Высокая мотивация» — в сильных сторонах", strengths.includes("Высокая мотивация"), strengths);
  check("«Высокая учебная самостоятельность» — в сильных сторонах", strengths.includes("Высокая учебная самостоятельность"), strengths);
  check(
    "Сильное чтение из диагностики есть, но не задвоено самооценкой (нет отдельной строки про самооценку чтения)",
    strengths.some((s) => s.includes("Чтение")) && !strengths.some((s) => s.toLowerCase().includes("самооценка") && s.includes("Чтение")),
    strengths
  );
  check("«Аудирование» — в зонах развития (диагностика 0%)", weaknesses.some((w) => w.includes("Аудирование")), weaknesses);

  const potentialBadges: string[] = overview.body?.overview?.potentialBadges ?? [];
  check("«Конференционный потенциал» — среди меток", potentialBadges.includes("Конференционный потенциал"), potentialBadges);
  check("«Потенциал публичного выступления» — среди меток", potentialBadges.includes("Потенциал публичного выступления"), potentialBadges);
  check(
    "Нет запрещённых меток без оснований (Проектный/Исследовательский — не отмечались)",
    !potentialBadges.includes("Проектный потенциал") && !potentialBadges.includes("Исследовательский потенциал"),
    potentialBadges
  );

  const recommendations: any[] = overview.body?.overview?.recommendations ?? [];
  check("Рекомендаций не более 3", recommendations.length <= 3 && recommendations.length > 0, recommendations);
  check(
    "Есть рекомендация развивать аудирование (слабый диагностический навык)",
    recommendations.some((r) => r.label.includes("Аудирование")),
    recommendations
  );
  check(
    "У каждой рекомендации есть обоснование (reasonLines) и источник",
    recommendations.every((r) => Array.isArray(r.reasonLines) && r.reasonLines.length > 0 && typeof r.source === "string" && r.source.length > 0),
    recommendations
  );
  check(
    "Рекомендации не содержат готовых решений вида «отправить на…»",
    !JSON.stringify(recommendations).toLowerCase().includes("отправить"),
    recommendations
  );

  console.log("\nСамооценка по навыкам — сравнение только там, где есть объективная пара");
  const selfDetail: any[] = overview.body?.selfAssessmentDetail ?? [];
  check("5 пунктов самооценки (Чтение/Аудирование/Говорение/Письмо/Проф.)", selfDetail.length === 5, selfDetail);
  const readingDetail = selfDetail.find((d) => d.skill === "Чтение");
  check("Чтение: hasObjectiveComparison = true, objectivePercentage не null", readingDetail?.hasObjectiveComparison === true && readingDetail?.objectivePercentage !== null, readingDetail);
  const speakingDetail = selfDetail.find((d) => d.skill === "Говорение");
  check("Говорение: hasObjectiveComparison = false (не тестируется диагностикой)", speakingDetail?.hasObjectiveComparison === false && speakingDetail?.objectivePercentage === null, speakingDetail);

  console.log("\nМотивация и обучение — барьеры и необходимая поддержка из реальных ответов");
  const motivationBlock = overview.body?.motivationAndLearning;
  check("Барьеры содержат «страх говорить перед группой»", motivationBlock?.barriers?.some((b: string) => b.includes("говорить перед группой")), motivationBlock?.barriers);

  console.log("\nЦели — статус ставит преподаватель, не автоматически");
  const goals: any[] = overview.body?.goals?.yearGoals ?? [];
  check("3 цели года, все со статусом NOT_STARTED по умолчанию", goals.length === 3 && goals.every((g) => g.status === "NOT_STARTED"), goals);
  check("Главная цель (Q38) выведена как есть", overview.body?.goals?.mainGoal === "Тестовый ответ.", overview.body?.goals?.mainGoal);

  const chosenGoal = goals[0].code;
  const setStatusReal = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/goals/${chosenGoal}`, { method: "PUT", jar: teacherA.teacherJar, body: { status: "IN_PROGRESS" } });
  check("Изменение статуса цели — 200", setStatusReal.status === 200 && setStatusReal.body?.status === "IN_PROGRESS", setStatusReal);

  const eventsAfterFirst = await prisma.studentGoalStatusEvent.count({ where: { groupId: groupA.id, studentId, goalCode: chosenGoal } });
  check("Запись в истории статуса цели создана", eventsAfterFirst === 1, eventsAfterFirst);

  const setSameStatusAgain = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/goals/${chosenGoal}`, { method: "PUT", jar: teacherA.teacherJar, body: { status: "IN_PROGRESS" } });
  check("Повторная установка ТОГО ЖЕ статуса — 200", setSameStatusAgain.status === 200, setSameStatusAgain);
  const eventsAfterSame = await prisma.studentGoalStatusEvent.count({ where: { groupId: groupA.id, studentId, goalCode: chosenGoal } });
  check("Повторная установка того же статуса НЕ плодит новую запись истории", eventsAfterSame === 1, eventsAfterSame);

  const notSelectedGoal = "understand_speech"; // студент не выбирал эту цель
  const setUnselectedGoal = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/goals/${notSelectedGoal}`, { method: "PUT", jar: teacherA.teacherJar, body: { status: "DONE" } });
  check("Статус для НЕ выбранной студентом цели — 404 GOAL_NOT_FOUND", setUnselectedGoal.status === 404 && setUnselectedGoal.body?.error === "GOAL_NOT_FOUND", setUnselectedGoal);

  console.log("\nВкладка «Анкета» — полные ответы по 13 блокам");
  const questionnaireTab = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/questionnaire`, { jar: teacherA.teacherJar });
  check("Вкладка «Анкета» — 200", questionnaireTab.status === 200, questionnaireTab);
  check("13 блоков", questionnaireTab.body?.sections?.length === 13, questionnaireTab.body?.sections?.length);
  const totalAnswered = questionnaireTab.body?.sections?.reduce((sum: number, s: any) => sum + s.items.length, 0) ?? 0;
  check("Есть ответы в нескольких блоках (не одна длинная простыня без структуры)", totalAnswered > 20, totalAnswered);
  check("Нет технических кодов вопросов в ответах", !/"Q\d+"/.test(JSON.stringify(questionnaireTab.body)), null);

  console.log("\nВкладка «Диагностика» — Start есть, Progress/Final честно отсутствуют");
  const diagnosticTab = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/diagnostic`, { jar: teacherA.teacherJar });
  check("Вкладка «Диагностика» — 200", diagnosticTab.status === 200, diagnosticTab);
  check("В истории только START (Progress/Final не реализованы)", diagnosticTab.body?.history?.length === 1 && diagnosticTab.body.history[0].kind === "START", diagnosticTab.body?.history);
  check("hasChangeSummary = false (нет Progress/Final, блок «Что изменилось?» не показывается)", diagnosticTab.body?.hasChangeSummary === false, diagnosticTab.body?.hasChangeSummary);
  const writingRow = diagnosticTab.body?.skillTable?.find((s: any) => s.skill === "WRITING");
  const speakingRow = diagnosticTab.body?.skillTable?.find((s: any) => s.skill === "SPEAKING");
  check("Письмо: assessed=false, start=null (не «0», честное «не оценивался»)", writingRow?.assessed === false && writingRow?.start === null, writingRow);
  check("Говорение: assessed=false, start=null", speakingRow?.assessed === false && speakingRow?.start === null, speakingRow);
  const listeningRow = diagnosticTab.body?.skillTable?.find((s: any) => s.skill === "LISTENING");
  check("Аудирование: assessed=true, start=0", listeningRow?.assessed === true && listeningRow?.start === 0, listeningRow);

  console.log("\nЗаметки с типом");
  const noteObs = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/notes`, { method: "POST", jar: teacherA.teacherJar, body: { text: "Наблюдение о студенте", noteType: "OBSERVATION" } });
  check("Заметка с типом — 201, noteType сохранён", noteObs.status === 201 && noteObs.body?.noteType === "OBSERVATION", noteObs);
  const noteNoType = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/notes`, { method: "POST", jar: teacherA.teacherJar, body: { text: "Заметка без типа" } });
  check("Заметка без типа — noteType = null", noteNoType.status === 201 && noteNoType.body?.noteType === null, noteNoType);
  const overviewAfterNotes = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}`, { jar: teacherA.teacherJar });
  check("Обе заметки видны в Обзоре с сохранённым типом", overviewAfterNotes.body?.notes?.some((n: any) => n.noteType === "OBSERVATION") && overviewAfterNotes.body?.notes?.some((n: any) => n.noteType === null), overviewAfterNotes.body?.notes);

  console.log("\nИзоляция между преподавателями (новые маршруты)");
  const teacherB = await setupTeacherWithGroup(stamp, "B");
  const qCross = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/questionnaire`, { jar: teacherB.teacherJar });
  check("Вкладка «Анкета» чужой группы — 404", qCross.status === 404, qCross);
  const dCross = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/diagnostic`, { jar: teacherB.teacherJar });
  check("Вкладка «Диагностика» чужой группы — 404", dCross.status === 404, dCross);
  const gCross = await request(`/api/teacher/groups/${groupA.id}/students/${studentId}/goals/${chosenGoal}`, { method: "PUT", jar: teacherB.teacherJar, body: { status: "DONE" } });
  check("Изменение статуса цели чужой группы — 404", gCross.status === 404, gCross);
  const goalStatusAfterCrossAttempt = await prisma.studentGoalStatus.findUnique({ where: { groupId_studentId_goalCode: { groupId: groupA.id, studentId, goalCode: chosenGoal } } });
  check("Статус цели не изменился попыткой чужого преподавателя", goalStatusAfterCrossAttempt?.status === "IN_PROGRESS", goalStatusAfterCrossAttempt);

  console.log("\nСтудент без завершённой анкеты — честные пустые состояния, без ошибок");
  const emptyJar = await newStudent(stamp, "empty");
  await joinGroup(emptyJar, groupA.joinCode.code);
  const dashForId = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherA.teacherJar });
  const emptyRow = dashForId.body.students.find((s: any) => !["rich"].some((l: string) => s.fullName.includes(l)) && s.questionnaireStatus === "NOT_STARTED");
  const emptyOverview = await request(`/api/teacher/groups/${groupA.id}/students/${emptyRow.studentId}`, { jar: teacherA.teacherJar });
  check("Обзор без анкеты — 200, overview.available = false", emptyOverview.status === 200 && emptyOverview.body?.overview?.available === false, emptyOverview.body?.overview);
  check("Сильные/слабые стороны — пустые массивы, не выдуманные", emptyOverview.body?.overview?.strengths?.length === 0 && emptyOverview.body?.overview?.weaknesses?.length === 0, emptyOverview.body?.overview);
  check("Главная цель — null (анкета не пройдена)", emptyOverview.body?.goals?.mainGoal === null, emptyOverview.body?.goals?.mainGoal);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
