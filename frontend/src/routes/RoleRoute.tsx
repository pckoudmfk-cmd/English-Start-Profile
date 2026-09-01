import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";

/**
 * Защита маршрутов на уровне интерфейса: скрывает разделы чужой роли и
 * отправляет пользователя в его собственный раздел при попытке открыть
 * чужой URL напрямую.
 *
 * ВАЖНО: это UX-удобство, а НЕ граница безопасности. Реальное
 * разграничение доступа к данным реализовано на backend (см.
 * backend/src/middleware/auth.ts, requireAuth/requireRole) — каждый
 * защищённый API-эндпоинт сам проверяет роль и владельца ресурса по
 * серверной сессии, независимо от того, что показывает интерфейс.
 * Это подтверждено скриптом backend/scripts/verify-access-control.ts.
 */
export function RoleRoute({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullscreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <Outlet />;
}

export function homeForRole(role: Role): string {
  if (role === "TEACHER") return "/teacher";
  if (role === "STUDENT") return "/student";
  return "/login";
}

export function FullscreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Загрузка…
    </div>
  );
}
