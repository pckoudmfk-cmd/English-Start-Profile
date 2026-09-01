/**
 * Критическая проверка Этапа 8 (ДОСТИЖЕНИЯ, ВНЕАУДИТОРНАЯ ДЕЯТЕЛЬНОСТЬ,
 * КВАЛИФИКАЦИОННЫЕ БАЛЛЫ).
 *
 * Реальные HTTP-запросы (включая настоящую multipart-загрузку файла) к
 * работающему backend. Покрывает все 7 acceptance-сценариев из ТЗ
 * (раздел 38) плюс общий workflow, защиту от повторного/дублирующего
 * начисления, изоляцию доступа и интеграцию с Dashboard/Student Profile.
 *
 * Запуск: npm run verify:achievements (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request, uploadFile } from "./lib/testClient";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

async function setupTeacherWithGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-ach-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год A ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс A ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа A ${suffix} ${stamp}`, courseId: course.body.id } });
  return { teacherJar, group: group.body };
}

async function newStudentInGroup(stamp: number, label: string, joinCode: string): Promise<CookieJar> {
  const jar: CookieJar = {};
  await registerUser(jar, `student-ach-${label}-${stamp}@example.com`, "Password123!", "STUDENT");
  const res = await request("/api/student/groups/join", { method: "POST", jar, body: { code: joinCode } });
  if (![200, 201].includes(res.status)) throw new Error(`join failed: ${JSON.stringify(res.body)}`);
  return jar;
}

function achievementPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    eventName: "Всероссийская научно-практическая конференция «Молодой исследователь»",
    eventDate: "2026-10-15",
    organizer: "МГУ",
    eventType: "CONFERENCE",
    claimedResult: "PARTICIPANT",
    ...overrides,
  };
}

async function createAndSubmit(jar: CookieJar, groupId: string, overrides: Partial<Record<string, unknown>> = {}) {
  const created = await request("/api/student/achievements", { method: "POST", jar, body: { groupId, ...achievementPayload(overrides) } });
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.body)}`);
  const submitted = await request(`/api/student/achievements/${created.body.id}/submit`, { method: "POST", jar });
  if (submitted.status !== 200) throw new Error(`submit failed: ${JSON.stringify(submitted.body)}`);
  return submitted.body;
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка ДОСТИЖЕНИЙ И КВАЛИФИКАЦИОННЫХ БАЛЛОВ (Этап 8)\n`);

  const teacherA = await setupTeacherWithGroup(stamp, "A");
  const groupA = teacherA.group;
  const studentA = await newStudentInGroup(stamp, "A", groupA.joinCode.code);

  // === Общий workflow ======================================================
  console.log("Общий workflow: черновик → отправка → уточнение → правка → отклонение");

  const draftCreate = await request("/api/student/achievements", { method: "POST", jar: studentA, body: { groupId: groupA.id, ...achievementPayload({ eventName: "Тестовое мероприятие workflow" }) } });
  check("Создание достижения — 201, статус DRAFT", draftCreate.status === 201 && draftCreate.body.status === "DRAFT", draftCreate.body);
  const achId = draftCreate.body.id;

  const evidenceUpload = await uploadFile(`/api/student/achievements/${achId}/evidence`, {
    jar: studentA,
    fileName: "sertificate.pdf",
    mimeType: "application/pdf",
    fileContent: Buffer.from("%PDF-1.4 test file content"),
  });
  check("Загрузка подтверждающего документа — 201", evidenceUpload.status === 201 && evidenceUpload.body.fileName === "sertificate.pdf", evidenceUpload.body);

  const unsupportedUpload = await uploadFile(`/api/student/achievements/${achId}/evidence`, {
    jar: studentA,
    fileName: "virus.exe",
    mimeType: "application/x-msdownload",
    fileContent: Buffer.from("not really a document"),
  });
  check("Неподдерживаемый тип файла отклонён", unsupportedUpload.status === 400 && unsupportedUpload.body?.error === "UNSUPPORTED_FILE_TYPE", unsupportedUpload.body);

  const submitWf = await request(`/api/student/achievements/${achId}/submit`, { method: "POST", jar: studentA });
  check("Отправка на проверку — статус PENDING", submitWf.status === 200 && submitWf.body.status === "PENDING", submitWf.body);

  const editAfterSubmit = await request(`/api/student/achievements/${achId}`, { method: "PUT", jar: studentA, body: { eventName: "Попытка правки" } });
  check("Редактирование после отправки запрещено (409)", editAfterSubmit.status === 409, editAfterSubmit.body);
  const deleteAfterSubmit = await request(`/api/student/achievements/${achId}`, { method: "DELETE", jar: studentA });
  check("Удаление после отправки запрещено (409)", deleteAfterSubmit.status === 409, deleteAfterSubmit.body);

  const pendingList = await request(`/api/teacher/achievements?pendingOnly=true&groupId=${groupA.id}`, { jar: teacherA.teacherJar });
  check("Преподаватель видит достижение в списке «Требуют проверки»", pendingList.body.some((a: any) => a.id === achId), pendingList.body);

  const clarify = await request(`/api/teacher/achievements/${achId}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "REQUEST_CLARIFICATION", comment: "Уточните организатора" } });
  check("Запрос уточнения — статус NEEDS_CLARIFICATION", clarify.status === 200 && clarify.body.status === "NEEDS_CLARIFICATION", clarify.body);

  const studentSeesComment = await request(`/api/student/achievements/${achId}`, { jar: studentA });
  check("Студент видит комментарий преподавателя", studentSeesComment.body.teacherComment === "Уточните организатора", studentSeesComment.body);

  const editAfterClarify = await request(`/api/student/achievements/${achId}`, { method: "PUT", jar: studentA, body: { organizer: "Уточнённый организатор" } });
  check("Правка после запроса уточнения разрешена", editAfterClarify.status === 200 && editAfterClarify.body.organizer === "Уточнённый организатор", editAfterClarify.body);

  const resubmit = await request(`/api/student/achievements/${achId}/submit`, { method: "POST", jar: studentA });
  check("Повторная отправка после уточнения — снова PENDING", resubmit.status === 200 && resubmit.body.status === "PENDING", resubmit.body);

  const rejectNoComment = await request(`/api/teacher/achievements/${achId}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "REJECT" } });
  check("Отклонение без комментария отклонено (комментарий обязателен)", rejectNoComment.status === 400 && rejectNoComment.body?.error === "COMMENT_REQUIRED", rejectNoComment.body);

  const reject = await request(`/api/teacher/achievements/${achId}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "REJECT", comment: "Документ нечитаем" } });
  check("Отклонение с комментарием — статус REJECTED", reject.status === 200 && reject.body.status === "REJECTED", reject.body);

  const auditRows = await prisma.achievementAuditLog.findMany({ where: { achievementId: achId }, orderBy: { createdAt: "asc" } });
  const auditActions = auditRows.map((r) => r.action);
  check(
    "AuditLog зафиксировал полную историю (CREATED, EVIDENCE_ADDED, SUBMITTED, CLARIFICATION_REQUESTED, EDITED, SUBMITTED, REJECTED)",
    ["CREATED", "EVIDENCE_ADDED", "SUBMITTED", "CLARIFICATION_REQUESTED", "EDITED", "SUBMITTED", "REJECTED"].every((a) => auditActions.includes(a)),
    auditActions
  );

  // === Сценарий 1: обычный участник ========================================
  console.log("\nСценарий 1: обычный участник — 0 баллов");
  const s1 = await createAndSubmit(studentA, groupA.id, { eventName: "Конференция — сценарий 1", claimedResult: "PARTICIPANT" });
  check("До проверки — 0 подтверждённых баллов", (await prisma.qualificationPoint.count({ where: { achievementId: s1.id } })) === 0, s1);
  const s1Confirm = await request(`/api/teacher/achievements/${s1.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM_NO_POINT", comment: "Участие подтверждено, результативного результата нет" } });
  check("После подтверждения без балла — статус CONFIRMED_NO_POINT, 0 баллов", s1Confirm.status === 200 && s1Confirm.body.status === "CONFIRMED_NO_POINT" && s1Confirm.body.qualificationPoint === 0, s1Confirm.body);

  // === Сценарий 2: призовое место ===========================================
  console.log("\nСценарий 2: призовое место — +1");
  const s2 = await createAndSubmit(studentA, groupA.id, { eventName: "Конкурс — сценарий 2", eventType: "COMPETITION", claimedResult: "PRIZE_PLACE", resultPlace: "II место" });
  const s2Confirm = await request(`/api/teacher/achievements/${s2.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Призовое место подтверждено — +1 балл", s2Confirm.status === 200 && s2Confirm.body.status === "CONFIRMED" && s2Confirm.body.qualificationPoint === 1, s2Confirm.body);
  check("В БД создана ровно одна запись QualificationPoint", (await prisma.qualificationPoint.count({ where: { achievementId: s2.id } })) === 1, null);

  // === Сценарий 3: публикация ===============================================
  console.log("\nСценарий 3: публикация — +1");
  const studentB = await newStudentInGroup(stamp, "B", groupA.joinCode.code);
  const s3 = await createAndSubmit(studentB, groupA.id, { eventName: "Конференция — сценарий 3 (публикация)", claimedResult: "PUBLISHED" });
  const s3Confirm = await request(`/api/teacher/achievements/${s3.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Публикация подтверждена — +1 балл", s3Confirm.status === 200 && s3Confirm.body.qualificationPoint === 1, s3Confirm.body);

  // === Сценарий 4: победитель номинации =====================================
  console.log("\nСценарий 4: победитель номинации — +1");
  const studentC = await newStudentInGroup(stamp, "C", groupA.joinCode.code);
  const s4 = await createAndSubmit(studentC, groupA.id, { eventName: "Конференция — сценарий 4 (номинация)", claimedResult: "NOMINATION_WINNER", resultNomination: "Лучший доклад" });
  const s4Confirm = await request(`/api/teacher/achievements/${s4.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Победитель номинации подтверждён — +1 балл", s4Confirm.status === 200 && s4Confirm.body.qualificationPoint === 1, s4Confirm.body);

  // === Сценарий 5: дублирование =============================================
  console.log("\nСценарий 5: дублирование — предупреждение, не более 1 балла суммарно");
  const studentD = await newStudentInGroup(stamp, "D", groupA.joinCode.code);
  const dupName = "Дублирующаяся конференция — сценарий 5";
  const dupDate = "2026-11-20";
  const d1Created = await request("/api/student/achievements", { method: "POST", jar: studentD, body: { groupId: groupA.id, ...achievementPayload({ eventName: dupName, eventDate: dupDate, claimedResult: "PRIZE_PLACE", resultPlace: "I место" }) } });
  const d1Id = d1Created.body.id;
  await request(`/api/student/achievements/${d1Id}/submit`, { method: "POST", jar: studentD });

  const d2Created = await request("/api/student/achievements", { method: "POST", jar: studentD, body: { groupId: groupA.id, ...achievementPayload({ eventName: dupName, eventDate: dupDate, claimedResult: "PRIZE_PLACE", resultPlace: "I место" }) } });
  check("При создании дубля backend вернул possibleDuplicates (не пусто)", Array.isArray(d2Created.body.possibleDuplicates) && d2Created.body.possibleDuplicates.length > 0, d2Created.body.possibleDuplicates);
  const d2Id = d2Created.body.id;
  const d2Submit = await request(`/api/student/achievements/${d2Id}/submit`, { method: "POST", jar: studentD });
  check("При отправке дубля возможные дубли тоже возвращаются (не только при создании)", Array.isArray(d2Submit.body.possibleDuplicates) && d2Submit.body.possibleDuplicates.length > 0, d2Submit.body.possibleDuplicates);
  check("Достижение НЕ удалено автоматически из-за подозрения на дубль", d2Submit.status === 200, d2Submit);

  const d1Confirm = await request(`/api/teacher/achievements/${d1Id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Первая запись дубля подтверждена — +1", d1Confirm.status === 200 && d1Confirm.body.qualificationPoint === 1, d1Confirm.body);
  const d2Confirm = await request(`/api/teacher/achievements/${d2Id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Подтверждение второй (дублирующей) записи с баллом — заблокировано (409)", d2Confirm.status === 409 && d2Confirm.body?.error === "DUPLICATE_POINT_BLOCKED", d2Confirm.body);

  const d2ConfirmNoPoint = await request(`/api/teacher/achievements/${d2Id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM_NO_POINT", comment: "Дубль первой записи, балл уже начислен там" } });
  check("Вторую запись можно подтвердить БЕЗ балла (после явного решения преподавателя)", d2ConfirmNoPoint.status === 200 && d2ConfirmNoPoint.body.qualificationPoint === 0, d2ConfirmNoPoint.body);

  const studentDId = (await request("/api/auth/me", { jar: studentD })).body.id;
  const studentDPoints = await prisma.qualificationPoint.count({ where: { studentId: studentDId, groupId: groupA.id } });
  check("После подтверждения ОБЕИХ записей дубля — суммарно ровно 1 балл, не 2", studentDPoints === 1, studentDPoints);

  // === Сценарий 6: три результата одного мероприятия ========================
  console.log("\nСценарий 6: одно мероприятие с тремя результатами — 1 балл, не 3");
  const studentE = await newStudentInGroup(stamp, "E", groupA.joinCode.code);
  const s6 = await createAndSubmit(studentE, groupA.id, {
    eventName: "Конференция — сценарий 6 (три результата)",
    claimedResult: "NOMINATION_WINNER",
    resultNomination: "Лучший доклад",
    description: "Также призовое место (I) и публикация статьи в сборнике по итогам того же мероприятия.",
  });
  const s6Confirm = await request(`/api/teacher/achievements/${s6.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Одно мероприятие с несколькими результатами — ровно 1 балл (одна запись = один QualificationPoint)", s6Confirm.status === 200 && s6Confirm.body.qualificationPoint === 1, s6Confirm.body);
  const studentEId = (await request("/api/auth/me", { jar: studentE })).body.id;
  const studentEPoints = await prisma.qualificationPoint.count({ where: { studentId: studentEId, groupId: groupA.id } });
  check("У студента E — ровно 1 балл (не 3 за три заявленных результата)", studentEPoints === 1, studentEPoints);

  // === Сценарий 7: пять баллов → освобождение от устной части ==============
  console.log("\nСценарий 7: пять баллов — освобождение от устной части");
  const studentF = await newStudentInGroup(stamp, "F", groupA.joinCode.code);
  for (let i = 0; i < 5; i++) {
    const a = await createAndSubmit(studentF, groupA.id, {
      eventName: `Мероприятие F-${i}`,
      eventDate: `2026-0${(i % 9) + 1}-1${i}`,
      claimedResult: "PRIZE_PLACE",
      resultPlace: "I место",
    });
    const c = await request(`/api/teacher/achievements/${a.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
    if (c.status !== 200) throw new Error(`confirm ${i} failed: ${JSON.stringify(c.body)}`);
  }
  const studentFId = (await request("/api/auth/me", { jar: studentF })).body.id;
  const dashboardAfterF = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherA.teacherJar });
  const fRow = dashboardAfterF.body.students.find((s: any) => s.studentId === studentFId);
  check("У студента F — 5 квалификационных баллов", fRow?.qualificationPoints === 5, fRow);
  // Этап 9: creditStatus в строке — теперь полный "Итог" зачёта, а не
  // только статус устной части. Студент F не подавал допуск по словарю
  // в этом тесте (модуль допуска — Этап 9, не Этап 8) — по буквальному
  // ТЗ п.28 (dictionary_status != confirmed → Не допущен) проверяется
  // ПЕРВЫМ, раньше квалификационных баллов, поэтому даже 5 баллов не
  // делают "Итог" завершённым без допуска.
  check('creditStatus (полный "Итог") = NOT_ADMITTED — 5 баллов одних недостаточно без допуска (ТЗ п.28)', fRow?.creditStatus === "NOT_ADMITTED", fRow);

  const profileF = await request(`/api/teacher/groups/${groupA.id}/students/${studentFId}`, { jar: teacherA.teacherJar });
  check("Профиль студента: 5/5 баллов", profileF.body?.kpi?.qualificationPoints?.points === 5, profileF.body?.kpi?.qualificationPoints);
  check("Профиль студента: header — «Не допущен» (полный «Итог», Этап 9)", profileF.body?.header?.creditStatusLabel === "Не допущен", profileF.body?.header);
  check("pointsUntilExemption = 0 при 5+ баллах", profileF.body?.kpi?.qualificationPoints?.pointsUntilExemption === 0, profileF.body?.kpi?.qualificationPoints);

  // === Портфолио vs квалификационные баллы (ТЗ п.20) ========================
  console.log("\nПортфолио и квалификационные баллы — разные понятия");
  // studentA: сценарий 1 (CONFIRMED_NO_POINT) + сценарий 2 (CONFIRMED, +1 балл)
  const profileA = await request(`/api/teacher/groups/${groupA.id}/students/${(await request("/api/auth/me", { jar: studentA })).body.id}`, { jar: teacherA.teacherJar });
  check("Портфолио студента A включает оба подтверждённых достижения (с баллом и без)", profileA.body?.achievements?.portfolioCount >= 2, profileA.body?.achievements);
  check("Результативных достижений у студента A — 1 (только сценарий 2)", profileA.body?.achievements?.resultfulCount === 1, profileA.body?.achievements);

  // === Защита на уровне БД (ТЗ п.13) — напрямую, в обход HTTP-логики =======
  console.log("\nЗащита от повторного начисления НА УРОВНЕ БД (не только приложения)");
  let dbLevelBlocked = false;
  try {
    await prisma.qualificationPoint.create({ data: { achievementId: s2.id, studentId: (await request("/api/auth/me", { jar: studentA })).body.id, groupId: groupA.id, teacherId: (await request("/api/auth/me", { jar: teacherA.teacherJar })).body.id, value: 1 } });
  } catch (err: any) {
    dbLevelBlocked = err?.code === "P2002";
  }
  check("Прямая попытка вставить вторую QualificationPoint для того же achievementId отклонена БД (уникальный индекс, P2002)", dbLevelBlocked, dbLevelBlocked);

  console.log("\nПовторное нажатие «Подтвердить — 1 балл» на уже подтверждённом достижении");
  const reConfirm = await request(`/api/teacher/achievements/${s2.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CONFIRM" } });
  check("Повторное подтверждение — отклонено (достижение уже не PENDING)", reConfirm.status === 400 && reConfirm.body?.error === "INVALID_STATUS", reConfirm.body);
  check("Повторное нажатие не создало вторую запись балла", (await prisma.qualificationPoint.count({ where: { achievementId: s2.id } })) === 1, null);

  // === «Изменить статус» (ТЗ п.30) — отзыв ошибочного подтверждения ========
  console.log("\n«Изменить статус» — отзыв ошибочно начисленного балла");
  const changeStatus = await request(`/api/teacher/achievements/${s2.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CHANGE_STATUS", targetStatus: "REJECTED", comment: "Ошибочно подтверждено — данные не соответствуют" } });
  check("Изменение статуса на REJECTED с причиной — 200", changeStatus.status === 200 && changeStatus.body.status === "REJECTED" && changeStatus.body.qualificationPoint === 0, changeStatus.body);
  check("Балл отозван из БД вместе со сменой статуса", (await prisma.qualificationPoint.count({ where: { achievementId: s2.id } })) === 0, null);
  const changeStatusNoReason = await request(`/api/teacher/achievements/${s3.id}/decision`, { method: "PATCH", jar: teacherA.teacherJar, body: { action: "CHANGE_STATUS", targetStatus: "REJECTED" } });
  check("«Изменить статус» без причины отклонено (причина обязательна)", changeStatusNoReason.status === 400, changeStatusNoReason.body);

  // === Права доступа (ТЗ п.33) ==============================================
  console.log("\nПрава доступа");
  const studentTriesDecision = await request(`/api/teacher/achievements/${s3.id}/decision`, { method: "PATCH", jar: studentA, body: { action: "CONFIRM" } });
  check("Студент не может вызвать маршрут подтверждения преподавателя — 403", studentTriesDecision.status === 403, studentTriesDecision);

  const teacherB = await setupTeacherWithGroup(stamp, "B");
  const crossTeacherList = await request(`/api/teacher/achievements?groupId=${groupA.id}`, { jar: teacherB.teacherJar });
  check("Чужой преподаватель не видит достижения группы A в списке", !crossTeacherList.body.some((a: any) => a.id === s3.id), crossTeacherList.body.length);
  const crossTeacherGet = await request(`/api/teacher/achievements/${s3.id}`, { jar: teacherB.teacherJar });
  check("Чужой преподаватель не может открыть карточку — 404", crossTeacherGet.status === 404, crossTeacherGet);
  const crossTeacherDecision = await request(`/api/teacher/achievements/${s3.id}/decision`, { method: "PATCH", jar: teacherB.teacherJar, body: { action: "CONFIRM" } });
  check("Чужой преподаватель не может подтвердить — 404", crossTeacherDecision.status === 404, crossTeacherDecision);

  const studentBTriesA = await request(`/api/student/achievements/${s2.id}`, { jar: studentB });
  check("Студент B не видит достижение студента A напрямую по id — 404", studentBTriesA.status === 404, studentBTriesA);

  const noAuth = await request(`/api/student/achievements`, {});
  check("Без токена — 401", noAuth.status === 401, noAuth);

  // === Dashboard интеграция (ТЗ п.24) =======================================
  console.log("\nИнтеграция с Teacher Dashboard");
  const finalDashboard = await request(`/api/teacher/groups/${groupA.id}/dashboard`, { jar: teacherA.teacherJar });
  check("kpi.qualificationPoints.implemented = true (реальные данные)", finalDashboard.body?.kpi?.qualificationPoints?.implemented === true, finalDashboard.body?.kpi?.qualificationPoints);
  check("kpi.qualificationPoints.total — положительное число", finalDashboard.body?.kpi?.qualificationPoints?.total > 0, finalDashboard.body?.kpi?.qualificationPoints);
  check("kpi.qualificationPoints.studentsWithFivePlus включает студента F", finalDashboard.body?.kpi?.qualificationPoints?.studentsWithFivePlus >= 1, finalDashboard.body?.kpi?.qualificationPoints);
  check("credit.oralPart.exemptedCount учитывает студента F", finalDashboard.body?.credit?.oralPart?.exemptedCount >= 1, finalDashboard.body?.credit?.oralPart);
  check("achievementsPendingReview — честное число (не implemented:false)", typeof finalDashboard.body?.achievementsPendingReview === "number", finalDashboard.body?.achievementsPendingReview);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
