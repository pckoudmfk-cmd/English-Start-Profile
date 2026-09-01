import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  ACTIVE_VOCABULARY_LABELS_RU,
  ERROR_COUNT_LABELS_RU,
  ERROR_NATURE_LABELS_RU,
  FINAL_GRADE_LABELS_RU,
  LOGIC_LABELS_RU,
  QUESTION_RESPONSE_LABELS_RU,
  TASK_COMPLETION_LABELS_RU,
  teacherCreditApi,
  type OralCriteriaOptions,
  type OralTopic,
} from "../../../api/credit";
import { Badge, Card, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, Select, SecondaryButton, SuccessAlert, TextInput } from "../../../components/ui";

// English Start Profile — Этап 9: карточка «Зачёт студента» — полный
// конвейер (ТЗ п.32: Допуск → Тест → Квалификационные баллы → Устная
// часть/освобождение → Итог), назначение темы устной части и её
// оценка преподавателем (ТЗ п.19-22).
export function TeacherCreditStudentDetailPage() {
  const { groupId, studentId } = useParams<{ groupId: string; studentId: string }>();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof teacherCreditApi.getStudentSummary>> | null>(null);
  const [topics, setTopics] = useState<OralTopic[]>([]);
  const [options, setOptions] = useState<OralCriteriaOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function load() {
    if (!groupId || !studentId) return;
    teacherCreditApi
      .getStudentSummary(groupId, studentId)
      .then(setSummary)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить зачёт студента."));
  }
  useEffect(load, [groupId, studentId]);
  useEffect(() => {
    teacherCreditApi.getOralTopics().then(setTopics).catch(() => {});
    teacherCreditApi.getOralCriteriaOptions().then(setOptions).catch(() => {});
  }, []);

  if (!groupId || !studentId) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle subtitle="Полный конвейер: допуск → тест → квалификационные баллы → устная часть → итог.">Зачёт студента</PageTitle>
      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{success}</SuccessAlert>

      {!summary ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Итог</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{summary.overallStatusLabel}</div>
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">1. Допуск</h2>
            <Badge tone={summary.dictionary.status === "CONFIRMED" ? "brand" : "sky"}>{summary.dictionary.statusLabel}</Badge>
            {summary.dictionary.latest && (
              <p className="mt-2 text-sm text-slate-600">
                {summary.dictionary.latest.wordCount} слов ·{" "}
                <Link to={`/teacher/credit/dictionary/${summary.dictionary.latest.id}`} className="text-brand-600 hover:underline">
                  открыть заявку
                </Link>
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">2. Лексико-грамматический тест</h2>
            <Badge tone={summary.test.status === "COMPLETED" ? "brand" : "sky"}>{summary.test.status === "COMPLETED" ? "Выполнен" : summary.test.status === "IN_PROGRESS" ? "В процессе" : "Не начат"}</Badge>
            <p className="mt-2 text-sm text-slate-600">
              Попыток: {summary.test.attemptsUsed} из {summary.test.maxAttempts}
              {summary.test.latestResult ? ` · Результат: ${summary.test.latestResult.correctCount} / ${summary.test.latestResult.totalCount}` : ""}
            </p>
            <TestAttemptsDetails groupId={groupId} studentId={studentId} />
          </Card>

          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-800">3. Квалификационные баллы</h2>
            <div className="text-lg font-semibold text-slate-900">{summary.qualification.points} / 5</div>
            <p className="mt-1 text-xs text-slate-500">{summary.qualification.oralPartExempt ? "Требование выполнено — освобождение от устной части." : `До освобождения: ${summary.qualification.pointsUntilExemption}.`}</p>
          </Card>

          <OralSection groupId={groupId} studentId={studentId} summary={summary} topics={topics} options={options} onChanged={() => { load(); setSuccess("Сохранено."); }} onError={setError} />
        </div>
      )}
    </div>
  );
}

function TestAttemptsDetails({ groupId, studentId }: { groupId: string; studentId: string }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<Awaited<ReturnType<typeof teacherCreditApi.getStudentTestAttempts>> | null>(null);

  async function toggle() {
    if (!open && !attempts) {
      const res = await teacherCreditApi.getStudentTestAttempts(groupId, studentId);
      setAttempts(res);
    }
    setOpen((o) => !o);
  }

  return (
    <div className="mt-3">
      <SecondaryButton type="button" onClick={toggle} className="!px-2 !py-1 text-xs">
        {open ? "Скрыть" : "Подробнее"}
      </SecondaryButton>
      {open && attempts && (
        <div className="mt-3 space-y-4">
          {attempts.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-xs font-medium text-slate-500">
                Попытка {a.attemptNumber} · {a.status === "COMPLETED" ? `${a.correctCount} / ${a.totalCount}` : "не завершена"}
              </div>
              {a.items.map((item, idx) => (
                <div key={idx} className="mb-2 text-xs">
                  <div className="font-medium text-slate-700">{item.question}</div>
                  <div className={item.correct ? "text-brand-700" : "text-red-600"}>
                    Ответ: {item.selectedOptionIndex !== null ? item.options[item.selectedOptionIndex] : "—"} · Верно: {item.options[item.correctOptionIndex]}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OralSection({
  groupId,
  studentId,
  summary,
  topics,
  options,
  onChanged,
  onError,
}: {
  groupId: string;
  studentId: string;
  summary: Awaited<ReturnType<typeof teacherCreditApi.getStudentSummary>>;
  topics: OralTopic[];
  options: OralCriteriaOptions | null;
  onChanged: () => void;
  onError: (e: string) => void;
}) {
  const oral = summary.oral;
  const [topicId, setTopicId] = useState("");
  const [assignComment, setAssignComment] = useState("");
  const [taskCompletion, setTaskCompletion] = useState("");
  const [errorCount, setErrorCount] = useState("");
  const [errorNature, setErrorNature] = useState<string[]>(oral.errorNature ?? []);
  const [logic, setLogic] = useState("");
  const [activeVocabulary, setActiveVocabulary] = useState("");
  const [questionResponses, setQuestionResponses] = useState("");
  const [preliminary, setPreliminary] = useState<string | null>(null);
  const [finalGrade, setFinalGrade] = useState("");
  const [confirmComment, setConfirmComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function assign() {
    if (!topicId) return onError("Выберите тему.");
    setBusy(true);
    try {
      await teacherCreditApi.assignOralTopic(groupId, studentId, { topicId, comment: assignComment.trim() || undefined });
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Не удалось назначить тему.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCriteria() {
    setBusy(true);
    try {
      const res = await teacherCreditApi.saveOralCriteria(groupId, studentId, {
        taskCompletion: taskCompletion || undefined,
        errorCount: errorCount || undefined,
        errorNature,
        logic: logic || undefined,
        activeVocabulary: activeVocabulary || undefined,
        questionResponses: questionResponses || undefined,
      });
      setPreliminary(res.preliminaryGrade);
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Не удалось сохранить критерии.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!finalGrade) return onError("Выберите итоговую оценку.");
    setBusy(true);
    try {
      await teacherCreditApi.confirmOralGrade(groupId, studentId, { finalGrade, comment: confirmComment.trim() || undefined });
      onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Не удалось подтвердить оценку.");
    } finally {
      setBusy(false);
    }
  }

  if (oral.status === "EXEMPTED") {
    return (
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">4. Устная часть</h2>
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">Освобождён — {oral.exemptionReason}</div>
      </Card>
    );
  }

  if (oral.status === "CONFIRMED") {
    return (
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">4. Устная часть</h2>
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          Итоговая оценка: <strong>{FINAL_GRADE_LABELS_RU[oral.finalGrade ?? ""] ?? oral.finalGrade}</strong>
          {oral.teacherComment && <div className="mt-1 text-xs">{oral.teacherComment}</div>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold text-slate-800">4. Устная часть</h2>

      {oral.status === "NOT_ASSIGNED" ? (
        <div className="space-y-3">
          <FieldLabel htmlFor="topic">Тема (из утверждённого списка)</FieldLabel>
          <Select id="topic" value={topicId} onChange={(e) => setTopicId(e.target.value)}>
            <option value="">— выберите —</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.en} — {t.ru}
              </option>
            ))}
          </Select>
          <TextInput value={assignComment} onChange={(e) => setAssignComment(e.target.value)} placeholder="Комментарий (необязательно)" />
          <PrimaryButton type="button" onClick={assign} disabled={busy}>
            Назначить тему
          </PrimaryButton>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="font-medium text-slate-800">{topics.find((t) => t.id === oral.topic?.id)?.en ?? oral.topic?.en}</div>
            <div className="text-xs text-slate-500">{oral.topic?.ru}</div>
          </div>

          {options && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Критерии оценки</h3>
              <CriteriaRow label="Коммуникативная задача" value={taskCompletion} onChange={setTaskCompletion} values={options.taskCompletion} labels={TASK_COMPLETION_LABELS_RU} />
              <CriteriaRow label="Количество ошибок" value={errorCount} onChange={setErrorCount} values={options.errorCount} labels={ERROR_COUNT_LABELS_RU} />
              <div>
                <FieldLabel>Характер ошибок</FieldLabel>
                <div className="flex flex-wrap gap-3">
                  {options.errorNature.map((v) => (
                    <label key={v} className="flex items-center gap-1 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={errorNature.includes(v)}
                        onChange={(e) => setErrorNature((prev) => (e.target.checked ? [...prev, v] : prev.filter((x) => x !== v)))}
                      />
                      {ERROR_NATURE_LABELS_RU[v]}
                    </label>
                  ))}
                </div>
              </div>
              <CriteriaRow label="Логика высказывания" value={logic} onChange={setLogic} values={options.logic} labels={LOGIC_LABELS_RU} />
              <CriteriaRow label="Активная лексика" value={activeVocabulary} onChange={setActiveVocabulary} values={options.activeVocabulary} labels={ACTIVE_VOCABULARY_LABELS_RU} />
              <CriteriaRow label="Ответы на вопросы преподавателя" value={questionResponses} onChange={setQuestionResponses} values={options.questionResponses} labels={QUESTION_RESPONSE_LABELS_RU} />
              <SecondaryButton type="button" onClick={saveCriteria} disabled={busy}>
                Сохранить критерии
              </SecondaryButton>

              {preliminary && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                  Предварительный результат: <strong>{FINAL_GRADE_LABELS_RU[preliminary]}</strong>.
                  <div className="mt-1 text-xs">Итоговую оценку подтверждает преподаватель.</div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <FieldLabel htmlFor="finalGrade">Итоговая оценка</FieldLabel>
                <Select id="finalGrade" value={finalGrade} onChange={(e) => setFinalGrade(e.target.value)}>
                  <option value="">— выберите —</option>
                  {options.finalGrades.map((g) => (
                    <option key={g} value={g}>
                      {FINAL_GRADE_LABELS_RU[g]}
                    </option>
                  ))}
                </Select>
                <TextInput value={confirmComment} onChange={(e) => setConfirmComment(e.target.value)} placeholder="Комментарий (необязательно)" className="mt-2" />
                <PrimaryButton type="button" onClick={confirm} disabled={busy || oral.status !== "GRADED_DRAFT"} className="mt-3">
                  Подтвердить итоговую оценку
                </PrimaryButton>
                {oral.status !== "GRADED_DRAFT" && <p className="mt-1 text-xs text-slate-400">Сначала сохраните критерии оценки.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function CriteriaRow({ label, value, onChange, values, labels }: { label: string; value: string; onChange: (v: string) => void; values: readonly string[]; labels: Record<string, string> }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— выберите —</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {labels[v]}
          </option>
        ))}
      </Select>
    </div>
  );
}
