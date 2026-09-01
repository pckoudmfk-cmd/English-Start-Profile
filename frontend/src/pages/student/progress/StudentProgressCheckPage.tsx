import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentProgressCheckApi, type ProgressCheckSummary, type ProgressOverview } from "../../../api/progressCheck";
import { ProgressComparisonView } from "../../../components/ProgressComparisonView";
import { Badge, Card, ErrorAlert, PageTitle, PrimaryButton } from "../../../components/ui";

const STATUS_LABELS: Record<string, string> = {
  NOT_ASSIGNED: "Не назначена",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершена",
};

// English Start Profile — Этап 10: «Промежуточная диагностика» —
// главная страница студента. Запустить самостоятельно нельзя (ТЗ) —
// страница только показывает, что назначил преподаватель, и открывает
// доступ к анкете/тесту, когда наступил период.
export function StudentProgressCheckPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<ProgressOverview | null>(null);
  const [summary, setSummary] = useState<ProgressCheckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    studentProgressCheckApi
      .getOverview(groupId)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить данные."));
  }, [groupId]);

  useEffect(() => {
    if (!groupId || !overview) return;
    if (overview.test.status === "COMPLETED" && overview.questionnaire.status === "COMPLETED") {
      studentProgressCheckApi.getSummary(groupId).then(setSummary).catch(() => {});
    }
  }, [groupId, overview]);

  if (!groupId) return null;

  return (
    <div>
      <PageTitle subtitle="Сравнение результатов: СТАРТ → СЕЙЧАС. Рекомендуемый срок — через 5–6 месяцев после стартовой диагностики.">
        Промежуточная диагностика
      </PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      {overview === null ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : !overview.assigned ? (
        <Card>
          <p className="text-sm text-slate-600">Промежуточная диагностика вам ещё не назначена. Её назначает преподаватель — самостоятельно начать её нельзя.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {!overview.openNow && (
            <Card className="border-amber-200 bg-amber-50">
              <p className="text-sm text-amber-800">
                Диагностика станет доступна {overview.periodStartAt ? new Date(overview.periodStartAt).toLocaleDateString("ru-RU") : ""}.
              </p>
            </Card>
          )}

          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">Анкета (повторно)</div>
              <Badge tone={overview.questionnaire.status === "COMPLETED" ? "brand" : overview.questionnaire.status === "IN_PROGRESS" ? "sky" : "slate"}>
                {STATUS_LABELS[overview.questionnaire.status]}
              </Badge>
            </div>
            <PrimaryButton type="button" disabled={!overview.openNow} onClick={() => navigate(`/student/progress/${groupId}/questionnaire`)}>
              {overview.questionnaire.status === "COMPLETED" ? "Просмотреть" : overview.questionnaire.status === "IN_PROGRESS" ? "Продолжить" : "Открыть"}
            </PrimaryButton>
          </Card>

          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-slate-700">Диагностический тест (Form B)</div>
              <Badge tone={overview.test.status === "COMPLETED" ? "brand" : overview.test.status === "IN_PROGRESS" ? "sky" : "slate"}>{STATUS_LABELS[overview.test.status]}</Badge>
            </div>
            <PrimaryButton type="button" disabled={!overview.openNow} onClick={() => navigate(`/student/progress/${groupId}/test`)}>
              {overview.test.status === "COMPLETED" ? "Просмотреть результат" : overview.test.status === "IN_PROGRESS" ? "Продолжить" : "Начать"}
            </PrimaryButton>
          </Card>

          {summary && (
            <div>
              <h2 className="mb-3 mt-6 text-lg font-semibold text-slate-900">Что было → Что стало → Что изменилось</h2>
              <ProgressComparisonView summary={summary} />
            </div>
          )}
        </div>
      )}

      <Link to="/student" className="mt-6 inline-block text-sm text-slate-500 hover:underline">
        ← На главную
      </Link>
    </div>
  );
}
