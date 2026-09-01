import { useEffect, useState } from "react";
import { AppShell, type NavItem } from "./AppShell";
import { workspaceApi } from "../api/workspace";

const teacherNav: NavItem[] = [
  { to: "/teacher", label: "Главная", end: true },
  { to: "/teacher/academic-years", label: "Учебные годы" },
  { to: "/teacher/courses", label: "Курсы" },
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
  // ФИО для шапки (Этап 6, п.2) — берём из профиля преподавателя, если
  // он уже заполнен; AppShell сам подставит email, если запрос ещё не
  // завершился или ФИО не заполнено. Ошибку запроса намеренно
  // проглатываем — отсутствие ФИО в шапке не должно ронять layout.
  const [fullName, setFullName] = useState<string | undefined>(undefined);

  useEffect(() => {
    workspaceApi
      .getProfile()
      .then((p) => setFullName(p?.fullName || undefined))
      .catch(() => setFullName(undefined));
  }, []);

  return <AppShell navItems={teacherNav} roleLabel="Преподаватель" displayName={fullName} />;
}
