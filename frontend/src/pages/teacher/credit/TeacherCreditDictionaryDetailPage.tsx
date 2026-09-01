import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { DICTIONARY_STATUS_LABELS_RU, teacherCreditApi, type DictionaryDetail } from "../../../api/credit";
import { Badge, Card, ErrorAlert, PageTitle, PrimaryButton, SecondaryButton } from "../../../components/ui";

// English Start Profile — Этап 9: карточка заявки на допуск (ТЗ п.5, 7).
// Подтверждение — только явное действие преподавателя, никогда
// автоматически по одному лишь заявленному числу слов.
export function TeacherCreditDictionaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<DictionaryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    teacherCreditApi
      .getDictionaryDetail(id)
      .then(setDetail)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить заявку."));
  }
  useEffect(load, [id]);

  async function decide(action: "OPEN" | "CONFIRM" | "REQUEST_CLARIFICATION" | "REJECT") {
    if (!id) return;
    if ((action === "REJECT" || action === "REQUEST_CLARIFICATION") && !comment.trim()) {
      setError("Для этого решения нужно указать комментарий.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await teacherCreditApi.decideDictionary(id, { action, comment: comment.trim() || undefined });
      setComment("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <Card>
        <ErrorAlert>{error}</ErrorAlert>
        <p className="text-sm text-slate-500">Загрузка…</p>
      </Card>
    );
  }

  const reviewable = detail.status === "SUBMITTED" || detail.status === "UNDER_REVIEW";

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle subtitle={detail.student.fullName}>Заявка на допуск</PageTitle>
      {!detail.isLatest && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Это не последняя заявка студента — решение по ней уже не влияет на текущий допуск.</div>}

      <Card className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <Badge tone={detail.status === "CONFIRMED" ? "brand" : detail.status === "REJECTED" ? "slate" : "sky"}>{DICTIONARY_STATUS_LABELS_RU[detail.status]}</Badge>
          <span className="text-xs text-slate-400">{new Date(detail.createdAt).toLocaleDateString("ru-RU")}</span>
        </div>
        <div className="text-sm text-slate-800">
          Заявлено слов: <strong>{detail.wordCount}</strong>
        </div>
        {detail.description && <p className="mt-2 text-sm text-slate-600">{detail.description}</p>}
        {detail.link && (
          <a href={detail.link} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-brand-600 hover:underline">
            {detail.link}
          </a>
        )}
        {detail.files.length > 0 && (
          <ul className="mt-3 space-y-1">
            {detail.files.map((f) => (
              <li key={f.id}>
                <a href={teacherCreditApi.dictionaryFileUrl(detail.id, f.id)} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                  📎 {f.fileName}
                </a>
              </li>
            ))}
          </ul>
        )}
        {detail.teacherComment && <p className="mt-3 text-xs text-slate-500">Комментарий преподавателя: {detail.teacherComment}</p>}
      </Card>

      {reviewable && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Решение</h2>
          <ErrorAlert>{error}</ErrorAlert>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий (обязателен для «Запросить уточнение» и «Отклонить»)"
            rows={3}
            className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <div className="flex flex-wrap gap-2">
            {detail.status === "SUBMITTED" && (
              <SecondaryButton type="button" onClick={() => decide("OPEN")} disabled={busy}>
                Открыть
              </SecondaryButton>
            )}
            <PrimaryButton type="button" onClick={() => decide("CONFIRM")} disabled={busy}>
              Подтвердить
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => decide("REQUEST_CLARIFICATION")} disabled={busy}>
              Запросить уточнение
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => decide("REJECT")} disabled={busy}>
              Отклонить
            </SecondaryButton>
          </div>
        </Card>
      )}

      {detail.history.length > 1 && (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-800">История заявок студента</h2>
          <ul className="space-y-1 text-xs text-slate-600">
            {detail.history.map((h) => (
              <li key={h.id}>
                {new Date(h.createdAt).toLocaleDateString("ru-RU")} — {h.wordCount} слов — {DICTIONARY_STATUS_LABELS_RU[h.status]}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-4 flex gap-3">
        <Link to="/teacher/credit/dictionary" className="text-sm text-slate-500 hover:underline">
          ← К списку
        </Link>
        <Link to={`/teacher/credit/groups/${detail.groupId}/students/${detail.student.id}`} className="text-sm text-brand-600 hover:underline">
          Зачёт студента →
        </Link>
      </div>
    </div>
  );
}
