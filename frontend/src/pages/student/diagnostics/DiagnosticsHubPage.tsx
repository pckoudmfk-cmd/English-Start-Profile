import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentGroupsApi, type AttemptStatus, type StudentGroupMembership } from "../../../api/studentGroups";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, PrimaryButton, SecondaryButton } from "../../../components/ui";

function statusBadge(status: AttemptStatus) {
  if (status === "COMPLETED") return <Badge tone="brand">Завершена</Badge>;
  if (status === "IN_PROGRESS") return <Badge tone="sky">В процессе</Badge>;
  return <Badge>Не пройдена</Badge>;
}

// Анкетирование и объективная стартовая диагностика — два независимых
// модуля (разные данные, разные маршруты, разные экраны), см. ТЗ
// Этапа 5 "не смешивай его с анкетированием". На хабе они показаны как
// два отдельных ряда внутри карточки группы, а не один смешанный
// статус.
function ModuleRow({
  title,
  description,
  status,
  onOpen,
  startLabel,
  continueLabel,
  doneLabel,
}: {
  title: string;
  description: string;
  status: AttemptStatus;
  onOpen: () => void;
  startLabel: string;
  continueLabel: string;
  doneLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-slate-700">{title}</div>
        <div className="text-xs text-slate-500">{description}</div>
        <div className="mt-1">{statusBadge(status)}</div>
      </div>
      {status === "COMPLETED" ? (
        <SecondaryButton type="button" onClick={onOpen}>
          {doneLabel}
        </SecondaryButton>
      ) : (
        <PrimaryButton type="button" onClick={onOpen}>
          {status === "IN_PROGRESS" ? continueLabel : startLabel}
        </PrimaryButton>
      )}
    </div>
  );
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
      <PageTitle subtitle="Анкетирование (10–15 минут) и стартовая диагностика языковых навыков (грамматика, лексика, чтение, аудирование) — два самостоятельных этапа.">
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
            hint="Присоединитесь к группе на главной странице, чтобы начать диагностику."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((m) => (
            <Card key={m.id}>
              <div className="mb-3">
                <div className="text-sm font-medium text-slate-800">
                  {m.group.name}
                  {m.group.specialty ? ` · ${m.group.specialty}` : ""}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {m.group.course} · {m.group.academicYear} · Преподаватель: {m.group.teacherName}
                </div>
              </div>

              <div className="space-y-3">
                <ModuleRow
                  title="Анкетирование"
                  description="Самооценка, мотивация, барьеры, цели — около 10–15 минут."
                  status={m.questionnaireStatus}
                  onOpen={() => navigate(`/student/diagnostics/${m.group.id}`)}
                  startLabel="Пройти анкетирование"
                  continueLabel="Продолжить анкетирование"
                  doneLabel="Анкетирование завершено"
                />
                <ModuleRow
                  title="Стартовая диагностика"
                  description="Объективная проверка: грамматика, лексика, чтение, аудирование."
                  status={m.startDiagnosticStatus}
                  onOpen={() => navigate(`/student/diagnostics/${m.group.id}/test`)}
                  startLabel="Пройти диагностику"
                  continueLabel="Продолжить диагностику"
                  doneLabel="Диагностика завершена"
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
