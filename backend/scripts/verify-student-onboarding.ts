/**
 * Критическая проверка Этапа 3 (подключение студента к группе).
 *
 * Проверяет реальными HTTP-запросами:
 *   - превью корректного кода показывает группу/курс/год/преподавателя;
 *   - подтверждение создаёт ровно одну запись GroupMembership;
 *   - неверный/несуществующий, отключённый и просроченный код дают
 *     понятные и РАЗНЫЕ ошибки;
 *   - повторное присоединение не создаёт дубликат membership и
 *     возвращает "Вы уже состоите в этой группе.";
 *   - код архивной группы работает так же, как отключённый;
 *   - список групп студента виден только ему самому (Student A не
 *     видит группы Student B и наоборот) и содержит статус
 *     "Стартовая диагностика: не пройдена".
 *
 * Запуск: npm run verify:onboarding (backend должен быть запущен).
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";

const { check, summarize } = createChecker();
const prisma = new PrismaClient();

async function setupTeacherWithGroup(stamp: number, label: string, specialty: string) {
  const jar: CookieJar = {};
  await registerUser(jar, `teacher-onb-${label}-${stamp}@example.com`, "Password123!", "TEACHER");
  await request("/api/teacher/profile", {
    method: "PUT",
    jar,
    body: { fullName: `Преподаватель ${label} ${stamp}`, organization: "", department: "", position: "", workEmail: "" },
  });
  const year = await request("/api/teacher/academic-years", { method: "POST", jar, body: { name: `Год ${label} ${stamp}` } });
  const course = await request("/api/teacher/courses", {
    method: "POST",
    jar,
    body: { name: `Курс ${label} ${stamp}`, academicYearId: year.body.id },
  });
  const group = await request("/api/teacher/groups", {
    method: "POST",
    jar,
    body: { name: `Группа ${label} ${stamp}`, courseId: course.body.id, specialty },
  });
  return { jar, year: year.body, course: course.body, group: group.body };
}

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка Student Onboarding (подключение по коду)\n`);

  console.log("Готовим Teacher + Group (обычная активная группа)...");
  const t = await setupTeacherWithGroup(stamp, "T", "Финансы");
  console.log("Готовим вторую Teacher + Group (для проверки изоляции списков студента)...");
  const t2 = await setupTeacherWithGroup(stamp, "T2", "Логистика");

  const studentA: CookieJar = {};
  const studentB: CookieJar = {};
  await registerUser(studentA, `student-onb-a-${stamp}@example.com`, "Password123!", "STUDENT");
  await registerUser(studentB, `student-onb-b-${stamp}@example.com`, "Password123!", "STUDENT");

  console.log("\nПревью корректного кода");
  const preview = await request("/api/student/groups/preview", { method: "POST", jar: studentA, body: { code: t.group.joinCode.code } });
  check("Превью корректного кода — 200", preview.status === 200, preview);
  check("Превью содержит название группы", preview.body?.group?.name === t.group.name, preview.body);
  check("Превью содержит курс", preview.body?.group?.course === t.course.name, preview.body);
  check("Превью содержит учебный год", preview.body?.group?.academicYear === t.year.name, preview.body);
  check(
    "Превью содержит имя преподавателя",
    typeof preview.body?.group?.teacherName === "string" && preview.body.group.teacherName.includes("Преподаватель T "),
    preview.body
  );
  check("Превью: alreadyMember = false до подключения", preview.body?.alreadyMember === false, preview.body);

  console.log("\nПревью нечувствительно к регистру и пробелам");
  const previewLowercase = await request("/api/student/groups/preview", {
    method: "POST",
    jar: studentA,
    body: { code: `  ${t.group.joinCode.code.toLowerCase()}  ` },
  });
  check("Код в нижнем регистре с пробелами тоже находит группу", previewLowercase.status === 200, previewLowercase);

  console.log("\nПодтверждение присоединения");
  const join = await request("/api/student/groups/join", { method: "POST", jar: studentA, body: { code: t.group.joinCode.code } });
  check("Подтверждение присоединения — 201", join.status === 201, join);
  check("Ответ содержит membership", typeof join.body?.membership?.id === "string", join.body);

  const membershipCountAfterFirstJoin = await prisma.groupMembership.count({ where: { groupId: t.group.id } });
  check("В БД ровно одна запись GroupMembership для этой группы", membershipCountAfterFirstJoin === 1, membershipCountAfterFirstJoin);

  console.log("\nПовторное присоединение по тому же коду — без дубликата");
  const rejoin = await request("/api/student/groups/join", { method: "POST", jar: studentA, body: { code: t.group.joinCode.code } });
  check("Повторное присоединение — 200 (не ошибка)", rejoin.status === 200, rejoin);
  check("Сообщение: «Вы уже состоите в этой группе.»", rejoin.body?.message === "Вы уже состоите в этой группе.", rejoin.body);
  check("alreadyMember = true при повторном присоединении", rejoin.body?.alreadyMember === true, rejoin.body);

  const membershipCountAfterRejoin = await prisma.groupMembership.count({ where: { groupId: t.group.id } });
  check("Повторное присоединение НЕ создало вторую запись", membershipCountAfterRejoin === 1, membershipCountAfterRejoin);

  const previewAfterJoin = await request("/api/student/groups/preview", { method: "POST", jar: studentA, body: { code: t.group.joinCode.code } });
  check("Превью после присоединения тоже показывает alreadyMember = true", previewAfterJoin.body?.alreadyMember === true, previewAfterJoin.body);

  console.log("\nНесуществующий код");
  const notFound = await request("/api/student/groups/preview", { method: "POST", jar: studentB, body: { code: "ENG-00000" } });
  check("Несуществующий код — 404 CODE_NOT_FOUND", notFound.status === 404 && notFound.body?.error === "CODE_NOT_FOUND", notFound);

  console.log("\nОтключённый код (преподаватель деактивировал)");
  const groupForDisabled = await setupTeacherWithGroup(stamp, "DIS", "Банковское дело");
  await request(`/api/teacher/groups/${groupForDisabled.group.id}/join-code/deactivate`, { method: "POST", jar: groupForDisabled.jar });
  const disabled = await request("/api/student/groups/preview", {
    method: "POST",
    jar: studentB,
    body: { code: groupForDisabled.group.joinCode.code },
  });
  check("Отключённый код — 410 CODE_DISABLED", disabled.status === 410 && disabled.body?.error === "CODE_DISABLED", disabled);

  console.log("\nПросроченный код");
  const groupForExpired = await setupTeacherWithGroup(stamp, "EXP", "Экономика");
  await prisma.groupJoinCode.updateMany({
    where: { groupId: groupForExpired.group.id, active: true },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const expired = await request("/api/student/groups/preview", {
    method: "POST",
    jar: studentB,
    body: { code: groupForExpired.group.joinCode.code },
  });
  check("Просроченный код — 410 CODE_EXPIRED", expired.status === 410 && expired.body?.error === "CODE_EXPIRED", expired);
  check(
    "Сообщение об истёкшем коде отличается от сообщения об отключённом",
    expired.body?.message !== disabled.body?.message,
    { expired: expired.body?.message, disabled: disabled.body?.message }
  );

  console.log("\nКод архивной группы");
  const groupForArchive = await setupTeacherWithGroup(stamp, "ARC", "Логистика");
  const archiveCode = groupForArchive.group.joinCode.code;
  await request(`/api/teacher/groups/${groupForArchive.group.id}/archive`, { method: "POST", jar: groupForArchive.jar });
  const archivedPreview = await request("/api/student/groups/preview", { method: "POST", jar: studentB, body: { code: archiveCode } });
  check(
    "Код архивной группы деактивирован автоматически — 410 CODE_DISABLED",
    archivedPreview.status === 410 && archivedPreview.body?.error === "CODE_DISABLED",
    archivedPreview
  );

  console.log("\nПопытка присоединиться по нерабочему коду не создаёт membership");
  const joinDisabled = await request("/api/student/groups/join", {
    method: "POST",
    jar: studentB,
    body: { code: groupForDisabled.group.joinCode.code },
  });
  check("Присоединение по отключённому коду — 410, не 201", joinDisabled.status === 410, joinDisabled);
  const membershipCountDisabled = await prisma.groupMembership.count({ where: { groupId: groupForDisabled.group.id } });
  check("Membership для отключённой группы не создан", membershipCountDisabled === 0, membershipCountDisabled);

  console.log("\nStudent B присоединяется к группе Teacher T2 (для проверки изоляции списков)");
  const joinB = await request("/api/student/groups/join", { method: "POST", jar: studentB, body: { code: t2.group.joinCode.code } });
  check("Student B присоединился к своей группе — 201", joinB.status === 201, joinB);

  console.log("\nСписок групп студента: виден только ему, содержит статус диагностики");
  const listA = await request("/api/student/groups", { jar: studentA });
  check("Список Student A содержит ровно одну группу (T)", Array.isArray(listA.body) && listA.body.length === 1, listA.body);
  check(
    "Список Student A содержит статус «не пройдена»",
    listA.body?.[0]?.startDiagnosticStatus === "NOT_STARTED",
    listA.body
  );
  check(
    "Список Student A НЕ содержит группу Student B (T2)",
    !listA.body.some((m: any) => m.group.id === t2.group.id),
    listA.body
  );

  const listB = await request("/api/student/groups", { jar: studentB });
  check(
    "Список Student B НЕ содержит группу Student A (T)",
    !listB.body.some((m: any) => m.group.id === t.group.id),
    listB.body
  );

  console.log("\nБез аутентификации / без роли STUDENT");
  const noAuth = await request("/api/student/groups", {});
  check("Без токена /api/student/groups недоступен (401)", noAuth.status === 401, noAuth);

  const teacherTriesJoin = await request("/api/student/groups/join", { method: "POST", jar: t.jar, body: { code: t.group.joinCode.code } });
  check("Преподаватель не может вызвать /api/student/groups/join (403)", teacherTriesJoin.status === 403, teacherTriesJoin);

  summarize();
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
  await prisma.$disconnect();
});
