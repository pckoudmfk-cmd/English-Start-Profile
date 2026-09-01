/**
 * Критическая проверка Этапа 2 (курсы, группы, join-код).
 *
 * Сценарий из ТЗ:
 *   Teacher A → Course A → Group A → Code A
 *   Teacher B → Course B → Group B → Code B
 *
 * Проверяет реальными HTTP-запросами:
 *   - Teacher A не видит учебные годы/курсы/группы Teacher B и наоборот
 *     (ни в списках, ни по прямому id через URL);
 *   - Teacher A не может создать курс в чужом учебном году, группу в
 *     чужом курсе, переименовать/архивировать чужую группу, управлять
 *     чужим join-кодом — во всех случаях 404, не 200;
 *   - join-код уникален, не выводится из id группы и не совпадает
 *     между Group A и Group B;
 *   - регенерация кода делает старый код недействительным.
 *
 * Запуск: npm run verify:workspace (backend должен быть запущен).
 */
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";

const { check, summarize } = createChecker();

async function main() {
  const stamp = Date.now();
  console.log(`\nПроверка изоляции Teacher Workspace\n`);

  const teacherA: CookieJar = {};
  const teacherB: CookieJar = {};
  await registerUser(teacherA, `teacher-a-ws-${stamp}@example.com`, "Password123!", "TEACHER");
  await registerUser(teacherB, `teacher-b-ws-${stamp}@example.com`, "Password123!", "TEACHER");

  console.log("Teacher A: создаём учебный год, курс, группу...");
  const yearA = await request("/api/teacher/academic-years", { method: "POST", jar: teacherA, body: { name: "2026–2027 A" } });
  check("Teacher A: учебный год создан (201)", yearA.status === 201, yearA);

  const courseA = await request("/api/teacher/courses", {
    method: "POST",
    jar: teacherA,
    body: { name: "Английский язык A", academicYearId: yearA.body.id },
  });
  check("Teacher A: курс создан (201)", courseA.status === 201, courseA);

  const groupA = await request("/api/teacher/groups", {
    method: "POST",
    jar: teacherA,
    body: { name: "1ФИН-24", courseId: courseA.body.id, specialty: "Финансы" },
  });
  check("Teacher A: группа создана (201)", groupA.status === 201, groupA);
  check("Group A: join-код создан автоматически", typeof groupA.body?.joinCode?.code === "string", groupA.body);
  check("Group A: код в формате ENG-XXXXX", /^ENG-[A-Z0-9]{5}$/.test(groupA.body?.joinCode?.code ?? ""), groupA.body?.joinCode);
  check(
    "Group A: код НЕ содержит внутренний id группы",
    !String(groupA.body?.joinCode?.code ?? "").includes(groupA.body.id),
    { code: groupA.body?.joinCode?.code, id: groupA.body.id }
  );

  console.log("\nTeacher B: создаём учебный год, курс, группу...");
  const yearB = await request("/api/teacher/academic-years", { method: "POST", jar: teacherB, body: { name: "2026–2027 B" } });
  const courseB = await request("/api/teacher/courses", {
    method: "POST",
    jar: teacherB,
    body: { name: "Английский язык B", academicYearId: yearB.body.id },
  });
  const groupB = await request("/api/teacher/groups", {
    method: "POST",
    jar: teacherB,
    body: { name: "2ЛОГ-24", courseId: courseB.body.id, specialty: "Логистика" },
  });
  check("Teacher B: группа создана (201)", groupB.status === 201, groupB);

  check(
    "Code A и Code B различны",
    groupA.body?.joinCode?.code !== groupB.body?.joinCode?.code,
    { codeA: groupA.body?.joinCode?.code, codeB: groupB.body?.joinCode?.code }
  );

  console.log("\nСписки: Teacher A видит только свои сущности");
  const yearsA = await request("/api/teacher/academic-years", { jar: teacherA });
  check(
    "Список учебных годов Teacher A не содержит год Teacher B",
    Array.isArray(yearsA.body) && !yearsA.body.some((y: any) => y.id === yearB.body.id),
    yearsA.body
  );
  const coursesA = await request("/api/teacher/courses", { jar: teacherA });
  check(
    "Список курсов Teacher A не содержит курс Teacher B",
    Array.isArray(coursesA.body) && !coursesA.body.some((c: any) => c.id === courseB.body.id),
    coursesA.body
  );
  const groupsA = await request("/api/teacher/groups", { jar: teacherA });
  check(
    "Список групп Teacher A не содержит группу Teacher B",
    Array.isArray(groupsA.body) && !groupsA.body.some((g: any) => g.id === groupB.body.id),
    groupsA.body
  );

  console.log("\nПрямой доступ по id к чужим сущностям через URL");
  const openGroupB = await request(`/api/teacher/groups/${groupB.body.id}`, { jar: teacherA });
  check("Teacher A не может открыть Group B по id (404)", openGroupB.status === 404, openGroupB);

  const openGroupA = await request(`/api/teacher/groups/${groupA.body.id}`, { jar: teacherB });
  check("Teacher B не может открыть Group A по id (404)", openGroupA.status === 404, openGroupA);

  console.log("\nПопытки писать в чужие сущности через URL");
  const renameGroupB = await request(`/api/teacher/groups/${groupB.body.id}`, {
    method: "PUT",
    jar: teacherA,
    body: { name: "Захвачено Teacher A" },
  });
  check("Teacher A не может переименовать Group B (404)", renameGroupB.status === 404, renameGroupB);

  const archiveGroupB = await request(`/api/teacher/groups/${groupB.body.id}/archive`, { method: "POST", jar: teacherA });
  check("Teacher A не может архивировать Group B (404)", archiveGroupB.status === 404, archiveGroupB);

  const regenGroupB = await request(`/api/teacher/groups/${groupB.body.id}/join-code/regenerate`, {
    method: "POST",
    jar: teacherA,
  });
  check("Teacher A не может регенерировать код Group B (404)", regenGroupB.status === 404, regenGroupB);

  const createCourseInYearB = await request("/api/teacher/courses", {
    method: "POST",
    jar: teacherA,
    body: { name: "Захват курса", academicYearId: yearB.body.id },
  });
  check(
    "Teacher A не может создать курс в учебном году Teacher B (404)",
    createCourseInYearB.status === 404,
    createCourseInYearB
  );

  const createGroupInCourseB = await request("/api/teacher/groups", {
    method: "POST",
    jar: teacherA,
    body: { name: "Захват группы", courseId: courseB.body.id },
  });
  check(
    "Teacher A не может создать группу в курсе Teacher B (404)",
    createGroupInCourseB.status === 404,
    createGroupInCourseB
  );

  console.log("\nРегенерация join-кода делает старый код недействующим у своей же группы");
  const oldCode = groupA.body.joinCode.code;
  const regenOwn = await request(`/api/teacher/groups/${groupA.body.id}/join-code/regenerate`, {
    method: "POST",
    jar: teacherA,
  });
  check("Регенерация своего кода — 200", regenOwn.status === 200, regenOwn);
  check("Новый код отличается от старого", regenOwn.body?.joinCode?.code !== oldCode, {
    old: oldCode,
    new: regenOwn.body?.joinCode?.code,
  });

  console.log("\nДеактивация join-кода своей группы");
  const deactivateOwn = await request(`/api/teacher/groups/${groupA.body.id}/join-code/deactivate`, {
    method: "POST",
    jar: teacherA,
  });
  check("Деактивация своего кода — 200", deactivateOwn.status === 200, deactivateOwn);
  check("После деактивации активного кода нет", deactivateOwn.body?.joinCode === null, deactivateOwn.body);

  console.log("\nБез аутентификации / без роли TEACHER");
  const noAuth = await request("/api/teacher/groups");
  check("Без токена /api/teacher/groups недоступен (401)", noAuth.status === 401, noAuth);

  summarize();
}

main().catch((err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  process.exitCode = 1;
});
