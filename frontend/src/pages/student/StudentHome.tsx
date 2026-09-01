import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import { studentGroupsApi, type StudentGroupMembership } from "../../api/studentGroups";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle } from "../../components/ui";
import { JoinGroupCard } from "./JoinGroupCard";

function diagnosticBadgeTone(status: StudentGroupMembership["startDiagnosticStatus"]) {
  if (status === "COMPLETED") return "brand" as const;
  if (status === "IN_PROGRESS") return "sky" as const;
  return "slate" as const;
}

function diagnosticBadgeLabel(status: StudentGroupMembership["startDiagnosticStatus"]) {
  if (status === "COMPLETED") return "Стартовая диагностика: пройдена";
  if (status === "IN_PROGRESS") return "Стартовая диагностика: в процессе";
  return "Стартовая диагностика: не пройдена";
}

// Главная страница студента. Цели, достижения, зачёт ещё не реализованы
// (см. следующие этапы) — карточка "..." под списком групп честно об
// этом говорит. Статус анкетирования — реальный (Этап 4), не заглушка.
export function StudentHome() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<StudentGroupMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    studentGroupsApi
      .listMyGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить ваши группы."));
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <PageTitle subtitle={user?.email}>Главная</PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Мои группы</h2>
        {groups === null ? (
          <Card>
            <p className="text-sm text-slate-500">Загрузка…</p>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              title="Вы пока не состоите ни в одной группе"
              hint="Введите код группы ниже, чтобы присоединиться."
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {groups.map((m) => (
              <Card key={m.id}>
                <div className="text-sm font-medium text-slate-800">
                  {m.group.name}
                  {m.group.specialty ? ` · ${m.group.specialty}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.group.course} · {m.group.academicYear}
                </div>
                <div className="mt-1 text-xs text-slate-500">Преподаватель: {m.group.teacherName}</div>
                <div className="mt-3">
                  <Link to={`/student/diagnostics/${m.group.id}`}>
                    <Badge tone={diagnosticBadgeTone(m.startDiagnosticStatus)}>
                      {diagnosticBadgeLabel(m.startDiagnosticStatus)}
                    </Badge>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <JoinGroupCard onJoined={load} />

      <Card className="mt-6">
        <p className="text-sm text-slate-600">
          Диагностика, цели и достижения появятся на следующих этапах разработки English Start
          Profile.
        </p>
        <Link
          to="/student/profile"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
        >
          Заполнить «Мой профиль» →
        </Link>
      </Card>
    </div>
  );
}
