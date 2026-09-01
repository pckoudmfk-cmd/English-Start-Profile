import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentGroupsApi, type StudentGroupMembership } from "../../../api/studentGroups";
import { Card, EmptyState, ErrorAlert, PageTitle, PrimaryButton } from "../../../components/ui";

// English Start Profile — Этап 9: точка входа в «Мой зачёт». Зачёт
// привязан к конкретной группе (курс/учебный год — снимок на попытке/
// заявке), поэтому у студента с одной группой сразу открывается её
// зачёт, а с несколькими — список групп на выбор (тот же приём, что и
// DiagnosticsHubPage на Этапе 5).
export function CreditHubPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<StudentGroupMembership[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    studentGroupsApi
      .listMyGroups()
      .then((gs) => {
        setGroups(gs);
        if (gs.length === 1) navigate(`/student/credit/${gs[0].group.id}`, { replace: true });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить ваши группы."));
  }, [navigate]);

  if (groups !== null && groups.length === 1) return null; // редирект уже выполняется

  return (
    <div>
      <PageTitle subtitle="Допуск, лексико-грамматический тест и устная часть.">Мой зачёт</PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      {groups === null ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState title="Вы пока не состоите ни в одной группе" hint="Присоединитесь к группе на главной странице." />
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((m) => (
            <Card key={m.id} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {m.group.name}
                  {m.group.specialty ? ` · ${m.group.specialty}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.group.course} · {m.group.academicYear}
                </div>
              </div>
              <PrimaryButton type="button" onClick={() => navigate(`/student/credit/${m.group.id}`)}>
                Открыть
              </PrimaryButton>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
