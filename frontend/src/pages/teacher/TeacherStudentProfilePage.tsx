import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { teacherDashboardApi, type TeacherStudentProfile } from "../../api/teacherDashboard";
import { TeacherNoteForm } from "../../components/TeacherNoteForm";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle } from "../../components/ui";

// English Start Profile — Этап 6: профиль студента с точки зрения
// преподавателя (переход «Открыть профиль» из Dashboard).
//
// В отличие от Dashboard, здесь backend отдаёт ПОЛНЫЕ ответы анкеты
// (не только 9 кодов, нужных для агрегатов) — но только сюда, при явном
// открытии профиля конкретного студента (см. комментарий о
// производительности в backend/src/routes/teacherDashboard.ts).

const SKILL_LABELS: Record<string, string> = {
  GRAMMAR: "Грамматика",
  VOCABULARY: "Лексика",
  READING: "Чтение",
  LISTENING: "Аудирование",
};

function formatScale(v: number | null): string {
  return v === null ? "—" : v.toFixed(1).replace(".", ",");
}

export function TeacherStudentProfilePage() {
  const { groupId, studentId } = useParams<{ groupId: string; studentId: string }>();
  const [profile, setProfile] = useState<TeacherStudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!groupId || !studentId) return;
    setLoading(true);
    setNotFound(false);
    teacherDashboardApi
      .getStudentProfile(groupId, studentId)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Не удалось загрузить профиль студента.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [groupId, studentId]);

  if (notFound) {
    return (
      <div>
        <PageTitle>Студент не найден</PageTitle>
        <Card>
          <p className="text-sm text-slate-600">Студент не найден в этой группе или группа принадлежит другому преподавателю.</p>
          {groupId && (
            <Link to="/teacher" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
              ← Вернуться на главную
            </Link>
          )}
        </Card>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div>
        <PageTitle>Профиль студента</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    );
  }

  return (
    <div>
      <Link to="/teacher" className="text-xs text-slate-400 hover:text-slate-600">
        ← Главная
      </Link>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{profile.student.fullName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {profile.student.email}
        {profile.student.specialty ? ` · ${profile.student.specialty}` : ""}
        {profile.student.course ? ` · ${profile.student.course}` : ""}
        {profile.student.academicYear ? ` · ${profile.student.academicYear}` : ""}
      </p>

      <ErrorAlert>{error}</ErrorAlert>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Показатели Start Profile</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Самооценка</dt>
            <dd className="text-slate-900">{formatScale(profile.metrics.selfAssessment)} / 5</dd>
            <dt className="text-slate-500">Мотивация</dt>
            <dd className="text-slate-900">{formatScale(profile.metrics.motivation)} / 5</dd>
            <dt className="text-slate-500">Самостоятельность</dt>
            <dd className="text-slate-900">{formatScale(profile.metrics.autonomy)} / 5</dd>
          </dl>
          {!profile.questionnaire && <p className="mt-3 text-xs text-slate-400">Анкетирование ещё не начато.</p>}
          {profile.questionnaire && profile.questionnaire.status !== "COMPLETED" && (
            <p className="mt-3 text-xs text-slate-400">Анкетирование в процессе, показатели появятся после завершения.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Start Diagnostic</h2>
          {!profile.diagnostic || profile.diagnostic.status !== "COMPLETED" ? (
            <p className="text-sm text-slate-500">
              {profile.diagnostic?.status === "IN_PROGRESS" ? "Диагностика в процессе." : "Стартовая диагностика ещё не пройдена."}
            </p>
          ) : (
            <>
              <div className="mb-2 text-sm text-slate-700">
                Общий результат: <span className="font-semibold">{profile.diagnostic.overallPercentage}%</span>
              </div>
              <ul className="space-y-1 text-sm text-slate-600">
                {profile.diagnostic.skillBreakdown?.map((s) => (
                  <li key={s.skill} className="flex justify-between">
                    <span>{SKILL_LABELS[s.skill] ?? s.skill}</span>
                    <span>{s.percentage}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                Это не официальный сертификационный тест — только числовой результат, без CEFR-уровня.
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Ответы Start Profile</h2>
        {!profile.questionnaire || profile.questionnaire.status !== "COMPLETED" ? (
          <EmptyState title="Анкетирование ещё не завершено." />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {profile.questionnaire.answers.map((a, i) => (
              <li key={i} className="py-2">
                <div className="text-slate-500">{a.question}</div>
                <div className="text-slate-900">{a.answer}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Заметки преподавателя</h2>
        {profile.notes.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">Заметок пока нет.</p>
        ) : (
          <ul className="mb-4 space-y-2">
            {profile.notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="text-slate-800">{n.text}</div>
                <div className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("ru-RU")}</div>
              </li>
            ))}
          </ul>
        )}
        {groupId && studentId && (
          <TeacherNoteForm
            groupId={groupId}
            studentId={studentId}
            onAdded={(note) => setProfile((p) => (p ? { ...p, notes: [note, ...p.notes] } : p))}
          />
        )}
      </Card>

      {profile.diagnostic?.diagnosticRange === null && profile.diagnostic?.status === "COMPLETED" && (
        <p className="mt-4 text-xs text-slate-400">
          <Badge>Без CEFR-уровня</Badge> — утверждённой матрицы порогов пока нет, показан только числовой результат.
        </p>
      )}
    </div>
  );
}
