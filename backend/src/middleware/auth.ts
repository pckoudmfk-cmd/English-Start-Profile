import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "../utils/jwt";
import type { Role } from "../utils/roles";

export const AUTH_COOKIE_NAME = "esp_token";

export interface AuthenticatedUser {
  id: string;
  role: Role;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Требует валидный JWT в httpOnly-cookie. Это ЕДИНСТВЕННЫЙ источник
 * идентичности пользователя для защищённых маршрутов — id, полученный
 * из тела запроса или query-параметра, никогда не используется для
 * определения "чей это ресурс". Именно это не позволяет получить чужие
 * данные через прямой URL/подмену параметра.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: "NOT_AUTHENTICATED", message: "Требуется вход в систему." });
  }
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: "INVALID_TOKEN", message: "Сессия недействительна, войдите заново." });
  }
}

/**
 * Ограничивает маршрут набором ролей. Возвращает 403, если роль
 * авторизованного пользователя не входит в разрешённый список — так
 * студент не может вызвать преподавательский эндпоинт и наоборот, даже
 * зная точный URL.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "NOT_AUTHENTICATED", message: "Требуется вход в систему." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Доступ запрещён: недостаточно прав для этого раздела.",
      });
    }
    return next();
  };
}
