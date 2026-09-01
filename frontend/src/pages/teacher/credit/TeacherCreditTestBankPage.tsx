import { useEffect, useState } from "react";
import { ApiError } from "../../../api/client";
import { workspaceApi, type Course } from "../../../api/workspace";
import {
  CREDIT_TEST_DIFFICULTY_LABELS_RU,
  GRAMMAR_TOPICS,
  GRAMMAR_TOPIC_LABELS_RU,
  teacherCreditApi,
  type CreditSettings,
  type CreditTestItem,
  type GrammarTopic,
} from "../../../api/credit";
import { Badge, Card, EmptyState, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, Select, SecondaryButton, SuccessAlert, TextInput } from "../../../components/ui";

const EMPTY_OPTIONS = ["", "", "", ""];

// English Start Profile — Этап 9: банк заданий лексико-грамматического
// теста (ТЗ п.10-11) и настройки зачёта на курс (ТЗ п.14, 16).
export function TeacherCreditTestBankPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [items, setItems] = useState<CreditTestItem[] | null>(null);
  const [settings, setSettings] = useState<CreditSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    workspaceApi.listCourses().then((cs) => {
      setCourses(cs);
      if (cs.length > 0) setCourseId(cs[0].id);
    });
  }, []);

  function load() {
    if (!courseId) return;
    teacherCreditApi.listTestItems(courseId).then(setItems).catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить банк заданий."));
    teacherCreditApi.getSettings(courseId).then(setSettings).catch(() => {});
  }
  useEffect(load, [courseId]);

  async function toggleActive(item: CreditTestItem) {
    try {
      const updated = await teacherCreditApi.toggleTestItemActive(item.id, !item.active);
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось изменить статус задания.");
    }
  }

  async function saveSettings(next: CreditSettings) {
    if (!courseId) return;
    try {
      const updated = await teacherCreditApi.putSettings(courseId, next);
      setSettings(updated);
      setSuccess("Настройки сохранены.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить настройки.");
    }
  }

  return (
    <div>
      <PageTitle subtitle="Управление банком заданий и настройками теста по курсу.">Банк заданий теста</PageTitle>

      <Card className="mb-6">
        <label className="mb-1 block text-xs font-medium text-slate-500">Курс</label>
        <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.academicYear.name}
            </option>
          ))}
        </Select>
      </Card>

      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{success}</SuccessAlert>

      {settings && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Настройки</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <FieldLabel htmlFor="maxAttempts">Количество попыток теста</FieldLabel>
              <TextInput
                id="maxAttempts"
                type="number"
                min={1}
                max={10}
                value={settings.maxTestAttempts}
                onChange={(e) => setSettings({ ...settings, maxTestAttempts: Number(e.target.value) || 1 })}
                className="w-24"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={settings.revealCorrectAnswers} onChange={(e) => setSettings({ ...settings, revealCorrectAnswers: e.target.checked })} />
              Показывать правильные ответы после завершения теста
            </label>
            <PrimaryButton type="button" onClick={() => saveSettings(settings)}>
              Сохранить настройки
            </PrimaryButton>
          </div>
        </Card>
      )}

      <NewItemForm
        courseId={courseId}
        onCreated={() => {
          load();
          setSuccess("Задание добавлено.");
        }}
        onError={setError}
      />

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Задания ({items?.filter((i) => i.active).length ?? 0} активных)</h2>
        {items === null ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : items.length === 0 ? (
          <EmptyState title="В банке этого курса ещё нет заданий." hint="Добавьте не менее 10 активных заданий, чтобы студенты могли начать тест." />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className={`rounded-lg border px-4 py-3 text-sm ${item.active ? "border-slate-200" : "border-slate-100 bg-slate-50 opacity-60"}`}>
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="font-medium text-slate-800">{item.question}</div>
                  <SecondaryButton type="button" onClick={() => toggleActive(item)} className="shrink-0 !px-2 !py-1 text-xs">
                    {item.active ? "Деактивировать" : "Активировать"}
                  </SecondaryButton>
                </div>
                <ul className="mb-1 flex flex-wrap gap-2 text-xs">
                  {item.options.map((o, idx) => (
                    <li key={idx} className={idx === item.correctOptionIndex ? "font-semibold text-brand-700" : "text-slate-500"}>
                      {o}
                      {idx === item.correctOptionIndex ? " ✓" : ""}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <Badge>{GRAMMAR_TOPIC_LABELS_RU[item.grammarTopic]}</Badge>
                  <Badge>{item.vocabularyTopic}</Badge>
                  <Badge>{CREDIT_TEST_DIFFICULTY_LABELS_RU[item.difficulty]}</Badge>
                </div>
                {item.explanationRu && <p className="mt-2 text-xs text-slate-500">Пояснение: {item.explanationRu}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function NewItemForm({ courseId, onCreated, onError }: { courseId: string; onCreated: () => void; onError: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [grammarTopic, setGrammarTopic] = useState<GrammarTopic>("PRESENT_SIMPLE");
  const [vocabularyTopic, setVocabularyTopic] = useState("");
  const [explanationRu, setExplanationRu] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <div className="mb-6">
        <PrimaryButton type="button" onClick={() => setOpen(true)} disabled={!courseId}>
          Добавить задание
        </PrimaryButton>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2 || !vocabularyTopic.trim()) {
      onError("Заполните вопрос, минимум 2 варианта ответа и лексическую тему.");
      return;
    }
    setSaving(true);
    try {
      await teacherCreditApi.createTestItem(courseId, {
        question: question.trim(),
        options: cleanOptions,
        correctOptionIndex,
        grammarTopic,
        vocabularyTopic: vocabularyTopic.trim(),
        explanationRu: explanationRu.trim() || undefined,
      });
      setQuestion("");
      setOptions(EMPTY_OPTIONS);
      setCorrectOptionIndex(0);
      setVocabularyTopic("");
      setExplanationRu("");
      setOpen(false);
      onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Не удалось добавить задание.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Новое задание</h2>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <FieldLabel htmlFor="question">Вопрос (на английском)</FieldLabel>
          <TextInput id="question" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Choose the correct form." />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {options.map((o, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correctOptionIndex === idx} onChange={() => setCorrectOptionIndex(idx)} />
              <TextInput
                value={o}
                onChange={(e) => setOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                placeholder={`Вариант ${idx + 1}${idx < 2 ? "" : " (необязательно)"}`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">Отметьте кружком правильный вариант.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="grammarTopic">Грамматическая тема</FieldLabel>
            <Select id="grammarTopic" value={grammarTopic} onChange={(e) => setGrammarTopic(e.target.value as GrammarTopic)}>
              {GRAMMAR_TOPICS.map((t) => (
                <option key={t} value={t}>
                  {GRAMMAR_TOPIC_LABELS_RU[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="vocabularyTopic">Лексическая тема (по материалам курса)</FieldLabel>
            <TextInput id="vocabularyTopic" value={vocabularyTopic} onChange={(e) => setVocabularyTopic(e.target.value)} placeholder="Например: Banking vocabulary unit 3" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="explanationRu">Пояснение к ответу на русском (необязательно)</FieldLabel>
          <TextInput id="explanationRu" value={explanationRu} onChange={(e) => setExplanationRu(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Сохраняем…" : "Добавить"}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={() => setOpen(false)}>
            Отмена
          </SecondaryButton>
        </div>
      </form>
    </Card>
  );
}
