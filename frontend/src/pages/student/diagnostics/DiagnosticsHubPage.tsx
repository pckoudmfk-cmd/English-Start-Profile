import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentGroupsApi, type StudentGroupMembership } from "../../../api/studentGroups";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, PrimaryButton, SecondaryButton } from "../../../components/ui";

function statusBadge(status: StudentGroupMembership["startDiagnosticStatus"]) {
  if (status === "COMPLETED") return <Badge tone="brand">Завершена</Badge>;
  if (status === "IN_PROGRESS") return <Badge tone="sky">В процессе</Badge>;
  return <Badge>Не пройдена</Badge>;
}

export function DiagnosticsHubPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StudentGroupMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentGroupsApi
      .listMyGroups()
      .then(setGroups)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить группы."));
  }, []);

  return (
    <div>
      <PageTitle subtitle="Стартовая диагностика English Start Profile: анкета (10–15 минут). Языковой тест появится на одном из следующих этапов.">
        Моя диагностика
      </PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      {groups === null ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState
            title="Вы пока не состоите ни в одной группе"
            hint="Присоединитесь к группе на главной странице, чтобы пройти анкетирование."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((m) => (
            <Card key={m.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {m.group.name}
                  {m.group.specialty ? ` · ${m.group.specialty}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.group.course} · {m.group.academicYear} · Преподаватель: {m.group.teacherName}
                </div>
                <div className="mt-2">{statusBadge(m.startDiagnosticStatus)}</div>
              </div>
              <div>
                {m.startDiagnosticStatus === "COMPLETED" ? (
                  <SecondaryButton type="button" onClick={() => navigate(`/student/diagnostics/${m.group.id}`)}>
                    Анкетирование завершено
                  </SecondaryButton>
                ) : (
                  <PrimaryButton type="button" onClick={() => navigate(`/student/diagnostics/${m.group.id}`)}>
                    {m.startDiagnosticStatus === "IN_PROGRESS" ? "Продолжить анкетирование" : "Пройти анкетирование"}
                  </PrimaryButton>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
