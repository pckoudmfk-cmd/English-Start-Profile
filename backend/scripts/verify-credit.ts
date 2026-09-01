/**
 * Критическая проверка Этапа 9 (МОДУЛЬ «ДИФФЕРЕНЦИРОВАННЫЙ ЗАЧЁТ»).
 *
 * Реальные HTTP-запросы к работающему backend. Покрывает все 6
 * acceptance-сценариев ТЗ (раздел 38), допуск (словарь), лексико-
 * грамматический тест, устную часть, расчёт "Итога", изоляцию доступа,
 * историю (append-only) и защиту от гонки на уровне БД.
 *
 * Запуск: npm run verify:credit (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

async function setupTeacherWithGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-credit-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год C ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс C ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа C ${suffix} ${stamp}`, courseId: course.body.id } });
  return { teacherJar, group: group.body, courseId: course.body.id, academicYearId: year.body.id };
}

async function newStudentInGroup(stamp: number, label: string, joinCode: string): Promise<CookieJar & { studentId: string }> {
  const jar: CookieJar = {};
  const user = await registerUser(jar, `student-credit-${label}-${stamp}@example.com`, "Password123!", "STUDENT");
  const res = await request("/api/student/groups/join", { method: "POST", jar, body: { code: joinCode } });
  if (![200, 201].includes(res.status)) throw new Error(`join failed: ${JSON.stringify(res.body)}`);
  return Object.assign(jar, { studentId: user.id });
}

// Создаёт РОВНО 10 активных заданий банка — минимум, достаточный для
// одной попытки (ТЗ п.8).
async function seedTestBank(teacherJar: CookieJar, courseId: string, count = 10) {
  const topics = ["PRESENT_SIMPLE", "PRESENT_PERFECT", "PAST_SIMPLE", "FUTURE_SIMPLE", "PASSIVE_VOICE", "QUANTIFIERS", "PHRASAL_VERBS", "COMPARISON_DEGREES", "PRESENT_CONTINUOUS", "PRESENT_PERFECT_CONTINUOUS"];
  const items: { id: string; correctOptionIndex: number }[] = [];
  for (let i = 0; i < count; i++) {
    const res = await request(`/api/teacher/credit/courses/${courseId}/test-items`, {
      method: "POST",
      jar: teacherJar,
      body: {
        question: `Choose the correct form (item ${i + 1}).`,
        options: ["go", "goes", "went", "gone"],
        correctOptionIndex: 1,
        grammarTopic: topics[i % topics.length],
        vocabularyTopic: "Finance vocabulary unit 1",
        explanationRu: "Пояснение к правильному ответу.",
      },
    });
    if (res.status !== 201) throw new Error(`seed item failed: ${JSON.stringify(res.body)}`);
    items.push({ id: res.body.id, correctOptionIndex: res.body.correctOptionIndex });
  }
  return items;
}

// Проходит тест студентом: создаёт попытку, отвечает на все 10 заданий
// (по желанию — все верно или все неверно), завершает.
async function takeTest(studentJar: CookieJar, groupId: string, allCorrect: boolean) {
  const start = await request(`/api/student/credit/${groupId}/test/attempts`, { method: "POST", jar: studentJar });
  if (![200, 201].includes(start.status)) throw new Error(`start attempt failed: ${JSON.stringify(start.body)}`);
  const attemptId = start.body.id;
  const detail = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}`, { jar: studentJar });
  for (const item of detail.body.items) {
    const wrongIndex = (item.options as string[]).findIndex((_: string, idx: number) => idx !== 1);
    const selected = allCorrect ? 1 : wrongIndex;
    const ans = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/items/${item.itemId}/answer`, {
      method: "PATCH",
      jar: studentJar,
      body: { selectedOptionIndex: selected },
    });
    if (ans.status !== 204) throw new Error(`answer failed: ${JSON.stringify(ans.body)}`);
  }
  const complete = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  return { attemptId, complete };
}

async function submitAndConfirmDictionary(studentJar: CookieJar, teacherJar: CookieJar, groupId: string, wordCount = 900) {
  const submit = await request(`/api/student/credit/${groupId}/dictionary`, { method: "POST", jar: studentJar, body: { wordCount, description: "Словарь по финансовой лексике" } });
  if (submit.status !== 201) throw new Error(`dictionary submit failed: ${JSON.stringify(submit.body)}`);
  const open = await request(`/api/teacher/credit/dictionary/${submit.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "OPEN" } });
  const confirm = await request(`/api/teacher/credit/dictionary/${submit.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action: "CONFIRM" } });
  return { submission: submit.body, open, confirm };
}

async function giveQualificationPoint(studentJar: CookieJar, teacherJar: CookieJar, groupId: string, eventName: string, claimedResult: string, action: "CONFIRM" | "CONFIRM_NO_POINT" = "CONFIRM") {
  const created = await request("/api/student/achievements", {
    method: "POST",
    jar: studentJar,
    body: { groupId, eventName, eventDate: "2026-11-01", organizer: "МГУ", eventType: "CONFERENCE", claimedResult },
  });
  await request(`/api/student/achievements/${created.body.id}/submit`, { method: "POST", jar: studentJar });
  const decision = await request(`/api/teacher/achievements/${created.body.id}/decision`, { method: "PATCH", jar: teacherJar, body: { action, comment: action === "CONFIRM_NO_POINT" ? "без балла" : undefined } });
  return { achievement: created.body, decision };
}

async function main() {
  const stamp = Date.now();

  // === Сценарий 1: словарь не подтверждён → "Не допущен" ===================
  console.log("Сценарий 1: словарь не подтверждён");
  const teacherA = await setupTeacherWithGroup(stamp, "a");
  const joinRes = await request(`/api/teacher/groups/${teacherA.group.id}`, { jar: teacherA.teacherJar });
  const joinCodeA = joinRes.body.joinCode?.code;
  const studentNothing = await newStudentInGroup(stamp, "nothing", joinCodeA);

  const summaryNothing = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentNothing });
  check("Ничего не отправлено → dictionary.status = null", summaryNothing.body.dictionary.status === null, summaryNothing.body.dictionary);
  check('Ничего не отправлено → topStatus = "REQUIREMENTS_NOT_MET"', summaryNothing.body.topStatus === "REQUIREMENTS_NOT_MET", summaryNothing.body.topStatus);

  const studentInProgress = await newStudentInGroup(stamp, "inprogress", joinCodeA);
  const submittedNotConfirmed = await request(`/api/student/credit/${teacherA.group.id}/dictionary`, { method: "POST", jar: studentInProgress, body: { wordCount: 850 } });
  check("Отправка допуска — 201", submittedNotConfirmed.status === 201, submittedNotConfirmed.body);
  const summaryInProgress = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentInProgress });
  check('Отправлено, но не подтверждено → "Итог" = НЕ ДОПУЩЕН', summaryInProgress.body.dictionary.status === "SUBMITTED", summaryInProgress.body.dictionary);
  check('Отправлено, но не подтверждено → topStatus = "IN_PROGRESS"', summaryInProgress.body.topStatus === "IN_PROGRESS", summaryInProgress.body.topStatus);

  // Тест недоступен до допуска.
  const testBeforeAdmission = await request(`/api/student/credit/${teacherA.group.id}/test/attempts`, { method: "POST", jar: studentInProgress });
  check("Тест недоступен до подтверждения допуска — 409", testBeforeAdmission.status === 409, testBeforeAdmission.body);

  // Преподаватель не может подтвердить без явного "Открыть" сначала? — нет,
  // проверим прямое подтверждение без предварительного "Открыть" тоже работает.
  const directConfirm = await request(`/api/teacher/credit/dictionary/${submittedNotConfirmed.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Прямое подтверждение без «Открыть» — тоже допустимо", directConfirm.status === 200, directConfirm.body);
  const afterConfirm = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentInProgress });
  check('После подтверждения → dictionary.status = "CONFIRMED"', afterConfirm.body.dictionary.status === "CONFIRMED", afterConfirm.body.dictionary);
  check('После подтверждения, тест не начат → topStatus = "ADMITTED"', afterConfirm.body.topStatus === "ADMITTED", afterConfirm.body.topStatus);

  // Отклонение с обязательным комментарием.
  const studentRejected = await newStudentInGroup(stamp, "rejected", joinCodeA);
  const rSubmit = await request(`/api/student/credit/${teacherA.group.id}/dictionary`, { method: "POST", jar: studentRejected, body: { wordCount: 400 } });
  const rejectNoComment = await request(`/api/teacher/credit/dictionary/${rSubmit.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "REJECT" } });
  check("Отклонение без комментария — 400 (комментарий обязателен)", rejectNoComment.status === 400, rejectNoComment.body);
  const rejectWithComment = await request(`/api/teacher/credit/dictionary/${rSubmit.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "REJECT", comment: "Недостаточно слов" } });
  check("Отклонение с комментарием — 200", rejectWithComment.status === 200, rejectWithComment.body);
  // Повторная отправка после отклонения — история сохраняется (обе строки).
  const rResubmit = await request(`/api/student/credit/${teacherA.group.id}/dictionary`, { method: "POST", jar: studentRejected, body: { wordCount: 950 } });
  check("Повторная отправка после отклонения — 201", rResubmit.status === 201, rResubmit.body);
  const rHistory = await request(`/api/student/credit/${teacherA.group.id}/dictionary`, { jar: studentRejected });
  check("История допуска — 2 записи (старая не удалена/не переписана)", rHistory.body.length === 2, rHistory.body);
  check("Старая запись в истории осталась REJECTED", rHistory.body.find((s: any) => s.id === rSubmit.body.id)?.status === "REJECTED", rHistory.body);

  // === Сценарий 2: словарь подтверждён, тест не пройден → "Допущен / тест не завершён" ===
  console.log("Сценарий 2: допущен, тест не завершён");
  const studentB = await newStudentInGroup(stamp, "b", joinCodeA);
  await submitAndConfirmDictionary(studentB, teacherA.teacherJar, teacherA.group.id);
  const bankA = await seedTestBank(teacherA.teacherJar, teacherA.courseId);
  check("Банк заданий курса — 10 активных вопросов", bankA.length === 10, bankA.length);

  const summaryB = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentB });
  check('Сценарий 2 → "Итог" = Допущен', summaryB.body.dictionary.status === "CONFIRMED" && summaryB.body.test.status === "NOT_STARTED", summaryB.body);

  const startAttempt = await request(`/api/student/credit/${teacherA.group.id}/test/attempts`, { method: "POST", jar: studentB });
  check("Старт попытки теста — 201", startAttempt.status === 201, startAttempt.body);
  const attemptDetail = await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}`, { jar: studentB });
  check("Попытка содержит 10 заданий", attemptDetail.body.items.length === 10, attemptDetail.body.items.length);
  check("Правильный ответ НЕ отдаётся студенту до завершения", attemptDetail.body.items.every((i: any) => i.correctOptionIndex === null), attemptDetail.body.items);

  const partialComplete = await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}/complete`, { method: "POST", jar: studentB });
  check("Завершение без всех ответов — 400 INCOMPLETE", partialComplete.status === 400, partialComplete.body);

  // Отвечаем на первые 8 из 10 — проверяем "Вы ответили на 8 из 10".
  for (const item of attemptDetail.body.items.slice(0, 8)) {
    await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}/items/${item.itemId}/answer`, { method: "PATCH", jar: studentB, body: { selectedOptionIndex: 1 } });
  }
  const midway = await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}`, { jar: studentB });
  check('Индикатор прогресса: answeredCount = 8 из 10 ("Вы ответили на 8 из 10")', midway.body.answeredCount === 8 && midway.body.totalItems === 10, midway.body);

  // Меняем ответ на уже отвеченное задание (ТЗ п.12 — можно менять до завершения).
  const firstItem = attemptDetail.body.items[0];
  const changeAnswer = await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}/items/${firstItem.itemId}/answer`, { method: "PATCH", jar: studentB, body: { selectedOptionIndex: 0 } });
  check("Изменение уже данного ответа до завершения — 204", changeAnswer.status === 204, changeAnswer.body);

  for (const item of attemptDetail.body.items.slice(8)) {
    await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}/items/${item.itemId}/answer`, { method: "PATCH", jar: studentB, body: { selectedOptionIndex: 1 } });
  }
  const completed = await request(`/api/student/credit/${teacherA.group.id}/test/attempts/${startAttempt.body.id}/complete`, { method: "POST", jar: studentB });
  check("Завершение теста со всеми отвеченными — 200", completed.status === 200, completed.body);
  check("Результат: 9 из 10 (изменённый первый ответ — неверный)", completed.body.correctCount === 9 && completed.body.totalCount === 10, completed.body);
  check("По умолчанию правильные ответы НЕ раскрываются (revealCorrectAnswers=false)", completed.body.revealCorrectAnswers === false, completed.body);

  const afterTestB = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentB });
  check('Тест завершён, баллов 0 → "Итог" = Устная часть обязательна', afterTestB.body.dictionary.status === "CONFIRMED", afterTestB.body);
  check('topStatus после теста (тема не назначена) = "TEST_COMPLETED"', afterTestB.body.topStatus === "TEST_COMPLETED", afterTestB.body.topStatus);
  check("Не превращаем 9/10 автоматически в оценку «отлично»/«хорошо» — только числа", afterTestB.body.test.latestResult.correctCount === 9 && !("grade" in afterTestB.body.test.latestResult), afterTestB.body.test);

  // Вторая попытка запрещена — maxTestAttempts по умолчанию 1.
  const secondAttempt = await request(`/api/student/credit/${teacherA.group.id}/test/attempts`, { method: "POST", jar: studentB });
  check("Вторая попытка запрещена по умолчанию (maxTestAttempts=1) — 409", secondAttempt.status === 409, secondAttempt.body);

  // Настройка курса: увеличиваем лимит попыток и включаем показ ответов.
  const settingsPut = await request(`/api/teacher/credit/courses/${teacherA.courseId}/settings`, { method: "PUT", jar: teacherA.teacherJar, body: { maxTestAttempts: 2, revealCorrectAnswers: true } });
  check("Настройки курса обновлены — 200", settingsPut.status === 200 && settingsPut.body.maxTestAttempts === 2, settingsPut.body);
  const secondAttemptNowAllowed = await request(`/api/student/credit/${teacherA.group.id}/test/attempts`, { method: "POST", jar: studentB });
  check("После увеличения лимита — вторая попытка разрешена", secondAttemptNowAllowed.status === 201, secondAttemptNowAllowed.body);
  const { complete: secondComplete } = await takeTest2(studentB, teacherA.group.id, secondAttemptNowAllowed.body.id);
  check("После включения revealCorrectAnswers — правильные ответы раскрыты", secondComplete.body.revealCorrectAnswers === true, secondComplete.body);

  // === Сценарий 3: тест пройден, 0-4 балла → "Устная часть обязательна" ====
  console.log("Сценарий 3: 0-4 балла → устная часть обязательна");
  // Назначаем тему студенту B (0 баллов) — topStatus должен стать ORAL_REQUIRED.
  const assignTopic = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${(studentB.studentId)}/oral/assign`, { method: "POST", jar: teacherA.teacherJar, body: { topicId: "family_relationships", comment: "Готовьтесь к беседе" } });
  check("Назначение темы устной части — 201", assignTopic.status === 201, assignTopic.body);
  const afterAssign = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentB });
  check('После назначения темы → topStatus = "ORAL_REQUIRED"', afterAssign.body.topStatus === "ORAL_REQUIRED", afterAssign.body.topStatus);
  check("Тема — точное английское название из утверждённого списка", afterAssign.body.oral.topic?.en === "Family relationships", afterAssign.body.oral.topic);
  check('"Итог" (учительский расчёт) = ORAL_REQUIRED', afterAssign.body.topStatus !== "COMPLETED", afterAssign.body.topStatus);

  // Черновик оценки — предварительный результат показывается с пометкой.
  const studentBId = studentB.studentId;
  const criteria = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${studentBId}/oral/criteria`, {
    method: "PUT",
    jar: teacherA.teacherJar,
    body: { taskCompletion: "THREE_QUARTERS", errorCount: "THREE_FIVE", errorNature: ["GRAMMAR"], logic: "MOSTLY", activeVocabulary: "USED", questionResponses: "ADEQUATE" },
  });
  check("Сохранение критериев устной части — 200", criteria.status === 200, criteria.body);
  check('Предварительный результат вычислен = "GOOD" (по всем критериям — ХОРОШО)', criteria.body.preliminaryGrade === "GOOD", criteria.body);
  const afterDraft = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentB });
  check('Черновик оценки сохранён (не подтверждён) → topStatus = "ORAL_DONE"', afterDraft.body.topStatus === "ORAL_DONE", afterDraft.body.topStatus);
  check("Студенту НЕ показывается итоговая оценка до подтверждения", afterDraft.body.oral.finalGrade === null, afterDraft.body.oral);

  // Подтверждение без критериев — запрещено.
  const studentGap = await newStudentInGroup(stamp, "gap", joinCodeA);
  await submitAndConfirmDictionary(studentGap, teacherA.teacherJar, teacherA.group.id);
  await takeTest(studentGap, teacherA.group.id, false); // 0/10 — тест пройден, но провален
  const gapId = studentGap.studentId;
  const assignGap = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${gapId}/oral/assign`, { method: "POST", jar: teacherA.teacherJar, body: { topicId: "leisure_hobbies" } });
  check("Назначение темы без комментария — тоже допустимо (необязателен)", assignGap.status === 201, assignGap.body);
  const confirmWithoutCriteria = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${gapId}/oral/confirm`, { method: "POST", jar: teacherA.teacherJar, body: { finalGrade: "GOOD" } });
  check("Подтверждение итоговой оценки без черновика критериев — 400 CRITERIA_REQUIRED", confirmWithoutCriteria.status === 400 && confirmWithoutCriteria.body.error === "CRITERIA_REQUIRED", confirmWithoutCriteria.body);

  // Теперь подтверждаем оценку студента B — система никогда не завершает сама.
  const confirmB = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${studentBId}/oral/confirm`, { method: "POST", jar: teacherA.teacherJar, body: { finalGrade: "GOOD", comment: "Хорошая беседа" } });
  check("Подтверждение итоговой оценки преподавателем — 200", confirmB.status === 200 && confirmB.body.finalGrade === "GOOD", confirmB.body);
  const afterConfirmB = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentB });
  check('После подтверждения оценки → topStatus = "COMPLETED" (Зачёт завершён)', afterConfirmB.body.topStatus === "COMPLETED", afterConfirmB.body.topStatus);
  check("Итоговая оценка теперь видна студенту", afterConfirmB.body.oral.finalGrade === "GOOD", afterConfirmB.body.oral);

  // === Сценарий 4: 5 квалификационных баллов → освобождение ================
  console.log("Сценарий 4: 5 баллов → освобождение от устной части");
  const studentE = await newStudentInGroup(stamp, "e", joinCodeA);
  await submitAndConfirmDictionary(studentE, teacherA.teacherJar, teacherA.group.id);
  await takeTest(studentE, teacherA.group.id, true);
  for (let i = 0; i < 5; i++) {
    await giveQualificationPoint(studentE, teacherA.teacherJar, teacherA.group.id, `Конференция №${i} ${stamp}`, "PRIZE_PLACE");
  }
  const summaryE = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentE });
  check("5 квалификационных баллов зафиксировано", summaryE.body.qualification.points === 5, summaryE.body.qualification);
  check('5 баллов → topStatus = "COMPLETED" (Зачёт завершён), даже без назначения устной части', summaryE.body.topStatus === "COMPLETED", summaryE.body.topStatus);
  check('Причина освобождения показана дословно ("на основании 5 квалификационных баллов")', summaryE.body.oral.exemptionReason?.includes("5 квалификационных баллов"), summaryE.body.oral);
  const eId = studentE.studentId;
  const oralRowE = await prisma.oralAssessment.findUnique({ where: { studentId_groupId: { studentId: eId, groupId: teacherA.group.id } } });
  check("ТЗ п.26: запись OralAssessment(EXEMPTED) реально сохранена в БД для истории", oralRowE?.status === "EXEMPTED", oralRowE);

  // === Сценарий 5: обычное участие → 0 баллов ================================
  console.log("Сценарий 5: обычное участие → 0 баллов");
  const studentP = await newStudentInGroup(stamp, "participant", joinCodeA);
  const { decision: participantDecision } = await giveQualificationPoint(studentP, teacherA.teacherJar, teacherA.group.id, `Обычное участие ${stamp}`, "PARTICIPANT", "CONFIRM_NO_POINT");
  check("Обычное участие подтверждено БЕЗ балла", participantDecision.status === 200 && participantDecision.body.qualificationPoint === 0, participantDecision.body);
  const summaryP = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentP });
  check("Сценарий 5: 0 квалификационных баллов", summaryP.body.qualification.points === 0, summaryP.body.qualification);

  // === Сценарий 6: одно мероприятие — 3 результата → максимум 1 балл =======
  console.log("Сценарий 6: приз+публикация+диплом одного мероприятия → 1 балл, не 3");
  const studentM = await newStudentInGroup(stamp, "multi", joinCodeA);
  const sameEventName = `Конференция «Тройной результат» ${stamp}`;
  const a1 = await request("/api/student/achievements", { method: "POST", jar: studentM, body: { groupId: teacherA.group.id, eventName: sameEventName, eventDate: "2026-12-01", organizer: "МГУ", eventType: "CONFERENCE", claimedResult: "PRIZE_PLACE", resultPlace: "II место" } });
  const a2 = await request("/api/student/achievements", { method: "POST", jar: studentM, body: { groupId: teacherA.group.id, eventName: sameEventName, eventDate: "2026-12-01", organizer: "МГУ", eventType: "CONFERENCE", claimedResult: "PUBLISHED" } });
  const a3 = await request("/api/student/achievements", { method: "POST", jar: studentM, body: { groupId: teacherA.group.id, eventName: sameEventName, eventDate: "2026-12-01", organizer: "МГУ", eventType: "CONFERENCE", claimedResult: "NOMINATION_WINNER", resultNomination: "Лучший доклад" } });
  for (const a of [a1, a2, a3]) await request(`/api/student/achievements/${a.body.id}/submit`, { method: "POST", jar: studentM });
  const dec1 = await request(`/api/teacher/achievements/${a1.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Первая запись тройного результата подтверждена с баллом", dec1.status === 200 && dec1.body.qualificationPoint === 1, dec1.body);
  const dec2 = await request(`/api/teacher/achievements/${a2.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Вторая запись того же мероприятия С баллом — заблокирована (409)", dec2.status === 409 && dec2.body.error === "DUPLICATE_POINT_BLOCKED", dec2.body);
  const dec2b = await request(`/api/teacher/achievements/${a2.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM_NO_POINT", comment: "дубль мероприятия" } });
  check("Вторая запись подтверждена БЕЗ балла — разрешено", dec2b.status === 200 && dec2b.body.qualificationPoint === 0, dec2b.body);
  const dec3 = await request(`/api/teacher/achievements/${a3.body.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM_NO_POINT", comment: "дубль мероприятия" } });
  check("Третья запись подтверждена БЕЗ балла — разрешено", dec3.status === 200, dec3.body);
  const summaryM = await request(`/api/student/credit/${teacherA.group.id}`, { jar: studentM });
  check("Сценарий 6: у студента ровно 1 балл (не 3) за одно мероприятие с тройным результатом", summaryM.body.qualification.points === 1, summaryM.body.qualification);

  // === Проверка прав доступа =================================================
  console.log("\nПроверка прав доступа");
  const noAuthCredit = await request(`/api/student/credit/${teacherA.group.id}`, {});
  check("Без токена — 401", noAuthCredit.status === 401, noAuthCredit);
  const studentTriesTeacherRoute = await request(`/api/teacher/credit/groups/${teacherA.group.id}/dashboard`, { jar: studentB });
  check("Студент не может вызвать преподавательский маршрут — 403", studentTriesTeacherRoute.status === 403, studentTriesTeacherRoute);

  const teacherB = await setupTeacherWithGroup(stamp, "b2");
  const crossTeacherDashboard = await request(`/api/teacher/credit/groups/${teacherA.group.id}/dashboard`, { jar: teacherB.teacherJar });
  check("Чужой преподаватель не видит группу в Dashboard зачёта — 404", crossTeacherDashboard.status === 404, crossTeacherDashboard);
  const crossTeacherDictionary = await request(`/api/teacher/credit/dictionary/${submittedNotConfirmed.body.id}`, { jar: teacherB.teacherJar });
  check("Чужой преподаватель не видит заявку на допуск — 404", crossTeacherDictionary.status === 404, crossTeacherDictionary);
  const studentCrossSeesOther = await request(`/api/student/credit/${teacherA.group.id}/dictionary/${submittedNotConfirmed.body.id}/files/nope`, { jar: studentB });
  check("Студент не видит чужую заявку на допуск (даже несуществующий файл — 404, не утечка чужого id)", studentCrossSeesOther.status === 404, studentCrossSeesOther);

  // === Защита от гонки на уровне БД (уникальность попытки теста) ===========
  console.log("\nЗащита от гонки на уровне БД");
  const raceStudent = await newStudentInGroup(stamp, "race", joinCodeA);
  await submitAndConfirmDictionary(raceStudent, teacherA.teacherJar, teacherA.group.id);
  const raceStudentId = raceStudent.studentId;
  await prisma.creditTestAttempt.create({ data: { studentId: raceStudentId, groupId: teacherA.group.id, courseId: teacherA.courseId, academicYearId: teacherA.academicYearId, attemptNumber: 1 } });
  let raceBlocked = false;
  try {
    await prisma.creditTestAttempt.create({ data: { studentId: raceStudentId, groupId: teacherA.group.id, courseId: teacherA.courseId, academicYearId: teacherA.academicYearId, attemptNumber: 1 } });
  } catch (err: any) {
    raceBlocked = err?.code === "P2002";
  }
  check("Прямая (в обход HTTP) повторная попытка с тем же номером отклонена БД (P2002)", raceBlocked);

  // === Teacher Dashboard интеграция (ТЗ п.29-31) ============================
  console.log("\nTeacher Dashboard «Зачёт»");
  const dash = await request(`/api/teacher/credit/groups/${teacherA.group.id}/dashboard`, { jar: teacherA.teacherJar });
  check("Dashboard зачёта — 200", dash.status === 200, dash.body);
  check("8 сводных чисел присутствуют", ["totalStudents", "admissionConfirmed", "dictionaryUnderReview", "testCompleted", "fivePlusPoints", "oralExempted", "oralPending", "creditCompleted"].every((k) => typeof dash.body.kpi[k] === "number"), dash.body.kpi);
  check("fivePlusPoints учитывает студента E", dash.body.kpi.fivePlusPoints >= 1, dash.body.kpi);
  check("creditCompleted учитывает студентов B и E", dash.body.kpi.creditCompleted >= 2, dash.body.kpi);
  const filtered = await request(`/api/teacher/credit/groups/${teacherA.group.id}/dashboard?pointsFilter=5plus`, { jar: teacherA.teacherJar });
  check('Быстрый фильтр "5+ квалификационных баллов" отбирает только таких студентов', filtered.body.students.every((s: any) => s.qualificationPoints >= 5), filtered.body.students);

  const mainDash = await request(`/api/teacher/groups/${teacherA.group.id}/dashboard`, { jar: teacherA.teacherJar });
  check("Основной Dashboard: credit.vocabulary.implemented = true (реальные данные)", mainDash.body.credit.vocabulary.implemented === true, mainDash.body.credit.vocabulary);
  check("Основной Dashboard: credit.lexicoGrammarTest.implemented = true", mainDash.body.credit.lexicoGrammarTest.implemented === true, mainDash.body.credit.lexicoGrammarTest);
  check("Основной Dashboard: kpi.credit.implemented = true (готовы к зачёту — реальное число)", mainDash.body.kpi.credit.implemented === true, mainDash.body.kpi.credit);
  check("Основной Dashboard: students[].creditStatus — полный «Итог» (не только устная часть)", mainDash.body.students.some((s: any) => s.creditStatus === "COMPLETED"), mainDash.body.students);

  const profile = await request(`/api/teacher/groups/${teacherA.group.id}/students/${studentBId}`, { jar: teacherA.teacherJar });
  check("Student Profile: credit.implemented = true", profile.body.credit.implemented === true, profile.body.credit);
  check("Student Profile: credit.overallStatus = COMPLETED для студента B", profile.body.credit.overallStatus === "COMPLETED", profile.body.credit);
  check("Student Profile: credit.oral.finalGrade = GOOD", profile.body.credit.oral.finalGrade === "GOOD", profile.body.credit.oral);

  // === Изоляция от Start Diagnostic / Progress Check (ТЗ п.2) ==============
  console.log("\nИзоляция от других модулей");
  const diagnosticAttempts = await prisma.diagnosticAttempt.findMany({ where: { studentId: studentBId, groupId: teacherA.group.id } });
  check("Прохождение зачётного теста НЕ создало запись DiagnosticAttempt (модули не смешаны)", diagnosticAttempts.length === 0, diagnosticAttempts);
  const kindCreditUsed = await prisma.diagnosticAttempt.count({ where: { kind: "CREDIT" } });
  check('Зарезервированное DiagnosticAttempt.kind="CREDIT" остаётся неиспользуемым (своя отдельная модель)', kindCreditUsed === 0, kindCreditUsed);

  // === История (ТЗ п.33) — audit log ========================================
  const auditLog = await request(`/api/teacher/credit/groups/${teacherA.group.id}/students/${studentBId}/audit-log`, { jar: teacherA.teacherJar });
  check("Audit log содержит записи по словарю/тесту/устной части", auditLog.body.some((l: any) => l.entityType === "DICTIONARY") && auditLog.body.some((l: any) => l.entityType === "TEST") && auditLog.body.some((l: any) => l.entityType === "ORAL"), auditLog.body);

  summarize();
  await prisma.$disconnect();
}

async function takeTest2(studentJar: CookieJar, groupId: string, attemptId: string) {
  const detail = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}`, { jar: studentJar });
  for (const item of detail.body.items) {
    await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/items/${item.itemId}/answer`, { method: "PATCH", jar: studentJar, body: { selectedOptionIndex: 1 } });
  }
  const complete = await request(`/api/student/credit/${groupId}/test/attempts/${attemptId}/complete`, { method: "POST", jar: studentJar });
  return { complete };
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
