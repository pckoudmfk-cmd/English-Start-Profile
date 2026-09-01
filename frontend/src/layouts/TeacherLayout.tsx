import { AppShell, type NavItem } from "./AppShell";

const teacherNav: NavItem[] = [
  { to: "/teacher", label: "Главная", end: true },
  { to: "/teacher/groups", label: "Группы" },
  { to: "/teacher/students", label: "Студенты" },
  { to: "/teacher/diagnostics", label: "Диагностика" },
  { to: "/teacher/achievements", label: "Достижения" },
  { to: "/teacher/credit", label: "Зачёт" },
  { to: "/teacher/analytics", label: "Аналитика" },
  { to: "/teacher/settings", label: "Настройки" },
  { to: "/teacher/profile", label: "Мой профиль" },
];

export function TeacherLayout() {
  return <AppShell navItems={teacherNav} roleLabel="Преподаватель" />;
}
