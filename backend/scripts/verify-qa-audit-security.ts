/**
 * Этап 11 (финальный QA-аудит) — целевые проверки, закрывающие пробелы
 * в покрытии существующих verify-*.ts скриптов, обнаруженные при
 * инвентаризации (см. docs/STAGE_11_QA_REPORT.md, раздел SECURITY):
 *
 *   1. IDOR на уровне попытки Start Diagnostic (attempt id) — ни один
 *      существующий verify-diagnostic.ts сценарий не проверял прямой
 *      подбор чужого attemptId студентом B.
 *   2. То же для попытки анкетирования (Questionnaire attempt id).
 *   3. "Последние атаки" (ТЗ Этапа 11, п.38) — попытки протащить в теле
 *      запроса чужой/произвольный studentId/qualificationPoint/
 *      finalGrade/correct в обход серверного вычисления.
 *
 * Использование: backend должен быть запущен (npm run dev), затем
 *   npx tsx scripts/verify-qa-audit-security.ts
 */
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";

const { check, summarize } = createChecker();

async function main() {
  const stamp = Date.now();
  console.log("\nЭтап 11 — целевые проверки безопасности (пробелы в покрытии)\n");

  // --- Подготовка: Teacher A / Group A / Student A, Student B (чужой) ---
  const teacherA: CookieJar = {};
  const studentA: CookieJar = {};
  const studentB: CookieJar = {};
  await registerUser(teacherA, `qa-teacher-a-${stamp}@example.com`, "Password123!", "TEACHER");
  await registerUser(studentA, `qa-student-a-${stamp}@example.com`, "Password123!", "STUDENT");
  await registerUser(studentB, `qa-student-b-${stamp}@example.com`, "Password123!", "STUDENT");

  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherA, body: { name: `QA Year ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherA, body: { name: `QA Course ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherA, body: { name: `QA Group ${stamp}`, courseId: course.body.id } });
  const groupB = await request("/api/teacher/groups", { method: "POST", jar: teacherA, body: { name: `QA Group B ${stamp}`, courseId: course.body.id } });

  await request("/api/student/groups/join", { method: "POST", jar: studentA, body: { code: group.body.joinCode.code } });
  await request("/api/student/groups/join", { method: "POST", jar: studentB, body: { code: groupB.body.joinCode.code } });

  // === 1. IDOR: Start Diagnostic attempt id ================================
  console.log("=== IDOR: Start Diagnostic (attempt id студента A угадан студентом B) ===");
  const diagA = await request("/api/student/diagnostic/attempts", { method: "POST", jar: studentA, body: { groupId: group.body.id } });
  check("Студент A создал попытку диагностики", diagA.status === 201, diagA.body);
  const diagAttemptId = diagA.body.id;

  const diagGetCross = await request(`/api/student/diagnostic/attempts/${diagAttemptId}`, { jar: studentB });
  check("Студент B не может прочитать попытку диагностики студента A — 404", diagGetCross.status === 404, diagGetCross);

  const firstItemId = diagA.body.blocks[0].items[0].id;
  const diagAnswerCross = await request(`/api/student/diagnostic/attempts/${diagAttemptId}/items/${firstItemId}/answer`, {
    method: "POST",
    jar: studentB,
    body: { selectedOptionIndex: 0 },
  });
  check("Студент B не может ответить на задание в попытке студента A — 404", diagAnswerCross.status === 404, diagAnswerCross);

  const diagCompleteCross = await request(`/api/student/diagnostic/attempts/${diagAttemptId}/complete`, { method: "POST", jar: studentB });
  check("Студент B не может завершить попытку диагностики студента A — 404", diagCompleteCross.status === 404, diagCompleteCross);

  const diagResultCross = await request(`/api/student/diagnostic/attempts/${diagAttemptId}/result`, { jar: studentB });
  check("Студент B не может прочитать результат попытки студента A — 404", diagResultCross.status === 404, diagResultCross);

  // Подтверждаем, что подмена НЕ создала и не изменила ничего у B:
  // попытка B создаётся отдельно и не содержит ответа, отправленного
  // от её имени в чужую попытку выше.
  const diagB = await request("/api/student/diagnostic/attempts", { method: "POST", jar: studentB, body: { groupId: groupB.body.id } });
  check("У студента B собственная, независимая попытка (свой id)", diagB.body.id !== diagAttemptId, { diagB: diagB.body.id, diagAttemptId });
  check("У попытки студента B нет ответов, «просочившихся» из попытки A", Object.keys(diagB.body.answers ?? {}).length === 0, diagB.body.answers);

  // === 2. IDOR: Questionnaire attempt id ====================================
  console.log("\n=== IDOR: Анкетирование (attempt id студента A угадан студентом B) ===");
  const qA = await request("/api/student/questionnaire/attempts", { method: "POST", jar: studentA, body: { groupId: group.body.id } });
  const qAttemptId = qA.body.id;

  const qGetCross = await request(`/api/student/questionnaire/attempts/${qAttemptId}`, { jar: studentB });
  check("Студент B не может прочитать анкету студента A — 404", qGetCross.status === 404, qGetCross);

  const qAnswerCross = await request(`/api/student/questionnaire/attempts/${qAttemptId}/answers`, {
    method: "PUT",
    jar: studentB,
    body: { code: "Q1", value: "Подмена ответа чужой анкеты" },
  });
  check("Студент B не может записать ответ в анкету студента A — 404", qAnswerCross.status === 404, qAnswerCross);

  const qCompleteCross = await request(`/api/student/questionnaire/attempts/${qAttemptId}/complete`, { method: "POST", jar: studentB });
  check("Студент B не может завершить анкету студента A — 404", qCompleteCross.status === 404, qCompleteCross);

  // Ответ студента A не был подменён попыткой B выше.
  const qAAfter = await request(`/api/student/questionnaire/attempts/${qAttemptId}`, { jar: studentA });
  check("Ответ Q1 в анкете студента A не изменился попыткой B", qAAfter.body.answers?.Q1 !== "Подмена ответа чужой анкеты", qAAfter.body.answers?.Q1);

  // === 3. "Последние атаки" — попытки протащить чужие/вычисляемые поля =====
  console.log("\n=== Попытки подмены серверно вычисляемых полей в теле запроса ===");

  // 3a. Достижение: попытка продиктовать qualificationPoint через decision.
  const achDraft = await request("/api/student/achievements", {
    method: "POST",
    jar: studentA,
    body: {
      groupId: group.body.id,
      eventName: "QA Event",
      eventDate: new Date().toISOString(),
      organizer: "QA Organizer",
      eventType: "CONFERENCE",
      claimedResult: "PARTICIPANT",
      description: "qa",
    },
  });
  const achId = achDraft.body?.id;
  if (achId) {
    await request(`/api/student/achievements/${achId}/submit`, { method: "POST", jar: studentA });
    // Примечание: SPEC.md §30.3 прямо запрещает придумывать таблицу
    // "сколько баллов даёт какой тип результата" — единственный
    // легитимный путь к баллу это явное решение преподавателя
    // (action=CONFIRM даёт 1, CONFIRM_NO_POINT даёт 0), НЕЗАВИСИМО от
    // заявленного студентом claimedResult. Поэтому здесь проверяем не
    // "PARTICIPANT ⇒ 0" (это предположение появилось бы из
    // невозможной, запрещённой ТЗ таблицы), а собственно защиту от
    // инъекции: подсунутые в теле запроса qualificationPoint=99/
    // points=99/studentId игнорируются, реальный балл — ровно 1 (то
    // есть детерминирован выбором action=CONFIRM на сервере).
    const decision = await request(`/api/teacher/achievements/${achId}/decision`, {
      method: "PATCH",
      jar: teacherA,
      body: { action: "CONFIRM", qualificationPoint: 99, points: 99, studentId: "someone-else" },
    });
    check(
      "Подсунутые в теле qualificationPoint=99/points=99 проигнорированы — начислен ровно 1 балл (детерминирован действием CONFIRM на сервере, не телом запроса)",
      decision.status === 200 && decision.body?.qualificationPoint === 1,
      decision.body
    );
  } else {
    check("Подготовка достижения для теста подмены балла (пропущено — см. body)", false, achDraft.body);
  }

  // 3b. Устная часть: попытка передать значение вне разрешённых 4 уровней.
  await request("/api/student/credit/" + group.body.id + "/dictionary", { method: "POST", jar: studentA, body: { wordCount: 900 } });
  const subs = await request(`/api/teacher/credit/groups/${group.body.id}/dictionary`, { jar: teacherA });
  const subId = Array.isArray(subs.body) ? subs.body[0]?.id : undefined;
  if (subId) {
    await request(`/api/teacher/credit/dictionary/${subId}/decision`, { method: "PATCH", jar: teacherA, body: { action: "CONFIRM" } });
  }
  const meA = await request("/api/auth/me", { jar: studentA });
  const studentAId = meA.body.id;
  const invalidGradeAttempt = await request(`/api/teacher/credit/groups/${group.body.id}/students/${studentAId}/oral/confirm`, {
    method: "POST",
    jar: teacherA,
    body: { finalGrade: "SUPER_EXCELLENT", comment: "qa" },
  });
  check(
    "Итоговая оценка устной части вне 4 утверждённых уровней отклонена (400 VALIDATION_ERROR)",
    invalidGradeAttempt.status === 400,
    invalidGradeAttempt.body
  );

  // 3c. Диагностика: попытка продиктовать результат ответа (correct=true) вместо серверного вычисления.
  const wrongOptionIndex = (() => {
    // Берём заведомо существующий индекс варианта, отличный от 0 — сама
    // корректность вычисляется сервером по банку заданий, клиент не
    // может сообщить "правильно" напрямую полем схемы (answerSchema
    // принимает только selectedOptionIndex — проверяем именно это).
    return 3;
  })();
  const forcedCorrect = await request(`/api/student/diagnostic/attempts/${diagAttemptId}/items/${firstItemId}/answer`, {
    method: "POST",
    jar: studentA,
    body: { selectedOptionIndex: wrongOptionIndex, correct: true, isCorrect: true },
  });
  check(
    "Поле «correct», подсунутое в теле запроса, отклонено схемой (400) или проигнорировано — ответ не хранит навязанное значение",
    forcedCorrect.status === 400 || forcedCorrect.body?.correct !== true || typeof forcedCorrect.body?.correct === "undefined",
    forcedCorrect
  );
  if (forcedCorrect.status === 200) {
    // Если сервер принял запрос (потому что индекс случайно верный),
    // явно проверяем: поле correct в ответе — это РЕЗУЛЬТАТ сравнения
    // с банком заданий, а не эхо клиентского значения true для
    // заведомо направленного на проверку сценария (доп. лог для чтения).
    console.log("   (доп. информация, не провал теста):", JSON.stringify(forcedCorrect.body));
  }

  // 3d. Progress Check: студент пытается назначить себе диагностику напрямую.
  const selfAssign = await request(`/api/teacher/progress-check/groups/${group.body.id}/assign`, {
    method: "POST",
    jar: studentA,
    body: { studentIds: [studentAId], periodStartAt: new Date().toISOString() },
  });
  check("Студент не может вызвать маршрут назначения Progress Check от своего имени — 403", selfAssign.status === 403, selfAssign);

  summarize();
}

main().catch((err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
});
