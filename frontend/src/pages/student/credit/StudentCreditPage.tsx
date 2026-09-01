import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { FINAL_GRADE_LABELS_RU, studentCreditApi, type StudentCreditOverview } from "../../../api/credit";
import { Badge, Card, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, SecondaryButton, SuccessAlert, TextInput } from "../../../components/ui";

const TOP_STATUS_TONE: Record<string, "slate" | "brand" | "sky"> = {
  REQUIREMENTS_NOT_MET: "slate",
  IN_PROGRESS: "sky",
  ADMITTED: "sky",
  TEST_COMPLETED: "sky",
  ORAL_REQUIRED: "sky",
  ORAL_DONE: "sky",
  COMPLETED: "brand",
};

const DICTIONARY_EDITABLE_STATUSES = ["REJECTED", "NEEDS_CLARIFICATION"];

export function StudentCreditPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<StudentCreditOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!groupId) return;
    studentCreditApi
      .getOverview(groupId)
      .then(setOverview)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить данные о зачёте."));
  }
  useEffect(load, [groupId]);

  async function handleStartTest() {
    if (!groupId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await studentCreditApi.startTestAttempt(groupId);
      navigate(`/student/credit/${groupId}/test/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось начать тест.");
    } finally {
      setBusy(false);
    }
  }

  if (!groupId) return null;

  return (
    <div>
      <PageTitle subtitle="Допуск (активный словарь) → лексико-грамматический тест → устная часть.">Мой зачёт</PageTitle>
      <ErrorAlert>{error}</ErrorAlert>

      {overview === null ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className={overview.topStatus === "COMPLETED" ? "border-brand-300 bg-brand-50" : ""}>
            <div className="mb-1">
              <Badge tone={TOP_STATUS_TONE[overview.topStatus] ?? "slate"}>Статус зачёта</Badge>
            </div>
            {/* ТЗ п.3: студенту показывается только этот текст, никогда — техническое имя статуса. */}
            <div className="text-xl font-semibold text-slate-900">{overview.topStatusLabel}</div>
            {overview.topStatus === "COMPLETED" && overview.qualification.oralPartExempt && (
              <div className="mt-2 text-sm text-brand-800">Устная часть: освобождён — {overview.oral.exemptionReason}</div>
            )}
          </Card>

          <DictionaryCard groupId={groupId} overview={overview} onChanged={load} />
          <TestCard overview={overview} onStart={handleStartTest} onContinue={() => overview.test.latestAttemptId && navigate(`/student/credit/${groupId}/test/${overview.test.latestAttemptId}`)} busy={busy} />
          <QualificationCard overview={overview} />
          <OralCard overview={overview} />
        </div>
      )}
    </div>
  );
}

function DictionaryCard({ groupId, overview, onChanged }: { groupId: string; overview: StudentCreditOverview; onChanged: () => void }) {
  const [wordCount, setWordCount] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const latest = overview.dictionary.latest;
  const canSubmit = latest === null || DICTIONARY_EDITABLE_STATUSES.includes(latest.status);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const count = Number(wordCount);
    if (!count || count < 1) {
      setLocalError("Укажите количество слов.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await studentCreditApi.submitDictionary(groupId, { wordCount: count, description: description.trim() || undefined, link: link.trim() || undefined });
      if (file) {
        await studentCreditApi.uploadDictionaryFile(groupId, created.id, file);
      }
      setSuccess("Заявка на допуск отправлена преподавателю.");
      setWordCount("");
      setDescription("");
      setLink("");
      setFile(null);
      onChanged();
    } catch (err) {
      setLocalError(err instanceof ApiError ? err.message : "Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Допуск к зачёту</h2>
        <Badge tone={overview.dictionary.status === "CONFIRMED" ? "brand" : overview.dictionary.status ? "sky" : "slate"}>{overview.dictionary.statusLabel}</Badge>
      </div>
      <p className="mb-1 text-sm text-slate-600">Требование: 800–1000 слов активного словаря.</p>
      <p className="mb-4 text-xs text-slate-400">Словарь подаётся не позднее чем за 2 недели до дифференцированного зачёта.</p>

      {latest && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div>
            Отправлено: <strong>{latest.wordCount}</strong> слов, {new Date(latest.createdAt).toLocaleDateString("ru-RU")}
          </div>
          {latest.description && <div className="mt-1 text-slate-600">{latest.description}</div>}
          {latest.link && (
            <div className="mt-1">
              <a href={latest.link} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                {latest.link}
              </a>
            </div>
          )}
          {latest.files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {latest.files.map((f) => (
                <li key={f.id}>
                  <a href={studentCreditApi.dictionaryFileUrl(groupId, latest.id, f.id)} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
                    📎 {f.fileName}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {latest.teacherComment && <div className="mt-2 text-xs text-slate-600">Комментарий преподавателя: {latest.teacherComment}</div>}
        </div>
      )}

      {/* Вне условного рендера формы: после успешной отправки canSubmit
          становится false (заявка больше не в редактируемом статусе), но
          подтверждение должно остаться видимым, а не исчезнуть вместе с
          формой в тот же момент. */}
      <SuccessAlert>{success}</SuccessAlert>

      {canSubmit && (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-slate-100 pt-4">
          {latest && <p className="text-xs text-amber-700">Заявка требует уточнения или была отклонена — отправьте новую.</p>}
          <ErrorAlert>{localError}</ErrorAlert>
          <div>
            <FieldLabel htmlFor="wordCount">Количество слов</FieldLabel>
            <TextInput id="wordCount" type="number" min={1} value={wordCount} onChange={(e) => setWordCount(e.target.value)} placeholder="900" />
          </div>
          <div>
            <FieldLabel htmlFor="description">Описание / тематика (необязательно)</FieldLabel>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <FieldLabel htmlFor="link">Ссылка (необязательно)</FieldLabel>
            <TextInput id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <FieldLabel htmlFor="file">Файл (необязательно — любой формат: документ, таблица, изображение)</FieldLabel>
            <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600" />
          </div>
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? "Отправляем…" : "Отправить на проверку"}
          </PrimaryButton>
        </form>
      )}
    </Card>
  );
}

function TestCard({ overview, onStart, onContinue, busy }: { overview: StudentCreditOverview; onStart: () => void; onContinue: () => void; busy: boolean }) {
  const { test, dictionary } = overview;
  const statusLabel = test.status === "COMPLETED" ? "Тест выполнен" : test.status === "IN_PROGRESS" ? "В процессе" : "Не начат";

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Лексико-грамматический тест</h2>
        <Badge tone={test.status === "COMPLETED" ? "brand" : test.status === "IN_PROGRESS" ? "sky" : "slate"}>{statusLabel}</Badge>
      </div>
      <p className="mb-1 text-sm text-slate-600">10 заданий с выбором ответа.</p>
      <p className="mb-4 text-xs text-slate-400">
        Попыток использовано: {test.attemptsUsed} из {test.maxAttempts}.
      </p>

      {test.latestResult && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          Результат: <strong>{test.latestResult.correctCount} / {test.latestResult.totalCount}</strong>
        </div>
      )}

      {dictionary.status !== "CONFIRMED" ? (
        <p className="text-xs text-slate-400">Тест станет доступен после подтверждения допуска.</p>
      ) : test.latestAttemptStatus === "IN_PROGRESS" ? (
        <PrimaryButton type="button" onClick={onContinue} disabled={busy}>
          Продолжить тест
        </PrimaryButton>
      ) : test.canStartNewAttempt ? (
        <PrimaryButton type="button" onClick={onStart} disabled={busy}>
          {busy ? "Открываем…" : test.attemptsUsed > 0 ? "Начать новую попытку" : "Начать тест"}
        </PrimaryButton>
      ) : (
        <p className="text-xs text-slate-400">Попытки исчерпаны.</p>
      )}
    </Card>
  );
}

function QualificationCard({ overview }: { overview: StudentCreditOverview }) {
  const { qualification } = overview;
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-slate-800">Квалификационные баллы</h2>
      <div className="text-2xl font-semibold text-slate-900">{qualification.points} / 5</div>
      <p className="mt-1 text-xs text-slate-500">
        {qualification.oralPartExempt ? "Требование выполнено — освобождение от устной части." : `До освобождения от устной части: ${qualification.pointsUntilExemption}.`}
      </p>
    </Card>
  );
}

function OralCard({ overview }: { overview: StudentCreditOverview }) {
  const { oral } = overview;
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Устная часть</h2>
      <p className="mb-3 text-xs text-slate-400">Развёрнутое высказывание (10–15 предложений) по одной из утверждённых тем, затем ответы на вопросы преподавателя.</p>

      {oral.status === "EXEMPTED" ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">Освобождён — {oral.exemptionReason}</div>
      ) : oral.status === "NOT_ASSIGNED" ? (
        <p className="text-xs text-slate-400">Тема пока не назначена преподавателем.</p>
      ) : (
        <div className="space-y-2">
          {oral.topic && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="font-medium text-slate-800">{oral.topic.en}</div>
              <div className="text-xs text-slate-500">{oral.topic.ru}</div>
            </div>
          )}
          {oral.assignedComment && <p className="text-xs text-slate-600">Комментарий преподавателя: {oral.assignedComment}</p>}
          {oral.status === "GRADED_DRAFT" && <Badge tone="sky">Беседа проведена, преподаватель оформляет оценку</Badge>}
          {oral.status === "CONFIRMED" && oral.finalGrade && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              Итоговая оценка: <strong>{FINAL_GRADE_LABELS_RU[oral.finalGrade] ?? oral.finalGrade}</strong>
              {oral.teacherComment && <div className="mt-1 text-xs">{oral.teacherComment}</div>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
