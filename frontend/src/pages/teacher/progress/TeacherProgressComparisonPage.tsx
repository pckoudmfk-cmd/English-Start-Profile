import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { teacherProgressCheckApi, type ProgressCheckSummary } from "../../../api/progressCheck";
import { ProgressComparisonView } from "../../../components/ProgressComparisonView";
import { Card, ErrorAlert, PageTitle } from "../../../components/ui";

// English Start Profile — Этап 10: «Что было → Что стало → Что
// изменилось» для конкретного студента (сторона преподавателя).
export function TeacherProgressComparisonPage() {
  const { groupId, studentId } = useParams<{ groupId: string; studentId: string }>();
  const [summary, setSummary] = useState<ProgressCheckSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId || !studentId) return;
    teacherProgressCheckApi
      .getComparison(groupId, studentId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить сравнение."));
  }, [groupId, studentId]);

  if (!groupId || !studentId) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle subtitle="СТАРТ → СЕЙЧАС">Что было → Что стало → Что изменилось</PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      {!summary ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : (
        <>
          {summary.monthsSinceStart !== null && (
            <p className="mb-4 text-xs text-slate-400">
              Прошло {summary.monthsSinceStart} мес. с момента завершения стартовой диагностики (рекомендуемый срок — 5–6 мес.).
            </p>
          )}
          <ProgressComparisonView summary={summary} />
        </>
      )}

      <Link to="/teacher/diagnostics" className="mt-6 inline-block text-sm text-slate-500 hover:underline">
        ← К списку студентов
      </Link>
    </div>
  );
}
