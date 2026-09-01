import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { studentGroupsApi, type StudentGroupMembership } from "../../../api/studentGroups";
import {
  CLAIMED_RESULTS,
  CLAIMED_RESULT_LABELS_RU,
  EVENT_TYPES,
  EVENT_TYPE_LABELS_RU,
  studentAchievementsApi,
  type AchievementFormFields,
  type ClaimedResult,
  type EventType,
  type StudentAchievement,
} from "../../../api/achievements";
import { Card, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, SecondaryButton, Select, TextInput } from "../../../components/ui";

// English Start Profile — Этап 8: форма добавления/правки достижения.
//
// Пошаговый мастер (ТЗ п.34 — короткая форма для мобильного сценария):
// 1. Мероприятие → 2. Результат → 3. Подтверждение (документы) →
// 4. Отправить. Шаги 1-2 — только локальное состояние формы, без
// обращений к backend (чтобы не создавать запись до того, как известны
// хотя бы базовые обязательные поля — claimedResult у API обязателен
// при создании). Реальная запись создаётся (POST) или обновляется
// (PUT) при переходе со шага 2 на шаг 3 — именно тогда появляется
// achievementId, нужный для загрузки документов.
const STEPS = ["Мероприятие", "Результат", "Подтверждение", "Отправить"] as const;

const emptyForm: AchievementFormFields = {
  eventName: "",
  eventDate: "",
  organizer: "",
  eventType: "CONFERENCE",
  claimedResult: "PARTICIPANT",
  claimedResultOther: "",
  resultPlace: "",
  resultNomination: "",
  description: "",
};

export function AchievementFormPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [groups, setGroups] = useState<StudentGroupMembership[]>([]);
  const [groupId, setGroupId] = useState("");
  const [form, setForm] = useState<AchievementFormFields>(emptyForm);
  const [achievement, setAchievement] = useState<StudentAchievement | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!!routeId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<StudentAchievement["possibleDuplicates"]>(undefined);

  useEffect(() => {
    studentGroupsApi.listMyGroups().then((memberships) => {
      setGroups(memberships);
      if (!routeId && memberships.length > 0) setGroupId(memberships[0].group.id);
    });
  }, [routeId]);

  useEffect(() => {
    if (!routeId) return;
    studentAchievementsApi
      .get(routeId)
      .then((a) => {
        setAchievement(a);
        setGroupId(a.groupId);
        setForm({
          eventName: a.eventName,
          eventDate: a.eventDate.slice(0, 10),
          organizer: a.organizer,
          eventType: a.eventType,
          claimedResult: a.claimedResult,
          claimedResultOther: a.claimedResultOther ?? "",
          resultPlace: a.resultPlace ?? "",
          resultNomination: a.resultNomination ?? "",
          description: a.description ?? "",
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить достижение."))
      .finally(() => setLoading(false));
  }, [routeId]);

  function set<K extends keyof AchievementFormFields>(key: K, value: AchievementFormFields[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validateStep1(): string | null {
    if (!groupId) return "Выберите группу.";
    if (!form.eventName.trim()) return "Укажите название мероприятия.";
    if (!form.eventDate) return "Укажите дату мероприятия.";
    if (!form.organizer.trim()) return "Укажите организатора.";
    return null;
  }
  function validateStep2(): string | null {
    if (form.claimedResult === "OTHER" && !form.claimedResultOther?.trim()) return "Укажите результат для варианта «Другое».";
    return null;
  }

  function goToStep2() {
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep(1);
  }

  async function goToStep3() {
    const err = validateStep1() ?? validateStep2();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = achievement
        ? await studentAchievementsApi.update(achievement.id, form)
        : await studentAchievementsApi.create({ groupId, ...form });
      setAchievement(saved);
      setDuplicateWarning(saved.possibleDuplicates);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить достижение.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    if (!achievement) return;
    setSaving(true);
    setError(null);
    try {
      const evidence = await studentAchievementsApi.uploadEvidence(achievement.id, file);
      setAchievement({ ...achievement, evidence: [...achievement.evidence, evidence] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить файл.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveEvidence(evidenceId: string) {
    if (!achievement) return;
    await studentAchievementsApi.removeEvidence(achievement.id, evidenceId);
    setAchievement({ ...achievement, evidence: achievement.evidence.filter((e) => e.id !== evidenceId) });
  }

  async function handleSubmit() {
    if (!achievement) return;
    setSaving(true);
    setError(null);
    try {
      const submitted = await studentAchievementsApi.submit(achievement.id);
      setDuplicateWarning(submitted.possibleDuplicates);
      navigate("/student/achievements", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить достижение на проверку.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <PageTitle>Достижение</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle subtitle={STEPS[step]}>{achievement ? "Изменить достижение" : "Добавить достижение"}</PageTitle>

      {/* Индикатор шага — тот же паттерн, что и progress-индикатор анкеты (Этап 4) */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                i <= step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-brand-600" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      <Card>
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="ach-group">Группа</FieldLabel>
              <Select id="ach-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!!achievement}>
                {groups.map((m) => (
                  <option key={m.group.id} value={m.group.id}>
                    {m.group.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="ach-name">Название мероприятия</FieldLabel>
              <TextInput id="ach-name" placeholder="Всероссийская научно-практическая конференция «...»" value={form.eventName} onChange={(e) => set("eventName", e.target.value)} required />
            </div>
            <div>
              <FieldLabel htmlFor="ach-date">Дата мероприятия</FieldLabel>
              <TextInput id="ach-date" type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} required />
            </div>
            <div>
              <FieldLabel htmlFor="ach-organizer">Организатор</FieldLabel>
              <TextInput id="ach-organizer" value={form.organizer} onChange={(e) => set("organizer", e.target.value)} required />
            </div>
            <div>
              <FieldLabel htmlFor="ach-type">Тип мероприятия</FieldLabel>
              <Select id="ach-type" value={form.eventType} onChange={(e) => set("eventType", e.target.value as EventType)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_TYPE_LABELS_RU[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end">
              <PrimaryButton type="button" onClick={goToStep2}>
                Далее
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="ach-result">Результат</FieldLabel>
              <Select id="ach-result" value={form.claimedResult} onChange={(e) => set("claimedResult", e.target.value as ClaimedResult)}>
                {CLAIMED_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {CLAIMED_RESULT_LABELS_RU[r]}
                  </option>
                ))}
              </Select>
            </div>
            {form.claimedResult === "OTHER" && (
              <div>
                <FieldLabel htmlFor="ach-result-other">Укажите результат</FieldLabel>
                <TextInput id="ach-result-other" value={form.claimedResultOther ?? ""} onChange={(e) => set("claimedResultOther", e.target.value)} required />
              </div>
            )}
            {form.claimedResult === "PRIZE_PLACE" && (
              <div>
                <FieldLabel htmlFor="ach-place">Место</FieldLabel>
                <TextInput id="ach-place" placeholder="II место" value={form.resultPlace ?? ""} onChange={(e) => set("resultPlace", e.target.value)} />
              </div>
            )}
            {form.claimedResult === "NOMINATION_WINNER" && (
              <div>
                <FieldLabel htmlFor="ach-nomination">Номинация</FieldLabel>
                <TextInput id="ach-nomination" value={form.resultNomination ?? ""} onChange={(e) => set("resultNomination", e.target.value)} />
              </div>
            )}
            <div>
              <FieldLabel htmlFor="ach-description">Описание (необязательно)</FieldLabel>
              <textarea
                id="ach-description"
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div className="flex justify-between">
              <SecondaryButton type="button" onClick={() => setStep(0)}>
                Назад
              </SecondaryButton>
              <PrimaryButton type="button" onClick={goToStep3} disabled={saving}>
                {saving ? "Сохраняем…" : "Далее"}
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 2 && achievement && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Прикрепите страницу сборника, сертификат, диплом или иной подтверждающий документ (PDF, JPEG, PNG, WebP — до 10 МБ).</p>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            {achievement.evidence.length > 0 && (
              <ul className="space-y-2">
                {achievement.evidence.map((e) => (
                  <li key={e.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span className="truncate">{e.fileName}</span>
                    <button type="button" onClick={() => handleRemoveEvidence(e.id)} className="ml-2 shrink-0 text-xs text-slate-400 hover:text-red-600">
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between">
              <SecondaryButton type="button" onClick={() => setStep(1)}>
                Назад
              </SecondaryButton>
              <PrimaryButton type="button" onClick={() => setStep(3)}>
                Далее
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === 3 && achievement && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Проверьте данные перед отправкой</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Мероприятие</dt><dd className="text-right text-slate-900">{form.eventName}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Дата</dt><dd className="text-slate-900">{form.eventDate}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Организатор</dt><dd className="text-slate-900">{form.organizer}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Тип</dt><dd className="text-slate-900">{EVENT_TYPE_LABELS_RU[form.eventType]}</dd></div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Результат</dt>
                <dd className="text-slate-900">
                  {CLAIMED_RESULT_LABELS_RU[form.claimedResult]}
                  {form.claimedResult === "OTHER" && form.claimedResultOther ? ` (${form.claimedResultOther})` : ""}
                  {form.claimedResult === "PRIZE_PLACE" && form.resultPlace ? ` — ${form.resultPlace}` : ""}
                  {form.claimedResult === "NOMINATION_WINNER" && form.resultNomination ? ` — ${form.resultNomination}` : ""}
                </dd>
              </div>
              <div className="flex justify-between"><dt className="text-slate-500">Документы</dt><dd className="text-slate-900">{achievement.evidence.length}</dd></div>
            </dl>
            {duplicateWarning && duplicateWarning.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Возможно, это уже добавленное мероприятие. Проверьте список достижений.
              </div>
            )}
            <p className="text-xs text-slate-400">
              Результат будет проверен преподавателем. До проверки квалификационный балл не начисляется — статус: «На проверке».
            </p>
            <div className="flex justify-between">
              <SecondaryButton type="button" onClick={() => setStep(2)}>
                Назад
              </SecondaryButton>
              <PrimaryButton type="button" onClick={handleSubmit} disabled={saving}>
                {saving ? "Отправляем…" : "Отправить на проверку"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
