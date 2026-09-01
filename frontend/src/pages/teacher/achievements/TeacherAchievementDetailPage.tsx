import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  ACHIEVEMENT_STATUS_LABELS_RU,
  ACHIEVEMENT_STATUS_TONE,
  CLAIMED_RESULT_LABELS_RU,
  EVENT_TYPE_LABELS_RU,
  teacherAchievementsApi,
  type AchievementStatus,
  type DecisionAction,
  type TeacherAchievementDetail,
} from "../../../api/achievements";
import { Badge, Card, ErrorAlert, PageTitle, PrimaryButton, Select, SecondaryButton, SuccessAlert } from "../../../components/ui";

// English Start Profile — Этап 8: карточка проверки достижения
// (открывается из «Проверка достижений», ТЗ п.9-10).
export function TeacherAchievementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [achievement, setAchievement] = useState<TeacherAchievementDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [changeStatusMode, setChangeStatusMode] = useState(false);
  const [targetStatus, setTargetStatus] = useState<AchievementStatus>("REJECTED");

  function load() {
    if (!id) return;
    teacherAchievementsApi
      .get(id)
      .then((a) => {
        setAchievement(a);
        setComment("");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Не удалось загрузить достижение.");
      });
  }
  useEffect(load, [id]);

  async function decide(action: DecisionAction) {
    if (!id) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await teacherAchievementsApi.decide(id, { action, comment: comment.trim() || undefined, targetStatus: action === "CHANGE_STATUS" ? targetStatus : undefined });
      setMessage(decisionSuccessMessage(action));
      setChangeStatusMode(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить решение.");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div>
        <PageTitle>Достижение не найдено</PageTitle>
        <Card>
          <p className="text-sm text-slate-600">Достижение не найдено, или группа принадлежит другому преподавателю.</p>
          <Link to="/teacher/achievements" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            ← Проверка достижений
          </Link>
        </Card>
      </div>
    );
  }
  if (!achievement) {
    return (
      <div>
        <PageTitle>Достижение</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    );
  }

  const isPending = achievement.status === "PENDING";
  const isOverridable = ["CONFIRMED", "CONFIRMED_NO_POINT", "REJECTED"].includes(achievement.status);

  return (
    <div>
      <Link to="/teacher/achievements" className="text-xs text-slate-400 hover:text-slate-600">
        ← Проверка достижений
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="break-words text-2xl font-semibold text-slate-900">{achievement.eventName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {achievement.student.fullName} · {achievement.group.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ACHIEVEMENT_STATUS_TONE[achievement.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[achievement.status]}</Badge>
          {achievement.qualificationPoint === 1 && <span className="text-sm font-medium text-brand-700">+1 балл</span>}
        </div>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{message}</SuccessAlert>

      {achievement.possibleDuplicates.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Возможно, это уже добавленное мероприятие. Проверьте список достижений студента: {achievement.possibleDuplicates.map((d) => `«${d.eventName}» (${ACHIEVEMENT_STATUS_LABELS_RU[d.status]})`).join(", ")}.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Информация</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Студент</dt><dd className="text-slate-900">{achievement.student.fullName}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Группа</dt><dd className="text-slate-900">{achievement.group.name}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Курс / год</dt><dd className="text-slate-900">{achievement.group.course} · {achievement.group.academicYear}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Дата мероприятия</dt><dd className="text-slate-900">{new Date(achievement.eventDate).toLocaleDateString("ru-RU")}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Организатор</dt><dd className="text-slate-900">{achievement.organizer}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Тип</dt><dd className="text-slate-900">{EVENT_TYPE_LABELS_RU[achievement.eventType]}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Заявленный результат</dt><dd className="text-slate-900">{CLAIMED_RESULT_LABELS_RU[achievement.claimedResult]}{achievement.claimedResultOther ? ` (${achievement.claimedResultOther})` : ""}</dd></div>
            {achievement.resultPlace && <div className="flex justify-between"><dt className="text-slate-500">Место</dt><dd className="text-slate-900">{achievement.resultPlace}</dd></div>}
            {achievement.resultNomination && <div className="flex justify-between"><dt className="text-slate-500">Номинация</dt><dd className="text-slate-900">{achievement.resultNomination}</dd></div>}
            {achievement.description && <div><dt className="text-slate-500">Описание</dt><dd className="mt-1 text-slate-900">{achievement.description}</dd></div>}
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Подтверждение</h2>
          {achievement.evidence.length === 0 ? (
            <p className="text-sm text-slate-500">Студент не приложил документов.</p>
          ) : (
            <ul className="space-y-2">
              {achievement.evidence.map((e) => (
                <li key={e.id}>
                  <a href={teacherAchievementsApi.evidenceUrl(achievement.id, e.id)} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">
                    {e.fileName}
                  </a>
                </li>
              ))}
            </ul>
          )}

          {achievement.teacherComment && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-medium">Комментарий преподавателя: </span>
              {achievement.teacherComment}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Решение</h2>
        {(isPending || changeStatusMode) && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-slate-500">Комментарий (обязателен для «без балла», «уточнение», «отклонить» и «изменить статус»)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

        {isPending && (
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="button" disabled={busy} onClick={() => decide("CONFIRM")}>
              Подтвердить — 1 балл
            </PrimaryButton>
            <SecondaryButton type="button" disabled={busy} onClick={() => decide("CONFIRM_NO_POINT")}>
              Подтвердить без балла
            </SecondaryButton>
            <SecondaryButton type="button" disabled={busy} onClick={() => decide("REQUEST_CLARIFICATION")}>
              Запросить уточнение
            </SecondaryButton>
            <SecondaryButton type="button" disabled={busy} onClick={() => decide("REJECT")}>
              Отклонить
            </SecondaryButton>
          </div>
        )}

        {!isPending && !isOverridable && (
          <p className="text-sm text-slate-500">Достижение ещё не отправлено студентом на проверку.</p>
        )}

        {isOverridable && !changeStatusMode && (
          <SecondaryButton type="button" onClick={() => setChangeStatusMode(true)}>
            Изменить статус
          </SecondaryButton>
        )}
        {isOverridable && changeStatusMode && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Новый статус</label>
              <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as AchievementStatus)}>
                <option value="CONFIRMED">Подтверждено — 1 балл</option>
                <option value="CONFIRMED_NO_POINT">Подтверждено без балла</option>
                <option value="NEEDS_CLARIFICATION">Требует уточнения</option>
                <option value="REJECTED">Отклонено</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <PrimaryButton type="button" disabled={busy || !comment.trim()} onClick={() => decide("CHANGE_STATUS")}>
                Применить
              </PrimaryButton>
              <SecondaryButton type="button" onClick={() => setChangeStatusMode(false)}>
                Отмена
              </SecondaryButton>
            </div>
          </div>
        )}
      </Card>

      {achievement.auditLog.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">История изменений</h2>
          <ul className="space-y-2 text-xs text-slate-500">
            {achievement.auditLog.map((l) => (
              <li key={l.id} className="border-b border-slate-100 pb-2 last:border-0">
                <span className="font-medium text-slate-700">{AUDIT_ACTION_LABELS_RU[l.action] ?? l.action}</span> — {new Date(l.createdAt).toLocaleString("ru-RU")}
                {l.reason && <div className="text-slate-600">Причина: {l.reason}</div>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Соответствует словарю AuditLog.action на backend (см.
// achievements/service.ts, DECISION_AUDIT_ACTION, и routes/
// studentAchievements.ts) — глагол в форме свершившегося факта.
const AUDIT_ACTION_LABELS_RU: Record<string, string> = {
  CREATED: "Создано студентом",
  SUBMITTED: "Отправлено на проверку",
  EDITED: "Изменено студентом",
  EVIDENCE_ADDED: "Добавлен документ",
  EVIDENCE_REMOVED: "Удалён документ",
  CLARIFICATION_REQUESTED: "Запрошено уточнение",
  CONFIRMED: "Подтверждено",
  CONFIRMED_NO_POINT: "Подтверждено без балла",
  POINT_AWARDED: "Начислен балл",
  REJECTED: "Отклонено",
  STATUS_REVERTED: "Статус изменён преподавателем",
  POINT_REVOKED: "Балл отозван",
};

function decisionSuccessMessage(action: DecisionAction): string {
  switch (action) {
    case "CONFIRM":
      return "Достижение подтверждено. Начислен 1 квалификационный балл.";
    case "CONFIRM_NO_POINT":
      return "Участие подтверждено. Квалификационный балл не начислен, так как результативное участие не подтверждено.";
    case "REQUEST_CLARIFICATION":
      return "Преподаватель запросил уточнение.";
    case "REJECT":
      return "Достижение не подтверждено.";
    case "CHANGE_STATUS":
      return "Статус достижения изменён.";
  }
}
