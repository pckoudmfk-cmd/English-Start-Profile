/**
 * Критическая проверка Этапа 5 (START DIAGNOSTIC — объективная
 * проверка языковых навыков).
 *
 * Проверяет реальными HTTP-запросами:
 *   - модуль отдельный от анкетирования (свой набор маршрутов и
 *     собственная модель данных — не переиспользует QuestionnaireAttempt);
 *   - банк заданий отдаётся БЕЗ correctOptionIndex — правильный ответ
 *     нельзя увидеть в ответе API до отправки своего варианта;
 *   - ответ на задание проверяется корректно (правильный/неправильный),
 *     возвращается русский feedback;
 *   - повторная отправка ответа на тот же item идемпотентна и не
 *     позволяет "переответить";
 *   - защита от гонки при создании попытки (как и в Этапе 4);
 *   - завершение с недостающими ответами отклоняется;
 *   - результат содержит общий и по-навыковый результат, но НЕ содержит
 *     фиктивного диагностического диапазона (A1/A2/B1/B2) — поле
 *     `diagnosticRange` остаётся null;
 *   - завершённую попытку нельзя редактировать, повторный complete
 *     идемпотентен;
 *   - изоляция между студентами.
 *
 * Запуск: npm run verify:diagnostic (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";
import { DIAGNOSTIC_ITEMS } from "../src/diagnostic/itemBank";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

async function setupTeacherStudentGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-diag-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Y ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `C ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `G ${suffix} ${stamp}`, courseId: course.body.id } });

  const studentJar: CookieJar = {};
  await registerUser(studentJar, `student-diag-${suffix}-${stamp}@example.com`, "Password123!", "STUDENT");
  await request("/api/student/groups/join", { method: "POST", jar: studentJar, body: { code: group.body.joinCode.code } });

  return { teacherJar, studentJar, group: group.body };
}

async function answerItem(jar: CookieJar, attemptId: string, itemId: string, selectedOptionIndex: number) {
  return request(`/api/student/diagnostic/attempts/${attemptId}/items/${itemId}/answer`, {
    method: "POST",
    jar,
    body: { selectedOptionIndex },
  });
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка START DIAGNOSTIC (объективная диагностика)\n`);

  const t = await setupTeacherStudentGroup(stamp, "main");

  console.log("Защита от гонки: два параллельных POST /attempts");
  const raceSetup = await setupTeacherStudentGroup(stamp, "race");
  const [raceA, raceB] = await Promise.all([
    request("/api/student/diagnostic/attempts", { method: "POST", jar: raceSetup.studentJar, body: { groupId: raceSetup.group.id } }),
    request("/api/student/diagnostic/attempts", { method: "POST", jar: raceSetup.studentJar, body: { groupId: raceSetup.group.id } }),
  ]);
  check("Оба параллельных запроса успешны", [200, 201].includes(raceA.status) && [200, 201].includes(raceB.status), { a: raceA.status, b: raceB.status });
  check("Оба вернули один и тот же id попытки", raceA.body?.id === raceB.body?.id, { a: raceA.body?.id, b: raceB.body?.id });
  const raceCount = await prisma.diagnosticAttempt.count({ where: { groupId: raceSetup.group.id } });
  check("В БД для этой группы ровно одна попытка", raceCount === 1, raceCount);

  console.log("\nСоздание попытки");
  const created = await request("/api/student/diagnostic/attempts", { method: "POST", jar: t.studentJar, body: { groupId: t.group.id } });
  check("Создание попытки — 201", created.status === 201, created);
  check("Статус — IN_PROGRESS", created.body?.status === "IN_PROGRESS", created.body?.status);
  const attemptId = created.body.id;

  console.log("\nБанк заданий отдаётся без правильных ответов");
  const bodyText = JSON.stringify(created.body);
  check("В ответе нет поля correctOptionIndex", !bodyText.includes("correctOptionIndex"), null);
  check("Есть все 4 блока (Grammar/Vocabulary/Reading/Listening)", created.body?.blocks?.length === 4, created.body?.blocks?.map((b: any) => b.skill));
  check(
    "Общее число заданий в ответе совпадает с банком заданий",
    created.body?.totalItems === DIAGNOSTIC_ITEMS.length,
    { fromApi: created.body?.totalItems, fromBank: DIAGNOSTIC_ITEMS.length }
  );

  console.log("\nМодуль отдельный от анкетирования — разные записи в БД");
  const questionnaireAttemptForSameGroup = await prisma.questionnaireAttempt.findFirst({ where: { studentId: created.body.studentId ?? undefined, groupId: t.group.id } });
  check("Нет случайного пересечения с QuestionnaireAttempt по этой группе (студент ещё не проходил анкету)", questionnaireAttemptForSameGroup === null, questionnaireAttemptForSameGroup);

  console.log("\nОтвет на задание: правильный и неправильный вариант");
  const grammarItem = DIAGNOSTIC_ITEMS.find((i) => i.id === "grammar-be")!;
  const correctAnswer = await answerItem(t.studentJar, attemptId, grammarItem.id, grammarItem.correctOptionIndex);
  check("Правильный ответ засчитан — 201, correct: true", correctAnswer.status === 201 && correctAnswer.body?.correct === true, correctAnswer.body);
  check("Feedback на русском для верного ответа", correctAnswer.body?.feedbackRu === "Верно!", correctAnswer.body?.feedbackRu);

  const wrongIndex = (grammarItem.correctOptionIndex + 1) % grammarItem.optionsEn.length;
  const wrongAnswerItem = DIAGNOSTIC_ITEMS.find((i) => i.id === "grammar-have")!;
  const wrongAnswer = await answerItem(t.studentJar, attemptId, wrongAnswerItem.id, (wrongAnswerItem.correctOptionIndex + 1) % wrongAnswerItem.optionsEn.length);
  check("Неверный ответ засчитан — correct: false", wrongAnswer.body?.correct === false, wrongAnswer.body);
  check("Feedback на русском содержит правильный ответ", wrongAnswer.body?.feedbackRu?.includes("Правильный ответ"), wrongAnswer.body?.feedbackRu);
  void wrongIndex;

  console.log("\nПовторная отправка ответа на тот же item — идемпотентно, не переответить");
  const reAnswer = await answerItem(t.studentJar, attemptId, grammarItem.id, wrongIndex); // пробуем "исправить" на заведомо другой (неверный) вариант
  check("Повторный ответ — 200 (не создание новой записи)", reAnswer.status === 200, reAnswer);
  check("Результат остался прежним (верным), несмотря на другой присланный вариант", reAnswer.body?.correct === true, reAnswer.body);
  const answerCount = await prisma.diagnosticAnswer.count({ where: { attemptId, itemId: grammarItem.id } });
  check("В БД для этого item ровно одна запись ответа", answerCount === 1, answerCount);

  console.log("\nНеизвестное задание и недопустимый вариант");
  const unknownItem = await answerItem(t.studentJar, attemptId, "no-such-item", 0);
  check("Ответ на несуществующее задание — 400 UNKNOWN_ITEM", unknownItem.status === 400 && unknownItem.body?.error === "UNKNOWN_ITEM", unknownItem);
  const outOfRange = await answerItem(t.studentJar, attemptId, "grammar-past-simple", 99);
  check("Вариант вне диапазона — 400 INVALID_ANSWER", outOfRange.status === 400 && outOfRange.body?.error === "INVALID_ANSWER", outOfRange);

  console.log("\nЗавершение с недостающими ответами отклоняется");
  const incomplete = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar: t.studentJar });
  check("Завершение — 400 INCOMPLETE", incomplete.status === 400 && incomplete.body?.error === "INCOMPLETE", incomplete);
  check("Список missing непустой", Array.isArray(incomplete.body?.missing) && incomplete.body.missing.length > 0, incomplete.body?.missing?.length);

  console.log("\nОтвечаем на все оставшиеся задания (выбираем заведомо правильные варианты)...");
  for (const item of DIAGNOSTIC_ITEMS) {
    if (item.id === grammarItem.id || item.id === wrongAnswerItem.id) continue; // уже отвечены выше
    await answerItem(t.studentJar, attemptId, item.id, item.correctOptionIndex);
  }

  console.log("\nЗавершение полностью заполненной диагностики");
  const completed = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar: t.studentJar });
  check("Завершение — 200", completed.status === 200, completed);
  check(
    "overallCorrect/overallTotal согласованы (всё верно, кроме одного намеренно неверного ответа)",
    completed.body?.overallCorrect === DIAGNOSTIC_ITEMS.length - 1 && completed.body?.overallTotal === DIAGNOSTIC_ITEMS.length,
    completed.body
  );
  check(
    "skillBreakdown содержит все 4 навыка",
    Array.isArray(completed.body?.skillBreakdown) && completed.body.skillBreakdown.length === 4,
    completed.body?.skillBreakdown
  );
  check(
    "Навык GRAMMAR отражает один неверный ответ (has-two-dogs)",
    completed.body?.skillBreakdown?.find((s: any) => s.skill === "GRAMMAR")?.correct ===
      DIAGNOSTIC_ITEMS.filter((i) => i.skill === "GRAMMAR").length - 1,
    completed.body?.skillBreakdown
  );
  check(
    "diagnosticRange остаётся null (нет утверждённой матрицы порогов — не выдумываем CEFR)",
    completed.body?.diagnosticRange === null,
    completed.body?.diagnosticRange
  );
  check(
    "В ответе результата нет ни одной готовой CEFR-метки (A1/A2/B1/B2) рядом с процентом",
    !JSON.stringify(completed.body).match(/"[AB][12]"/),
    completed.body
  );

  console.log("\nЗавершённую попытку нельзя редактировать, повторный complete идемпотентен");
  const editAfterComplete = await answerItem(t.studentJar, attemptId, "vocab-bargain", 0);
  check("Ответ после завершения — 409 ATTEMPT_COMPLETED", editAfterComplete.status === 409 && editAfterComplete.body?.error === "ATTEMPT_COMPLETED", editAfterComplete);
  const completeAgain = await request(`/api/student/diagnostic/attempts/${attemptId}/complete`, { method: "POST", jar: t.studentJar });
  check("Повторный complete — 200, тот же результат", completeAgain.status === 200 && completeAgain.body?.overallCorrect === completed.body?.overallCorrect, completeAgain.body);

  console.log("\nСтатус диагностики в /api/student/groups стал реальным");
  const groupsList = await request("/api/student/groups", { jar: t.studentJar });
  const entry = groupsList.body.find((g: any) => g.group.id === t.group.id);
  check("startDiagnosticStatus = COMPLETED в списке групп", entry?.startDiagnosticStatus === "COMPLETED", entry);
  check("questionnaireStatus остаётся отдельным полем (не смешано)", entry?.questionnaireStatus === "NOT_STARTED", entry);

  console.log("\nИзоляция: Student B не может открыть попытку Student A");
  const outsider: CookieJar = {};
  await registerUser(outsider, `student-diag-outsider-${stamp}@example.com`, "Password123!", "STUDENT");
  const crossAccess = await request(`/api/student/diagnostic/attempts/${attemptId}`, { jar: outsider });
  check("Чужая попытка недоступна по id (404)", crossAccess.status === 404, crossAccess);
  const crossResult = await request(`/api/student/diagnostic/attempts/${attemptId}/result`, { jar: outsider });
  check("Чужой результат недоступен по id (404)", crossResult.status === 404, crossResult);

  console.log("\nБез аутентификации / без роли STUDENT");
  const noAuth = await request(`/api/student/diagnostic/attempts/${attemptId}`, {});
  check("Без токена — 401", noAuth.status === 401, noAuth);
  const teacherTries = await request("/api/student/diagnostic/attempts", { method: "POST", jar: t.teacherJar, body: { groupId: t.group.id } });
  check("Преподаватель не может вызвать маршрут студента — 403", teacherTries.status === 403, teacherTries);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
