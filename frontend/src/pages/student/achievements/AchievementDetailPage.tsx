import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  ACHIEVEMENT_STATUS_LABELS_RU,
  ACHIEVEMENT_STATUS_TONE,
  CLAIMED_RESULT_LABELS_RU,
  EVENT_TYPE_LABELS_RU,
  studentAchievementsApi,
  type StudentAchievement,
} from "../../../api/achievements";
import { Badge, Card, ErrorAlert, PageTitle } from "../../../components/ui";

// Достижение, которое студент уже не может редактировать (на проверке
// или уже проверено) — только просмотр статуса, балла и комментария
// преподавателя (ТЗ п.4).
export function AchievementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [achievement, setAchievement] = useState<StudentAchievement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    studentAchievementsApi
      .get(id)
      .then(setAchievement)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить достижение."));
  }, [id]);

  if (error) {
    return (
      <div>
        <PageTitle>Достижение</PageTitle>
        <ErrorAlert>{error}</ErrorAlert>
        <Link to="/student/achievements" className="text-sm font-medium text-brand-600 hover:underline">
          ← Мои достижения
        </Link>
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
      </div>
    );
  }

  return (
    <div>
      <Link to="/student/achievements" className="text-xs text-slate-400 hover:text-slate-600">
        ← Мои достижения
      </Link>
      <h1 className="mt-1 break-words text-2xl font-semibold text-slate-900">{achievement.eventName}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone={ACHIEVEMENT_STATUS_TONE[achievement.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[achievement.status]}</Badge>
        {achievement.status === "CONFIRMED" && <span className="text-sm font-medium text-brand-700">+1 квалификационный балл</span>}
      </div>

      <Card className="mt-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Дата</dt><dd className="text-slate-900">{new Date(achievement.eventDate).toLocaleDateString("ru-RU")}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Организатор</dt><dd className="text-slate-900">{achievement.organizer}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Тип</dt><dd className="text-slate-900">{EVENT_TYPE_LABELS_RU[achievement.eventType]}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Результат</dt><dd className="text-slate-900">{CLAIMED_RESULT_LABELS_RU[achievement.claimedResult]}</dd></div>
          {achievement.resultPlace && <div className="flex justify-between"><dt className="text-slate-500">Место</dt><dd className="text-slate-900">{achievement.resultPlace}</dd></div>}
          {achievement.resultNomination && <div className="flex justify-between"><dt className="text-slate-500">Номинация</dt><dd className="text-slate-900">{achievement.resultNomination}</dd></div>}
          {achievement.description && <div><dt className="text-slate-500">Описание</dt><dd className="mt-1 text-slate-900">{achievement.description}</dd></div>}
        </dl>
      </Card>

      {achievement.evidence.length > 0 && (
        <Card className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Подтверждающие документы</h2>
          <ul className="space-y-2">
            {achievement.evidence.map((e) => (
              <li key={e.id}>
                <a href={studentAchievementsApi.evidenceUrl(achievement.id, e.id)} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">
                  {e.fileName}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {achievement.teacherComment && (
        <Card className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Комментарий преподавателя</h2>
          <p className="text-sm text-slate-800">{achievement.teacherComment}</p>
        </Card>
      )}
    </div>
  );
}
