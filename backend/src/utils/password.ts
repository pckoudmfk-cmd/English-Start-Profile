import bcrypt from "bcryptjs";
import crypto from "crypto";

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Токен восстановления доступа: пользователю уходит "сырой" токен,
// в базе хранится только его хэш (sha256) — так же, как принято хранить
// токены сброса пароля (компрометация БД не даёт готового токена).
export function generatePasswordResetToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
