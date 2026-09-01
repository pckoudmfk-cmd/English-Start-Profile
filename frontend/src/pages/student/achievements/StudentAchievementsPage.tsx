import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  ACHIEVEMENT_STATUS_LABELS_RU,
  ACHIEVEMENT_STATUS_TONE,
  CLAIMED_RESULT_LABELS_RU,
  EVENT_TYPE_LABELS_RU,
  studentAchievementsApi,
  type StudentAchievement,
} from "../../../api/achievements";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, PrimaryButton } from "../../../components/ui";

// English Start Profile — Этап 8: «Мои достижения» (студент).
export function StudentAchievementsPage() {
  const [achievements, setAchievements] = useState<StudentAchievement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    studentAchievementsApi
      .list()
      .then(setAchievements)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить достижения."));
  }
  useEffect(load, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageTitle subtitle="Внеаудиторная активность и подтверждённые результаты">Мои достижения</PageTitle>
        <Link to="/student/achievements/new">
          <PrimaryButton type="button">Добавить достижение</PrimaryButton>
        </Link>
      </div>

      <ErrorAlert>{error}</ErrorAlert>

      {achievements === null ? (
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      ) : achievements.length === 0 ? (
        <Card>
          <EmptyState
            title="Пока нет достижений."
            hint="Добавляйте подтверждённые результаты участия во внеаудиторных мероприятиях."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {achievements.map((a) => (
            <Link key={a.id} to={a.status === "DRAFT" || a.status === "NEEDS_CLARIFICATION" ? `/student/achievements/${a.id}/edit` : `/student/achievements/${a.id}`}>
              <Card className="transition hover:border-brand-300">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 break-words">
                    <div className="text-sm font-medium text-slate-900">{a.eventName}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {new Date(a.eventDate).toLocaleDateString("ru-RU")} · {EVENT_TYPE_LABELS_RU[a.eventType]} · {CLAIMED_RESULT_LABELS_RU[a.claimedResult]}
                    </div>
                    {a.teacherComment && <div className="mt-2 text-xs text-slate-600">Комментарий преподавателя: {a.teacherComment}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={ACHIEVEMENT_STATUS_TONE[a.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[a.status]}</Badge>
                    {a.status === "CONFIRMED" && <span className="text-xs font-medium text-brand-700">+1 балл</span>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
