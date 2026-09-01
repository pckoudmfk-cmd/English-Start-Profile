import { Router } from "express";
import type { CookieOptions } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { hashPassword, verifyPassword, generatePasswordResetToken, hashToken } from "../utils/password";
import { signAuthToken } from "../utils/jwt";
import { SELF_REGISTERABLE_ROLES } from "../utils/roles";
import { AUTH_COOKIE_NAME, requireAuth } from "../middleware/auth";

const router = Router();

const cookieSecure = process.env.COOKIE_SECURE === "true";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: cookieSecure,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней, синхронизировано с JWT expiresIn
};

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Некорректный email"),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
  role: z.enum(SELF_REGISTERABLE_ROLES, {
    errorMap: () => ({ message: "Роль должна быть 'TEACHER' или 'STUDENT'" }),
  }),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "EMAIL_TAKEN", message: "Пользователь с таким email уже зарегистрирован." });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, role },
  });

  const token = signAuthToken({ sub: user.id, role: role as any, email: user.email });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  return res.status(201).json({ id: user.id, email: user.email, role: user.role });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Намеренно одинаковое сообщение для "нет такого email" и "неверный
  // пароль" — чтобы не давать возможность перебором проверять, какие
  // email зарегистрированы в системе.
  const invalidMessage = { error: "INVALID_CREDENTIALS", message: "Неверный email или пароль." };
  if (!user) {
    return res.status(401).json(invalidMessage);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json(invalidMessage);
  }

  const token = signAuthToken({ sub: user.id, role: user.role as any, email: user.email });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  return res.json({ id: user.id, email: user.email, role: user.role });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  return res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  }
  return res.json({ id: user.id, email: user.email, role: user.role });
});

// --- Восстановление доступа -----------------------------------------
//
// Полноценная отправка email не входит в Этап 1 (нет почтового
// провайдера в архитектуре). Реализован полный серверный workflow
// (токен с ограниченным сроком жизни, хранение только хэша токена,
// одноразовое использование).
//
// Этап 11 (QA-аудит), CRITICAL №1: раньше токен безусловно возвращался
// в ответе API и писался в лог — без email-провайдера это был путь к
// полному захвату ЛЮБОГО аккаунта по одному известному email, без
// доступа к почте жертвы. Явный opt-in флаг ниже — единственный способ
// увидеть токен без реальной отправки письма: по умолчанию (флаг не
// установлен) токен нигде не появляется, ни в ответе, ни в логе — то
// есть безопасно "по умолчанию", а не "безопасно, если не забыть
// установить NODE_ENV=production" (частая причина утечек именно
// такого рода — забытая переменная окружения).
const exposeDevPasswordResetToken = process.env.EXPOSE_DEV_PASSWORD_RESET_TOKEN === "true";

router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  // Не сообщаем, существует ли email — иначе это бы позволяло перебором
  // узнавать зарегистрированные адреса.
  const genericResponse = {
    message: "Если такой email зарегистрирован, на него отправлена ссылка для восстановления доступа.",
  };

  if (!user) {
    return res.json(genericResponse);
  }

  const { token, tokenHash } = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
  });

  if (!exposeDevPasswordResetToken) {
    return res.json(genericResponse);
  }

  // eslint-disable-next-line no-console
  console.log(`[dev] Ссылка восстановления доступа для ${email}: /reset-password?token=${token}`);
  return res.json({ ...genericResponse, devToken: token });
});

router.post("/reset-password", async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(1), newPassword: z.string().min(8) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { token, newPassword } = parsed.data;
  const tokenHash = hashToken(token);

  const user = await prisma.user.findFirst({ where: { passwordResetTokenHash: tokenHash } });
  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN", message: "Ссылка недействительна или истекла." });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
  });

  return res.json({ message: "Пароль обновлён. Теперь вы можете войти с новым паролем." });
});

export default router;
