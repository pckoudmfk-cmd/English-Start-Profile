import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentProgressCheckApi, type ProgressQuestionnaireAttempt } from "../../../api/progressCheck";
import { QUESTIONNAIRE_BLOCKS, isQuestionVisible, hasAnswer, type QuestionDef } from "../../../questionnaire/definition";
import { Card, ErrorAlert, PrimaryButton, SecondaryButton } from "../../../components/ui";
import { QuestionRenderer } from "../diagnostics/QuestionRenderer";

// English Start Profile — Этап 10: повторная анкета Промежуточной
// диагностики. Тот же UX/те же вопросы, что и Start (QuestionnaireWizardPage,
// Этап 4) — сознательно не переизобретается, отличается только тем, ЧТО
// открывает попытку (не студент нажатием кнопки, а преподаватель
// назначением — эта страница только ГОТОВУЮ, уже назначенную попытку
// показывает и заполняет) и КУДА уходят запросы (progress-check API).
type Step = "intro" | number | "completed";
const AUTOSAVE_INTERVAL_MS = 15_000;

function findResumeBlockIndex(answers: Record<string, unknown>): number {
  for (let i = 0; i < QUESTIONNAIRE_BLOCKS.length; i++) {
    const block = QUESTIONNAIRE_BLOCKS[i];
    const hasUnanswered = block.questions.some((q) => isQuestionVisible(q, answers) && q.required && !hasAnswer(q, answers[q.code]));
    if (hasUnanswered) return i;
  }
  return QUESTIONNAIRE_BLOCKS.length - 1;
}

export function ProgressQuestionnaireWizardPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<ProgressQuestionnaireAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState<Step>("intro");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dirtyCodesRef = useRef<Set<string>>(new Set());
  const answersRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    studentProgressCheckApi.questionnaire
      .open(groupId)
      .then((res) => {
        setAttempt(res);
        setAnswers(res.answers);
        if (res.status === "COMPLETED") setStep("completed");
        else if (Object.keys(res.answers).length > 0) setStep(findResumeBlockIndex(res.answers));
        else setStep("intro");
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Не удалось открыть анкету."))
      .finally(() => setLoading(false));
  }, [groupId]);

  const persistDirtyAnswers = useCallback(async () => {
    if (!groupId || dirtyCodesRef.current.size === 0) return true;
    const codes = Array.from(dirtyCodesRef.current);
    setSaving(true);
    setSaveError(null);
    try {
      await Promise.all(codes.map((code) => studentProgressCheckApi.questionnaire.saveAnswer(groupId, code, answersRef.current[code])));
      dirtyCodesRef.current.clear();
      return true;
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Не удалось сохранить ответы. Проверьте соединение.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [groupId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void persistDirtyAnswers();
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [persistDirtyAnswers]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyCodesRef.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  function updateAnswer(code: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [code]: value }));
    dirtyCodesRef.current.add(code);
    setBlockError(null);
  }

  const currentBlockIndex = typeof step === "number" ? step : null;
  const currentBlock = currentBlockIndex !== null ? QUESTIONNAIRE_BLOCKS[currentBlockIndex] : null;
  const visibleQuestionsInBlock: QuestionDef[] = useMemo(() => {
    if (!currentBlock) return [];
    return currentBlock.questions.filter((q) => isQuestionVisible(q, answers));
  }, [currentBlock, answers]);
  const isLastBlock = currentBlockIndex === QUESTIONNAIRE_BLOCKS.length - 1;

  async function handleNext() {
    const missing = visibleQuestionsInBlock.filter((q) => q.required && !hasAnswer(q, answers[q.code]));
    if (missing.length > 0) {
      setBlockError("Ответьте на обязательные вопросы, чтобы продолжить.");
      return;
    }
    setBlockError(null);
    const ok = await persistDirtyAnswers();
    if (!ok) return;
    if (isLastBlock) {
      await handleComplete();
      return;
    }
    setStep((currentBlockIndex as number) + 1);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  async function handleBack() {
    setBlockError(null);
    await persistDirtyAnswers();
    if (currentBlockIndex === 0) setStep("intro");
    else if (currentBlockIndex !== null) setStep(currentBlockIndex - 1);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }

  async function handleComplete() {
    if (!groupId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await studentProgressCheckApi.questionnaire.complete(groupId);
      setAttempt(result);
      setStep("completed");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && (err.payload as any)?.error === "INCOMPLETE") {
        setBlockError("Ещё остались незаполненные обязательные вопросы в предыдущих блоках.");
      } else {
        setSaveError(err instanceof ApiError ? err.message : "Не удалось завершить анкетирование.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!groupId) return null;

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Загрузка анкеты…</p>
      </Card>
    );
  }

  if (loadError || !attempt) {
    return (
      <Card>
        <ErrorAlert>{loadError ?? "Анкета не найдена."}</ErrorAlert>
        <Link to={`/student/progress/${groupId}`} className="text-sm font-medium text-brand-600 hover:underline">
          ← К промежуточной диагностике
        </Link>
      </Card>
    );
  }

  if (step === "completed") {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Анкета завершена.</h1>
        <p className="mb-6 text-sm text-slate-500">
          Спасибо! Ваши ответы сохранены{attempt.completedAt ? ` ${new Date(attempt.completedAt).toLocaleDateString("ru-RU")}` : ""}.
        </p>
        <SecondaryButton type="button" onClick={() => navigate(`/student/progress/${groupId}`)}>
          Вернуться к промежуточной диагностике
        </SecondaryButton>
      </Card>
    );
  }

  if (step === "intro") {
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="mb-3 text-xl font-semibold text-slate-900">Анкета — промежуточная диагностика</h1>
        <p className="mb-3 text-sm text-slate-600">
          Те же вопросы, что и в стартовой анкете — это нужно, чтобы честно сравнить, что изменилось в вашей самооценке,
          мотивации и целях за прошедшее время.
        </p>
        <p className="mb-6 text-sm font-medium text-slate-700">Займёт около 10–15 минут.</p>
        <PrimaryButton type="button" onClick={() => setStep(0)}>
          Начать
        </PrimaryButton>
      </Card>
    );
  }

  if (!currentBlock || currentBlockIndex === null) return null;
  const progressPercent = Math.round(((currentBlockIndex + 1) / QUESTIONNAIRE_BLOCKS.length) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
          <span>
            {currentBlockIndex + 1} из {QUESTIONNAIRE_BLOCKS.length} разделов
          </span>
          {saving && <span className="text-brand-600">Сохраняем…</span>}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <Card>
        <h2 className="mb-5 text-lg font-semibold text-slate-900">{currentBlock.title}</h2>
        <div className="space-y-6">
          {visibleQuestionsInBlock.map((q) => (
            <QuestionRenderer key={q.code} question={q} value={answers[q.code]} onChange={(v) => updateAnswer(q.code, v)} />
          ))}
        </div>
        <ErrorAlert>{blockError}</ErrorAlert>
        <ErrorAlert>{saveError}</ErrorAlert>
        <div className="mt-6 flex justify-between gap-3">
          <SecondaryButton type="button" onClick={handleBack} disabled={saving}>
            Назад
          </SecondaryButton>
          <PrimaryButton type="button" onClick={handleNext} disabled={saving}>
            {isLastBlock ? "Завершить анкету" : "Далее"}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}
