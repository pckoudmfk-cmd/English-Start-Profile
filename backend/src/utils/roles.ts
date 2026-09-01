// Единственный источник истины для набора ролей приложения.
// Роль "ADMIN" предусмотрена в архитектуре (см. ТЗ, п.1), но публичная
// регистрация с этой ролью на Этапе 1 не разрешена — see routes/auth.ts.

export const ROLES = ["TEACHER", "STUDENT", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

// Роли, которые пользователь может выбрать при самостоятельной регистрации.
export const SELF_REGISTERABLE_ROLES = ["TEACHER", "STUDENT"] as const;
export type SelfRegisterableRole = (typeof SELF_REGISTERABLE_ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
