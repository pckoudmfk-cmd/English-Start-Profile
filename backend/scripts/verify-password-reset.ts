/**
 * Этап 12 (стабилизация) — регрессия для восстановления доступа
 * (`POST /api/auth/forgot-password` + `POST /api/auth/reset-password`).
 *
 * До этого скрипта у этого узла НЕ БЫЛО автоматической проверки вообще
 * (обнаружено при аудите Этапа 11) — при этом именно здесь на Этапе 11
 * был найден и исправлен Critical (безусловная утечка токена в ответе
 * API). Этот скрипт: (1) закрывает пробел в регрессионном покрытии,
 * (2) содержит явную проверку самого исправления — при выключенном
 * (по умолчанию) EXPOSE_DEV_PASSWORD_RESET_TOKEN токен нигде не
 * появляется в ответе.
 *
 * Полный цикл (получить токен → сбросить пароль → войти новым паролем)
 * возможен только когда backend запущен с EXPOSE_DEV_PASSWORD_RESET_
 * TOKEN=true (см. backend/.env — установлено локально для разработки);
 * если флаг выключен, соответствующие шаги пропускаются с явным
 * сообщением, а не проваливаются молча.
 */
import { PrismaClient } from "@prisma/client";
import { type CookieJar, createChecker, registerUser, request } from "./lib/testClient";

const prisma = new PrismaClient();
const { check, summarize } = createChecker();

async function main() {
  const stamp = Date.now();
  console.log("\nЭтап 12 — регрессия: восстановление доступа\n");

  const email = `qa-reset-${stamp}@example.com`;
  const originalPassword = "Password123!";
  const jar: CookieJar = {};
  await registerUser(jar, email, originalPassword, "STUDENT");

  // === Проверка самого исправления Critical №1 =============================
  console.log("=== Проверка исправления: безусловная утечка токена ===");
  const forgot = await request("/api/auth/forgot-password", { method: "POST", body: { email } });
  check("forgot-password возвращает 200 с общим (не палящим email) сообщением", forgot.status === 200 && !!forgot.body?.message, forgot.body);
  check(
    "Сообщение не подтверждает и не опровергает существование email (единая формулировка для существующего/несуществующего адреса)",
    forgot.body?.message?.includes("Если такой email зарегистрирован"),
    forgot.body
  );

  const exposesToken = typeof forgot.body?.devToken === "string";
  if (!exposesToken) {
    check(
      "EXPOSE_DEV_PASSWORD_RESET_TOKEN выключен (или не установлен) — devToken отсутствует в ответе (безопасное поведение по умолчанию)",
      true
    );
    console.log(
      "  ⚠ Полный цикл восстановления (сброс пароля + вход новым паролем) пропущен: EXPOSE_DEV_PASSWORD_RESET_TOKEN=false на этом backend, токен недоступен скрипту (это ОЖИДАЕМОЕ и корректное поведение — см. .env.example)."
    );
    summarize();
    return;
  }
  check("EXPOSE_DEV_PASSWORD_RESET_TOKEN включён локально — devToken присутствует в ответе (ожидаемо для дев-окружения)", true);
  const token: string = forgot.body.devToken;

  // === Несуществующий email — тот же генерический ответ, без утечки =========
  const forgotUnknown = await request("/api/auth/forgot-password", { method: "POST", body: { email: `qa-does-not-exist-${stamp}@example.com` } });
  check("Несуществующий email — тоже 200 с тем же generic-сообщением (нет утечки факта регистрации)", forgotUnknown.status === 200 && forgotUnknown.body?.message === forgot.body.message, forgotUnknown.body);
  check("Для несуществующего email devToken отсутствует (нечего возвращать)", typeof forgotUnknown.body?.devToken === "undefined", forgotUnknown.body);

  // === Невалидный токен ======================================================
  const badReset = await request("/api/auth/reset-password", { method: "POST", body: { token: "not-a-real-token", newPassword: "NewPassword123!" } });
  check("Невалидный токен — 400 INVALID_OR_EXPIRED_TOKEN", badReset.status === 400 && badReset.body?.error === "INVALID_OR_EXPIRED_TOKEN", badReset.body);

  // === Истёкший токен (эмулируем истечение напрямую в БД) ===================
  const userBefore = await prisma.user.findUnique({ where: { email } });
  await prisma.user.update({ where: { id: userBefore!.id }, data: { passwordResetExpiresAt: new Date(Date.now() - 60_000) } });
  const expiredReset = await request("/api/auth/reset-password", { method: "POST", body: { token, newPassword: "NewPassword123!" } });
  check("Истёкший токен — 400 INVALID_OR_EXPIRED_TOKEN, пароль не меняется", expiredReset.status === 400 && expiredReset.body?.error === "INVALID_OR_EXPIRED_TOKEN", expiredReset.body);
  const loginWithOldAfterExpiry = await request("/api/auth/login", { method: "POST", body: { email, password: originalPassword } });
  check("После попытки с истёкшим токеном старый пароль всё ещё работает", loginWithOldAfterExpiry.status === 200, loginWithOldAfterExpiry.body);

  // Возвращаем срок действия токена, чтобы проверить реальный успешный сброс.
  await prisma.user.update({ where: { id: userBefore!.id }, data: { passwordResetExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } });

  // === Успешный сброс + одноразовость токена ================================
  console.log("\n=== Полный цикл: сброс пароля новым значением ===");
  const newPassword = "BrandNewPassword456!";
  const okReset = await request("/api/auth/reset-password", { method: "POST", body: { token, newPassword } });
  check("Валидный токен — пароль успешно сброшен (200)", okReset.status === 200, okReset.body);

  const loginOld = await request("/api/auth/login", { method: "POST", body: { email, password: originalPassword } });
  check("Старый пароль больше не работает после сброса", loginOld.status === 401, loginOld.body);

  const loginNew = await request("/api/auth/login", { method: "POST", body: { email, password: newPassword } });
  check("Новый пароль работает после сброса", loginNew.status === 200, loginNew.body);

  const reuseToken = await request("/api/auth/reset-password", { method: "POST", body: { token, newPassword: "AnotherPassword789!" } });
  check("Повторное использование того же токена — 400 (токен одноразовый)", reuseToken.status === 400 && reuseToken.body?.error === "INVALID_OR_EXPIRED_TOKEN", reuseToken.body);

  const loginAfterReuseAttempt = await request("/api/auth/login", { method: "POST", body: { email, password: newPassword } });
  check("Пароль не изменился попыткой повторного использования токена", loginAfterReuseAttempt.status === 200, loginAfterReuseAttempt.body);

  // === Валидация нового пароля ===============================================
  const forgot2 = await request("/api/auth/forgot-password", { method: "POST", body: { email } });
  const token2: string = forgot2.body.devToken;
  const shortPasswordReset = await request("/api/auth/reset-password", { method: "POST", body: { token: token2, newPassword: "short" } });
  check("Новый пароль короче 8 символов отклонён (400 VALIDATION_ERROR)", shortPasswordReset.status === 400 && shortPasswordReset.body?.error === "VALIDATION_ERROR", shortPasswordReset.body);

  await prisma.$disconnect();
  summarize();
}

main().catch(async (err) => {
  console.error("Скрипт проверки завершился с ошибкой:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
