import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  studentProgressCheckApi,
  type AnswerFeedback,
  type DiagnosticPassage,
  type ProgressTestAttempt,
  type DiagnosticResultResponse,
  type PublicDiagnosticItem,
  type Skill,
} from "../../../api/progressCheck";
import { Card, ErrorAlert, PrimaryButton, SecondaryButton } from "../../../components/ui";

// English Start Profile — Этап 10: тест Промежуточной диагностики
// (Form B). Тот же UX, что и Start Diagnostic (DiagnosticWizardPage,
// Этап 5) — вопрос за вопросом, немедленная обратная связь после
// каждого ответа, — отличается только формой заданий (Form B, другой
// контент) и тем, что попытку открывает не сам студент, а уже
// назначенная преподавателем (см. api/progressCheck.ts).
const SKILL_LABELS: Record<Skill, string> = {
  GRAMMAR: "Грамматика",
  VOCABULARY: "Лексика",
  READING: "Чтение",
  LISTENING: "Аудирование",
};

interface FlatItem extends PublicDiagnosticItem {
  blockIndex: number;
  blockTitleRu: string;
  blockInstructionRu: string;
  indexInBlock: number;
}

type Step = "intro" | { kind: "block-intro"; blockIndex: number } | { kind: "item"; flatIndex: number } | "ready-to-finish" | "completed";

export function ProgressTestWizardPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<ProgressTestAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, { selectedOptionIndex: number; correct: boolean }>>({});
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticResultResponse | null>(null);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    studentProgressCheckApi.test
      .open(groupId)
      .then((res) => {
        setAttempt(res);
        setAnswers(res.answers);
        if (res.status === "COMPLETED") {
          setStep("completed");
          studentProgressCheckApi.test.getResult(groupId).then(setResult).catch(() => {});
        } else if (Object.keys(res.answers).length > 0) {
          setStep(computeResumeStep(res));
        } else {
          setStep("intro");
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Не удалось открыть диагностику."))
      .finally(() => setLoading(false));
  }, [groupId]);

  const flatItems: FlatItem[] = useMemo(() => {
    if (!attempt) return [];
    return attempt.blocks.flatMap((block, blockIndex) =>
      block.items.map((item, indexInBlock) => ({ ...item, blockIndex, blockTitleRu: block.titleRu, blockInstructionRu: block.instructionRu, indexInBlock }))
    );
  }, [attempt]);

  const passagesById = useMemo(() => {
    const map = new Map<string, DiagnosticPassage>();
    attempt?.passages.forEach((p) => map.set(p.id, p));
    return map;
  }, [attempt]);

  function computeResumeStep(a: ProgressTestAttempt): Step {
    const flat = a.blocks.flatMap((block, blockIndex) => block.items.map((item, indexInBlock) => ({ ...item, blockIndex, indexInBlock })));
    const firstUnansweredIndex = flat.findIndex((i) => !(i.id in a.answers));
    if (firstUnansweredIndex === -1) return "ready-to-finish";
    const item = flat[firstUnansweredIndex];
    const blockStarted = flat.some((i) => i.blockIndex === item.blockIndex && i.id in a.answers);
    if (!blockStarted) return { kind: "block-intro", blockIndex: item.blockIndex };
    return { kind: "item", flatIndex: firstUnansweredIndex };
  }

  function startFirstBlock() {
    setStep({ kind: "block-intro", blockIndex: 0 });
  }

  function enterBlock(blockIndex: number) {
    const flatIndex = flatItems.findIndex((i) => i.blockIndex === blockIndex);
    setStep({ kind: "item", flatIndex });
    setSelectedOption(null);
    setFeedback(null);
  }

  async function handleSubmitAnswer(item: FlatItem) {
    if (!groupId || selectedOption === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await studentProgressCheckApi.test.answerItem(groupId, item.id, selectedOption);
      setFeedback(res);
      setAnswers((prev) => ({ ...prev, [item.id]: { selectedOptionIndex: selectedOption, correct: res.correct } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить ответ.");
    } finally {
      setSubmitting(false);
    }
  }

  function goToNext(currentFlatIndex: number) {
    setSelectedOption(null);
    setFeedback(null);
    const next = currentFlatIndex + 1;
    if (next >= flatItems.length) {
      setStep("ready-to-finish");
      return;
    }
    const nextItem = flatItems[next];
    const currentItem = flatItems[currentFlatIndex];
    if (nextItem.blockIndex !== currentItem.blockIndex) setStep({ kind: "block-intro", blockIndex: nextItem.blockIndex });
    else setStep({ kind: "item", flatIndex: next });
  }

  async function handleFinish() {
    if (!groupId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await studentProgressCheckApi.test.complete(groupId);
      setResult(res);
      setStep("completed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось завершить диагностику.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!groupId) return null;

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Загрузка…</p>
      </Card>
    );
  }

  if (loadError || !attempt) {
    return (
      <Card>
        <ErrorAlert>{loadError ?? "Диагностика не найдена."}</ErrorAlert>
        <Link to={`/student/progress/${groupId}`} className="text-sm font-medium text-brand-600 hover:underline">
          ← К промежуточной диагностике
        </Link>
      </Card>
    );
  }

  if (step === "intro") {
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Промежуточная диагностика</h1>
        <p className="mb-3 text-sm text-slate-600">
          Та же проверка навыков, что и на старте (грамматика, лексика, чтение, аудирование), но другими заданиями — чтобы
          результат отражал реальный прогресс, а не запомненные ответы.
        </p>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Это не официальный экзамен и не сертификация CEFR. Результат сравнивается со стартовым для отслеживания прогресса.
        </div>
        <PrimaryButton type="button" onClick={startFirstBlock}>
          Начать
        </PrimaryButton>
      </Card>
    );
  }

  if (step === "completed") {
    return (
      <Card className="mx-auto max-w-xl">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Диагностика завершена.</h1>
        {!result ? <p className="text-sm text-slate-500">Загрузка результата…</p> : <ProgressResultView result={result} />}
        <SecondaryButton type="button" className="mt-6" onClick={() => navigate(`/student/progress/${groupId}`)}>
          Вернуться к промежуточной диагностике
        </SecondaryButton>
      </Card>
    );
  }

  if (step === "ready-to-finish") {
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Все задания выполнены</h1>
        <p className="mb-4 text-sm text-slate-600">
          Вы ответили на все {attempt.totalItems} заданий. Нажмите «Завершить диагностику», чтобы сохранить результат.
        </p>
        <ErrorAlert>{error}</ErrorAlert>
        <PrimaryButton type="button" onClick={handleFinish} disabled={submitting}>
          {submitting ? "Завершаем…" : "Завершить диагностику"}
        </PrimaryButton>
      </Card>
    );
  }

  if (typeof step === "object" && step.kind === "block-intro") {
    const block = attempt.blocks[step.blockIndex];
    return (
      <Card className="mx-auto max-w-xl">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Раздел {step.blockIndex + 1} из {attempt.blocks.length}
        </div>
        <h1 className="mb-3 text-xl font-semibold text-slate-900">{block.titleRu}</h1>
        <p className="mb-6 text-sm text-slate-600">{block.instructionRu}</p>
        <PrimaryButton type="button" onClick={() => enterBlock(step.blockIndex)}>
          Начать раздел «{block.titleRu}»
        </PrimaryButton>
      </Card>
    );
  }

  if (typeof step === "object" && step.kind === "item") {
    const item = flatItems[step.flatIndex];
    const passage = item.passageId ? passagesById.get(item.passageId) : undefined;
    const answered = feedback !== null;
    const answeredCount = Object.keys(answers).length;

    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>{SKILL_LABELS[item.skill]}</span>
          <span>
            Вопрос {item.indexInBlock + 1} из {attempt.blocks[item.blockIndex].items.length} · {answeredCount}/{attempt.totalItems} всего
          </span>
        </div>

        <Card>
          {passage && <PassagePanel passage={passage} />}
          <p className="mb-4 text-base font-medium text-slate-800">{item.promptEn}</p>
          <div className="space-y-2">
            {item.optionsEn.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isCorrectOption = answered && feedback?.correctOptionIndex === idx;
              const isWrongSelected = answered && isSelected && !feedback?.correct;
              return (
                <button
                  key={idx}
                  type="button"
                  data-option-index={idx}
                  disabled={answered}
                  onClick={() => setSelectedOption(idx)}
                  className={`block w-full rounded-lg border px-4 py-3 text-left text-sm transition ${
                    isCorrectOption
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : isWrongSelected
                        ? "border-red-300 bg-red-50 text-red-700"
                        : isSelected
                          ? "border-brand-500 bg-brand-50 text-brand-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  } ${answered ? "cursor-default" : "cursor-pointer"}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {feedback && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${feedback.correct ? "border-brand-200 bg-brand-50 text-brand-800" : "border-red-200 bg-red-50 text-red-700"}`}>
              {feedback.feedbackRu}
            </div>
          )}

          <ErrorAlert>{error}</ErrorAlert>

          <div className="mt-6">
            {!answered ? (
              <PrimaryButton type="button" onClick={() => handleSubmitAnswer(item)} disabled={selectedOption === null || submitting}>
                {submitting ? "Проверяем…" : "Ответить"}
              </PrimaryButton>
            ) : (
              <PrimaryButton type="button" onClick={() => goToNext(step.flatIndex)}>
                Далее
              </PrimaryButton>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return null;
}

function PassagePanel({ passage }: { passage: DiagnosticPassage }) {
  function play() {
    try {
      const utterance = new SpeechSynthesisUtterance(passage.contentEn);
      utterance.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // Web Speech API недоступен — молча игнорируем, текст всё равно доступен ниже.
    }
  }

  if (passage.skill === "LISTENING") {
    return (
      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mb-2 text-xs font-medium text-slate-500">{passage.titleRu}</div>
        <SecondaryButton type="button" onClick={play}>
          🔊 Прослушать
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-500">{passage.titleRu}</div>
      <p className="text-sm leading-relaxed text-slate-700">{passage.contentEn}</p>
    </div>
  );
}

function ProgressResultView({ result }: { result: DiagnosticResultResponse }) {
  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Общий результат: <strong>{result.overallCorrect}</strong> из <strong>{result.overallTotal}</strong> ({result.overallPercentage}%).
      </p>
      <div className="mb-4 space-y-2">
        {result.skillBreakdown.map((s) => (
          <div key={s.skill}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
              <span>{SKILL_LABELS[s.skill]}</span>
              <span>
                {s.correct}/{s.total} · {s.percentage}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${s.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Это предварительный числовой профиль по навыкам, а не официальный уровень CEFR. Полное сравнение со стартовым
        результатом появится на странице промежуточной диагностики после завершения и теста, и анкеты.
      </div>
    </div>
  );
}
