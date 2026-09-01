import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentCreditApi, type TestAttemptDetail } from "../../../api/credit";
import { Card, ErrorAlert, PrimaryButton, SecondaryButton } from "../../../components/ui";

// English Start Profile — Этап 9: прохождение лексико-грамматического
// теста (ТЗ п.12). В отличие от диагностики (Этап 5, DiagnosticWizardPage),
// здесь НЕТ немедленной обратной связи по каждому ответу — ответ можно
// свободно менять, пока весь тест не завершён (кнопка «Завершить тест»),
// а до этого момента правильность не раскрывается вообще (иначе первый
// же неверный ответ фактически подсказал бы правильный студенту, ещё
// проходящему тест).
export function CreditTestWizardPage() {
  const { groupId, attemptId } = useParams<{ groupId: string; attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<TestAttemptDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [result, setResult] = useState<{ correctCount: number; totalCount: number; revealCorrectAnswers: boolean } | null>(null);

  function load() {
    if (!groupId || !attemptId) return;
    studentCreditApi
      .getTestAttempt(groupId, attemptId)
      .then((a) => {
        setAttempt(a);
        if (a.status === "COMPLETED" && a.result) setResult({ ...a.result, revealCorrectAnswers: a.items.some((i) => i.correctOptionIndex !== null) });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось открыть тест."));
  }
  useEffect(load, [groupId, attemptId]);

  async function selectOption(itemId: string, optionIndex: number) {
    if (!groupId || !attemptId || !attempt) return;
    setSaving(true);
    setError(null);
    try {
      await studentCreditApi.answerTestItem(groupId, attemptId, itemId, optionIndex);
      setAttempt((prev) => {
        if (!prev) return prev;
        const items = prev.items.map((i) => (i.itemId === itemId ? { ...i, selectedOptionIndex: optionIndex } : i));
        return { ...prev, items, answeredCount: items.filter((i) => i.selectedOptionIndex !== null).length };
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить ответ.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    if (!groupId || !attemptId) return;
    setFinishing(true);
    setError(null);
    try {
      const res = await studentCreditApi.completeTestAttempt(groupId, attemptId);
      setResult(res);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить тест.");
    } finally {
      setFinishing(false);
    }
  }

  if (!groupId || !attemptId) return null;

  if (result) {
    return (
      <Card className="mx-auto max-w-xl">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Тест завершён.</h1>
        <p className="mb-1 text-lg text-slate-800">
          Результат: <strong>{result.correctCount} / {result.totalCount}</strong>
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Правильных ответов: {result.correctCount}. Ошибок: {result.totalCount - result.correctCount}.
        </p>
        {!result.revealCorrectAnswers && <p className="mb-4 text-xs text-slate-400">Правильные варианты не показываются — так настроено для этого курса.</p>}
        {result.revealCorrectAnswers && attempt && (
          <div className="mb-4 space-y-2">
            {attempt.items.map((item, idx) => (
              <div key={item.itemId} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="text-xs text-slate-400">Задание {idx + 1}</div>
                <div className="mb-1 font-medium text-slate-800">{item.question}</div>
                <div className={item.correct ? "text-brand-700" : "text-red-600"}>
                  Ваш ответ: {item.selectedOptionIndex !== null ? item.options[item.selectedOptionIndex] : "—"} {item.correct ? "(верно)" : `(неверно, правильно: ${item.options[item.correctOptionIndex!]})`}
                </div>
              </div>
            ))}
          </div>
        )}
        <SecondaryButton type="button" onClick={() => navigate(`/student/credit/${groupId}`)}>
          Вернуться к зачёту
        </SecondaryButton>
      </Card>
    );
  }

  if (!attempt) {
    return (
      <Card>
        <ErrorAlert>{error}</ErrorAlert>
        <p className="text-sm text-slate-500">Загрузка…</p>
      </Card>
    );
  }

  const item = attempt.items[index];
  const allAnswered = attempt.answeredCount === attempt.totalItems;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between text-xs font-medium text-slate-500">
        <span>Лексико-грамматический тест</span>
        <span>
          Задание {index + 1} из {attempt.totalItems}
        </span>
      </div>

      <Card>
        <p className="mb-4 text-base font-medium text-slate-800">{item.question}</p>
        <div className="space-y-2">
          {item.options.map((opt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={saving}
              onClick={() => selectOption(item.itemId, idx)}
              className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                item.selectedOptionIndex === idx ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <ErrorAlert>{error}</ErrorAlert>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <SecondaryButton type="button" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            ← Назад
          </SecondaryButton>
          {index < attempt.totalItems - 1 ? (
            <PrimaryButton type="button" onClick={() => setIndex((i) => Math.min(attempt.totalItems - 1, i + 1))}>
              Далее →
            </PrimaryButton>
          ) : null}
        </div>
      </Card>

      <Card className="mt-4">
        <p className="mb-3 text-sm text-slate-600">
          Вы ответили на {attempt.answeredCount} из {attempt.totalItems} заданий.
        </p>
        <PrimaryButton type="button" onClick={handleFinish} disabled={!allAnswered || finishing}>
          {finishing ? "Завершаем…" : "Завершить тест"}
        </PrimaryButton>
        {!allAnswered && <p className="mt-2 text-xs text-slate-400">Ответьте на все задания, чтобы завершить тест.</p>}
      </Card>
    </div>
  );
}
