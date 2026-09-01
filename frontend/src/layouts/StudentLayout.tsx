import { AppShell, type NavItem } from "./AppShell";

const studentNav: NavItem[] = [
  { to: "/student", label: "Главная", end: true },
  { to: "/student/profile", label: "Мой профиль" },
  { to: "/student/diagnostics", label: "Моя диагностика" },
  { to: "/student/goals", label: "Мои цели" },
  { to: "/student/achievements", label: "Мои достижения" },
  { to: "/student/credit", label: "Мой зачёт" },
  { to: "/student/progress", label: "Мой прогресс" },
];

export function StudentLayout() {
  return <AppShell navItems={studentNav} roleLabel="Студент" />;
}
