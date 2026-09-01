/**
 * Критическая проверка Этапа 4 (START PROFILE — анкетирование).
 *
 * Использует реальные HTTP-запросы к работающему backend. Чтобы не
 * перечислять вручную 45 ответов, для "счастливого пути" генератор
 * заполнения переиспользует общее определение анкеты
 * (src/questionnaire/definition.ts) — то же самое, которое использует
 * и сам сервер для валидации и проверки на завершение. Сама проверка
 * (коды ответов, содержимое БД, требование полноты) идёт независимо от
 * этого генератора и обращается к реальному API.
 *
 * Проверяет:
 *   - создание попытки привязано к student/group/course/academicYear;
 *   - повторный POST /attempts не создаёт вторую попытку (идемпотентно);
 *   - автосохранение ответа, валидация типа/вариантов/лимита выбора;
 *   - попытка завершить анкету с незаполненными обязательными вопросами
 *     отклоняется со списком недостающих кодов;
 *   - полное заполнение (с учётом ветвления) завершает анкету;
 *   - завершённую анкету нельзя редактировать (исторические данные);
 *   - повторный POST /attempts после завершения не создаёт новую попытку;
 *   - статус анкетирования в /api/student/groups становится реальным;
 *   - ветвление 1 (Q9 = "практически нигде" -> Q10 не обязателен) и
 *     ветвление 4 (Q25 = "точно не понадобится" -> Q26/Q27 не обязательны)
 *     реально пропускают вопросы при проверке полноты;
 *   - изоляция: Student B не может открыть попытку Student A.
 *
 * Запуск: npm run verify:questionnaire (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";
import { getVisibleQuestions, hasAnswer, type QuestionDef } from "../src/questionnaire/definition";

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
  const res = await request(`/api/student/questionnaire/attempts/${attemptId}`, { jar });
  return res;
}

async function autofillRequired(jar: CookieJar, attemptId: string, overrides: Record<string, unknown> = {}) {
  // Сначала — переопределения (они могут повлиять на видимость других
  // вопросов из-за ветвления), затем несколько проходов автозаполнения,
  // пока не заполнены все видимые обязательные вопросы.
  for (const [code, value] of Object.entries(overrides)) {
    const res = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
      method: "PUT",
      jar,
      body: { code, value },
    });
    if (res.status !== 204) throw new Error(`Не удалось сохранить override ${code}: ${JSON.stringify(res.body)}`);
  }

  for (let pass = 0; pass < 6; pass++) {
    const attempt = (await getAttempt(jar, attemptId)).body;
    const answers = attempt.answers as Record<string, unknown>;
    const visible = getVisibleQuestions(answers);
    const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length === 0) return;
    for (const q of missing) {
      if (q.code in overrides) continue; // уже задано выше — не перетираем дефолтом
      const res = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
        method: "PUT",
        jar,
        body: { code: q.code, value: defaultValueFor(q) },
      });
      if (res.status !== 204) throw new Error(`Не удалось сохранить ${q.code}: ${JSON.stringify(res.body)}`);
    }
  }
  throw new Error("Автозаполнение не сошлось за 6 проходов — возможна циклическая зависимость ветвления.");
}

async function setupTeacherStudentGroup(stamp: number, suffix: string) {
  const teacherJar: CookieJar = {};
  await registerUser(teacherJar, `teacher-q-${suffix}-${stamp}@example.com`, "Password123!", "TEACHER");
  const year = await request("/api/teacher/academic-years", { method: "POST", jar: teacherJar, body: { name: `Год Q ${suffix} ${stamp}` } });
  const course = await request("/api/teacher/courses", { method: "POST", jar: teacherJar, body: { name: `Курс Q ${suffix} ${stamp}`, academicYearId: year.body.id } });
  const group = await request("/api/teacher/groups", { method: "POST", jar: teacherJar, body: { name: `Группа Q ${suffix} ${stamp}`, courseId: course.body.id } });

  const studentJar: CookieJar = {};
  await registerUser(studentJar, `student-q-${suffix}-${stamp}@example.com`, "Password123!", "STUDENT");
  await request("/api/student/groups/join", { method: "POST", jar: studentJar, body: { code: group.body.joinCode.code } });

  return { teacherJar, studentJar, year: year.body, course: course.body, group: group.body };
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка START PROFILE (анкетирование)\n`);

  console.log("Готовим преподавателя, группу и студента...");
  const main1 = await setupTeacherStudentGroup(stamp, "main");

  console.log("\nЗащита от гонки: два параллельных POST /attempts не создают две попытки");
  const raceSetup = await setupTeacherStudentGroup(stamp, "race");
  const [raceA, raceB] = await Promise.all([
    request("/api/student/questionnaire/attempts", { method: "POST", jar: raceSetup.studentJar, body: { groupId: raceSetup.group.id } }),
    request("/api/student/questionnaire/attempts", { method: "POST", jar: raceSetup.studentJar, body: { groupId: raceSetup.group.id } }),
  ]);
  check("Оба параллельных запроса завершились успешно (201 или 200)", [200, 201].includes(raceA.status) && [200, 201].includes(raceB.status), { raceA: raceA.status, raceB: raceB.status });
  check("Оба параллельных запроса вернули один и тот же id попытки", raceA.body?.id === raceB.body?.id, { a: raceA.body?.id, b: raceB.body?.id });
  const raceAttemptCountByGroup = await prisma.questionnaireAttempt.count({ where: { groupId: raceSetup.group.id } });
  check("В БД для этой группы создана ровно одна попытка, а не две", raceAttemptCountByGroup === 1, raceAttemptCountByGroup);

  console.log("\nСоздание попытки");
  const created = await request("/api/student/questionnaire/attempts", {
    method: "POST",
    jar: main1.studentJar,
    body: { groupId: main1.group.id },
  });
  check("Создание попытки — 201", created.status === 201, created);
  check("Статус новой попытки — IN_PROGRESS", created.body?.status === "IN_PROGRESS", created.body);
  check("Анкета содержит 13 блоков (Q1–Q45 + метакогнитивный)", created.body?.blocks?.length === 13, created.body?.blocks);

  const attemptId = created.body.id;
  const dbAttempt = await prisma.questionnaireAttempt.findUnique({ where: { id: attemptId } });
  check(
    "В БД попытка привязана к student_id/group_id/course_id/academic_year_id",
    Boolean(dbAttempt?.studentId) && dbAttempt?.groupId === main1.group.id && dbAttempt?.courseId === main1.course.id && dbAttempt?.academicYearId === main1.year.id,
    dbAttempt
  );

  console.log("\nПовторный POST /attempts не создаёт вторую попытку");
  const createdAgain = await request("/api/student/questionnaire/attempts", {
    method: "POST",
    jar: main1.studentJar,
    body: { groupId: main1.group.id },
  });
  check("Повторный POST возвращает ту же попытку (200)", createdAgain.status === 200 && createdAgain.body.id === attemptId, createdAgain.body);
  const countAfterSecondPost = await prisma.questionnaireAttempt.count({ where: { studentId: dbAttempt!.studentId, groupId: main1.group.id } });
  check("В БД всего одна попытка для этой пары (студент, группа)", countAfterSecondPost === 1, countAfterSecondPost);

  console.log("\nАвтосохранение и валидация ответа");
  const saveQ1 = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
    method: "PUT",
    jar: main1.studentJar,
    body: { code: "Q1", value: "Иванова Анна" },
  });
  check("Сохранение корректного текстового ответа — 204", saveQ1.status === 204, saveQ1);

  const saveUnknown = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
    method: "PUT",
    jar: main1.studentJar,
    body: { code: "Q999", value: "x" },
  });
  check("Сохранение ответа на несуществующий вопрос — 400 UNKNOWN_QUESTION", saveUnknown.status === 400 && saveUnknown.body?.error === "UNKNOWN_QUESTION", saveUnknown);

  const saveBadOption = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
    method: "PUT",
    jar: main1.studentJar,
    body: { code: "Q2", value: "not_a_real_option" },
  });
  check("Недопустимый вариант single-choice — 400 INVALID_ANSWER", saveBadOption.status === 400 && saveBadOption.body?.error === "INVALID_ANSWER", saveBadOption);

  const saveTooManySelections = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
    method: "PUT",
    jar: main1.studentJar,
    body: { code: "Q8", value: ["no_purpose", "hard", "no_time"] }, // Q8: максимум 2
  });
  check(
    "Превышение лимита выбора (Q8, максимум 2) — 400 INVALID_ANSWER",
    saveTooManySelections.status === 400 && saveTooManySelections.body?.error === "INVALID_ANSWER",
    saveTooManySelections
  );

  console.log("\nЗавершение с незаполненными обязательными вопросами отклоняется");
  const incompleteComplete = await request(`/api/student/questionnaire/attempts/${attemptId}/complete`, {
    method: "POST",
    jar: main1.studentJar,
  });
  check("Завершение неполной анкеты — 400 INCOMPLETE", incompleteComplete.status === 400 && incompleteComplete.body?.error === "INCOMPLETE", incompleteComplete);
  check("Список missing непустой", Array.isArray(incompleteComplete.body?.missing) && incompleteComplete.body.missing.length > 0, incompleteComplete.body?.missing);

  console.log("\nВосстановление черновика после сохранения (имитация возврата на сайт)");
  const resumed = await getAttempt(main1.studentJar, attemptId);
  check("Ранее сохранённый ответ Q1 виден после повторного GET", resumed.body?.answers?.Q1 === "Иванова Анна", resumed.body?.answers?.Q1);

  console.log("\nПолное заполнение анкеты (автозаполнение по общему определению вопросов) и завершение");
  await autofillRequired(main1.studentJar, attemptId, {
    Q9: ["social_media", "youtube_video"], // не "practically_nowhere" — держим Q10 видимым
    Q25: "probably_yes", // не "definitely_not" — держим Q26/Q27 видимыми
    Q35: ["translation"], // не "not_using_ai" — держим Q36 видимым
  });
  const completed = await request(`/api/student/questionnaire/attempts/${attemptId}/complete`, {
    method: "POST",
    jar: main1.studentJar,
  });
  check("Завершение полностью заполненной анкеты — 200", completed.status === 200, completed);
  check("Статус попытки — COMPLETED", completed.body?.status === "COMPLETED", completed.body?.status);
  check("completedAt проставлен", !!completed.body?.completedAt, completed.body?.completedAt);

  console.log("\nЗавершённую анкету нельзя редактировать");
  const editAfterComplete = await request(`/api/student/questionnaire/attempts/${attemptId}/answers`, {
    method: "PUT",
    jar: main1.studentJar,
    body: { code: "Q1", value: "Попытка изменить после завершения" },
  });
  check("Изменение ответа после завершения — 409 ATTEMPT_COMPLETED", editAfterComplete.status === 409 && editAfterComplete.body?.error === "ATTEMPT_COMPLETED", editAfterComplete);

  console.log("\nПовторный POST /attempts после завершения не создаёт новую попытку");
  const createdAfterComplete = await request("/api/student/questionnaire/attempts", {
    method: "POST",
    jar: main1.studentJar,
    body: { groupId: main1.group.id },
  });
  check("После завершения POST возвращает ту же (завершённую) попытку", createdAfterComplete.status === 200 && createdAfterComplete.body.id === attemptId, createdAfterComplete.body);
  const countAfterComplete = await prisma.questionnaireAttempt.count({ where: { studentId: dbAttempt!.studentId, groupId: main1.group.id } });
  check("В БД по-прежнему одна попытка (историю не задвоили)", countAfterComplete === 1, countAfterComplete);

  console.log("\nСтатус анкетирования в /api/student/groups стал реальным");
  const groupsList = await request("/api/student/groups", { jar: main1.studentJar });
  const entry = groupsList.body.find((g: any) => g.group.id === main1.group.id);
  check("startDiagnosticStatus = COMPLETED в списке групп студента", entry?.startDiagnosticStatus === "COMPLETED", entry);

  console.log("\nВетвление 1: «практически нигде» -> Q10 не обязателен для завершения");
  const branch1 = await setupTeacherStudentGroup(stamp, "branch1");
  const attempt1 = (await request("/api/student/questionnaire/attempts", { method: "POST", jar: branch1.studentJar, body: { groupId: branch1.group.id } })).body;
  await autofillRequired(branch1.studentJar, attempt1.id, { Q9: ["practically_nowhere"] });
  const complete1 = await request(`/api/student/questionnaire/attempts/${attempt1.id}/complete`, { method: "POST", jar: branch1.studentJar });
  check("Завершение успешно без ответа на Q10 (скрыт ветвлением)", complete1.status === 200, complete1.body);
  const attempt1Full = await getAttempt(branch1.studentJar, attempt1.id);
  check("Q10 действительно не сохранён (вопрос не показывался)", attempt1Full.body?.answers?.Q10 === undefined, attempt1Full.body?.answers?.Q10);

  console.log("\nВетвление 4: «точно не понадобится» -> Q26/Q27 не обязательны, Q25_ALT остаётся необязательным");
  const branch4 = await setupTeacherStudentGroup(stamp, "branch4");
  const attempt4 = (await request("/api/student/questionnaire/attempts", { method: "POST", jar: branch4.studentJar, body: { groupId: branch4.group.id } })).body;
  await autofillRequired(branch4.studentJar, attempt4.id, { Q25: "definitely_not" });
  const complete4 = await request(`/api/student/questionnaire/attempts/${attempt4.id}/complete`, { method: "POST", jar: branch4.studentJar });
  check("Завершение успешно без ответа на Q26/Q27 (скрыты ветвлением)", complete4.status === 200, complete4.body);
  const attempt4Full = await getAttempt(branch4.studentJar, attempt4.id);
  check(
    "Q26 и Q27 действительно не сохранены",
    attempt4Full.body?.answers?.Q26 === undefined && attempt4Full.body?.answers?.Q27 === undefined,
    attempt4Full.body?.answers
  );

  console.log("\nИзоляция: Student B не может открыть попытку Student A");
  const outsider: CookieJar = {};
  await registerUser(outsider, `student-q-outsider-${stamp}@example.com`, "Password123!", "STUDENT");
  const crossAccess = await getAttempt(outsider, attemptId);
  check("Чужая попытка недоступна по id (404)", crossAccess.status === 404, crossAccess);

  console.log("\nПреподаватель не может вызывать студенческие маршруты анкеты");
  const teacherTries = await request("/api/student/questionnaire/attempts", {
    method: "POST",
    jar: main1.teacherJar,
    body: { groupId: main1.group.id },
  });
  check("POST /attempts от преподавателя — 403", teacherTries.status === 403, teacherTries);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
