import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import {
  teacherStudentProfileApi,
  type DiagnosticTabResponse,
  type GoalStatus,
  type NoteEntry,
  type OverviewResponse,
  type QuestionnaireTabResponse,
} from "../../api/teacherStudentProfile";
import type { GapCategory } from "../../api/teacherDashboard";
import { ACHIEVEMENT_STATUS_LABELS_RU, ACHIEVEMENT_STATUS_TONE, CLAIMED_RESULT_LABELS_RU } from "../../api/achievements";
import { TeacherNoteForm, noteTypeLabel } from "../../components/TeacherNoteForm";
import { Badge, Card, EmptyState, ErrorAlert, PrimaryButton, Select } from "../../components/ui";

// English Start Profile — Этап 7: ПОЛНЫЙ ПРОФИЛЬ СТУДЕНТА.
//
// Dashboard показывает, ЧТО происходит с группой; этот экран — ПОЧЕМУ
// это происходит с конкретным студентом и что с этим делать. Вкладки,
// а не одна длинная страница (ТЗ, общий принцип):
//   Обзор | Диагностика | Анкета | Цели | Достижения | Зачёт | Progress | Заметки
//
// Производительность (ТЗ п.24): при открытии страницы грузится только
// Обзор (GET .../students/:id). Полные ответы анкеты и полная история
// диагностики подгружаются отдельными запросами, и только когда
// соответствующая вкладка открыта первый раз (см. useEffect на смену
// activeTab ниже) — не при монтировании страницы.

type TabId = "overview" | "diagnostic" | "questionnaire" | "goals" | "achievements" | "credit" | "progress" | "notes";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "diagnostic", label: "Диагностика" },
  { id: "questionnaire", label: "Анкета" },
  { id: "goals", label: "Цели" },
  { id: "achievements", label: "Достижения" },
  { id: "credit", label: "Зачёт" },
  { id: "progress", label: "Progress" },
  { id: "notes", label: "Заметки" },
];

const GAP_LABELS: Record<GapCategory, string> = {
  MATCHES: "Соответствует",
  SELF_HIGHER: "Самооценка выше результата",
  SELF_LOWER: "Самооценка ниже результата",
};

function formatScale(v: number | null): string {
  return v === null ? "—" : v.toFixed(1).replace(".", ",");
}
function formatPercent(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

export function TeacherStudentProfilePage() {
  const { groupId, studentId } = useParams<{ groupId: string; studentId: string }>();

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [noteModalOpen, setNoteModalOpen] = useState(false);

  const [questionnaire, setQuestionnaire] = useState<QuestionnaireTabResponse | null>(null);
  const [questionnaireLoading, setQuestionnaireLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<DiagnosticTabResponse | null>(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  useEffect(() => {
    if (!groupId || !studentId) return;
    setLoading(true);
    setNotFound(false);
    teacherStudentProfileApi
      .getOverview(groupId, studentId)
      .then(setOverview)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof ApiError ? err.message : "Не удалось загрузить профиль студента.");
      })
      .finally(() => setLoading(false));
  }, [groupId, studentId]);

  useEffect(() => {
    if (activeTab === "questionnaire" && !questionnaire && groupId && studentId) {
      setQuestionnaireLoading(true);
      teacherStudentProfileApi
        .getQuestionnaire(groupId, studentId)
        .then(setQuestionnaire)
        .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить анкету."))
        .finally(() => setQuestionnaireLoading(false));
    }
    if (activeTab === "diagnostic" && !diagnostic && groupId && studentId) {
      setDiagnosticLoading(true);
      teacherStudentProfileApi
        .getDiagnostic(groupId, studentId)
        .then(setDiagnostic)
        .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить диагностику."))
        .finally(() => setDiagnosticLoading(false));
    }
  }, [activeTab, groupId, studentId, questionnaire, diagnostic]);

  async function handleGoalStatusChange(goalCode: string, status: GoalStatus) {
    if (!groupId || !studentId || !overview) return;
    const updated = await teacherStudentProfileApi.setGoalStatus(groupId, studentId, goalCode, status);
    setOverview({
      ...overview,
      goals: {
        ...overview.goals,
        yearGoals: overview.goals.yearGoals.map((g) => (g.code === goalCode ? { ...g, status: updated.status, updatedAt: updated.updatedAt } : g)),
      },
    });
  }

  function handleNoteAdded(note: NoteEntry) {
    if (!overview) return;
    setOverview({ ...overview, notes: [note, ...overview.notes] });
  }

  if (notFound) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Студент не найден</h1>
        <Card>
          <p className="text-sm text-slate-600">Студент не найден в этой группе, или группа принадлежит другому преподавателю.</p>
          <Link to="/teacher" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            ← Вернуться на главную
          </Link>
        </Card>
      </div>
    );
  }

  if (loading || !overview) {
    return (
      <div>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
        <ErrorAlert>{error}</ErrorAlert>
      </div>
    );
  }

  return (
    <div>
      <ProfileHeader overview={overview} onAddNote={() => setNoteModalOpen(true)} />
      <ErrorAlert>{error}</ErrorAlert>
      <KpiRow kpi={overview.kpi} />
      <TabsNav active={activeTab} onChange={setActiveTab} />

      <div className="mt-4">
        {activeTab === "overview" && <OverviewTab overview={overview} />}
        {activeTab === "diagnostic" && <DiagnosticTab data={diagnostic} loading={diagnosticLoading} />}
        {activeTab === "questionnaire" && <QuestionnaireTab data={questionnaire} loading={questionnaireLoading} />}
        {activeTab === "goals" && <GoalsTab overview={overview} onStatusChange={handleGoalStatusChange} />}
        {activeTab === "achievements" && <AchievementsTab achievements={overview.achievements} />}
        {activeTab === "credit" && <CreditTab qualificationPoints={overview.kpi.qualificationPoints} />}
        {activeTab === "progress" && <ProgressTab progress={overview.progress} />}
        {activeTab === "notes" && groupId && studentId && (
          <NotesTab notes={overview.notes} groupId={groupId} studentId={studentId} onAdded={handleNoteAdded} />
        )}
      </div>

      {noteModalOpen && groupId && studentId && (
        <NoteModal fullName={overview.student.fullName} groupId={groupId} studentId={studentId} onAdded={handleNoteAdded} onClose={() => setNoteModalOpen(false)} />
      )}
    </div>
  );
}

// --- Header (ТЗ раздел 1) ------------------------------------------------

function diagnosticStatusLabel(status: string): string {
  if (status === "COMPLETED") return "Диагностика завершена";
  if (status === "IN_PROGRESS") return "Диагностика в процессе";
  return "Диагностика не начата";
}

function ProfileHeader({ overview, onAddNote }: { overview: OverviewResponse; onAddNote: () => void }) {
  const { student, header } = overview;
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/teacher/groups/${student.group.id}`} className="text-xs text-slate-400 hover:text-slate-600">
            ← Назад к группе
          </Link>
          <h1 className="mt-1 break-words text-2xl font-semibold text-slate-900">{student.fullName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {student.group.name}
            {student.specialty ? ` · ${student.specialty}` : ""}
            {student.course ? ` · ${student.course}` : ""}
            {student.academicYear ? ` · ${student.academicYear}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Badge tone={header.diagnosticStatus === "COMPLETED" ? "brand" : "slate"}>{diagnosticStatusLabel(header.diagnosticStatus)}</Badge>
            <Badge>{header.creditStatusLabel}</Badge>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <PrimaryButton type="button" onClick={onAddNote}>
              Добавить заметку
            </PrimaryButton>
            <button
              type="button"
              disabled
              title="Экспорт профиля (PDF/Excel/CSV) появится на одном из следующих этапов — backend для формирования файлов ещё не реализован."
              className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Экспорт (скоро)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- KPI (ТЗ раздел 2) ---------------------------------------------------

function KpiRow({ kpi }: { kpi: OverviewResponse["kpi"] }) {
  return (
    <Card className="mb-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KpiTile value={formatPercent(kpi.diagnosticPercentage)} caption="Диагностический результат" hint={kpi.diagnosticPercentage === null ? "Диагностика не пройдена" : undefined} />
        <KpiTile value={`${formatScale(kpi.selfAssessment)} / 5`} caption="Самооценка" />
        <KpiTile value={kpi.gapCategory ? GAP_LABELS[kpi.gapCategory] : "—"} caption="Разрыв" small />
        <KpiTile value={`${formatScale(kpi.motivation)} / 5`} caption="Мотивация" />
        <KpiTile value={`${formatScale(kpi.autonomy)} / 5`} caption="Самостоятельность" />
        <KpiTile
          value={`${kpi.qualificationPoints.points} / 5`}
          caption="Квалификационные баллы"
          hint={
            kpi.qualificationPoints.oralPartStatus === "EXEMPTED"
              ? "Требование выполнено — освобождён от устной части"
              : `До освобождения от устной части: ${kpi.qualificationPoints.pointsUntilExemption}`
          }
        />
        <KpiTile value="Не реализовано" muted caption="Статус зачёта" small />
      </div>
    </Card>
  );
}

function KpiTile({ value, caption, hint, muted, small }: { value: string; caption: string; hint?: string; muted?: boolean; small?: boolean }) {
  const isLongText = small || value.length > 6;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-center">
      <div className={`break-words font-semibold ${isLongText ? "text-xs" : "text-xl"} ${muted ? "text-slate-400" : "text-slate-900"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{caption}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

// --- Вкладки: навигация (горизонтальный скролл на мобильном, ТЗ п.23) --

function TabsNav({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              active === t.id ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Обзор (ТЗ разделы 3-5, 10-12) ---------------------------------------

function OverviewTab({ overview }: { overview: OverviewResponse }) {
  const { overview: o, selfAssessmentDetail, motivationAndLearning } = overview;

  if (!o.available) {
    return (
      <Card>
        <EmptyState title="Педагогический обзор появится после завершения анкетирования." hint="Пока студент не завершил Start Profile, сильные стороны, зоны развития и рекомендации посчитать нечем." />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Сильные стороны</h3>
          {o.strengths.length === 0 ? (
            <EmptyState title="Пока не выделено выраженных сильных сторон." />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {o.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Зоны развития</h3>
          {o.weaknesses.length === 0 ? (
            <EmptyState title="Выраженных зон развития не отмечено." />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {o.weaknesses.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Потенциал</h3>
        {o.potentialBadges.length === 0 ? (
          <p className="text-sm text-slate-500">Оснований для меток потенциала пока нет.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {o.potentialBadges.map((b) => (
              <Badge key={b} tone="brand">
                {b}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <RecommendationsCard recommendations={o.recommendations} />

      {selfAssessmentDetail && <SelfAssessmentCard rows={selfAssessmentDetail} />}
      {motivationAndLearning && <MotivationCard data={motivationAndLearning} />}
    </div>
  );
}

function RecommendationsCard({ recommendations }: { recommendations: OverviewResponse["overview"]["recommendations"] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Рекомендуемый фокус</h3>
      <p className="mb-4 text-xs text-slate-400">Рекомендации основаны на сохранённых данных — преподаватель решает, что делать дальше.</p>
      {recommendations.length === 0 ? (
        <EmptyState title="Пока нет однозначных оснований для рекомендаций." />
      ) : (
        <ol className="space-y-3">
          {recommendations.map((r, i) => (
            <li key={i} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-slate-900">
                  {i + 1}. {r.label}
                </span>
                <button type="button" onClick={() => setOpenIndex(openIndex === i ? null : i)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                  {openIndex === i ? "Скрыть «Почему?»" : "Почему? →"}
                </button>
              </div>
              {openIndex === i && (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                  {r.reasonLines.map((line, j) => (
                    <div key={j}>{line}</div>
                  ))}
                  <div className="mt-1 text-slate-400">Источник: {r.source}</div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function SelfAssessmentCard({ rows }: { rows: OverviewResponse["selfAssessmentDetail"] }) {
  if (!rows) return null;
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Как студент оценивает себя</h3>
      <p className="mb-4 text-xs text-slate-400">Сравнение с объективным результатом — только там, где Start Diagnostic вообще проверяет этот навык.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Навык</th>
              <th className="py-2 pr-3">Самооценка</th>
              <th className="py-2 pr-3">Объективный результат</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.skill}>
                <td className="py-2 pr-3 font-medium text-slate-800">{r.skill}</td>
                <td className="py-2 pr-3">{r.selfAssessment !== null ? `${r.selfAssessment} / 5` : "—"}</td>
                <td className="py-2 pr-3">{r.hasObjectiveComparison ? formatPercent(r.objectivePercentage) : <span className="text-slate-400">Не оценивается диагностикой</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MotivationCard({ data }: { data: NonNullable<OverviewResponse["motivationAndLearning"]> }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Мотивация и обучение</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-400">Мотивация</dt>
          <dd className="text-sm text-slate-800">{formatScale(data.motivation)} / 5</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Самостоятельность</dt>
          <dd className="text-sm text-slate-800">{formatScale(data.autonomy)} / 5</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Готовность работать над целью</dt>
          <dd className="text-sm text-slate-800">{data.willingnessToWork !== null ? `${data.willingnessToWork} / 5` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Предпочитаемые способы обучения</dt>
          <dd className="text-sm text-slate-800">{data.preferredMethods.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Основные барьеры</dt>
          <dd className="text-sm text-slate-800">{data.barriers.join(", ") || "Не отмечено"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Необходимая поддержка</dt>
          <dd className="text-sm text-slate-800">{data.neededSupport.join(", ") || "—"}</dd>
        </div>
      </dl>
    </Card>
  );
}

// --- Диагностика (ТЗ разделы 6-8) ----------------------------------------

function DiagnosticTab({ data, loading }: { data: DiagnosticTabResponse | null; loading: boolean }) {
  if (loading || !data) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Загрузка…</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">История диагностики</h3>
        {data.history.length === 0 ? (
          <EmptyState title="Пока нет результатов." />
        ) : (
          <div className="space-y-3">
            {data.history.map((h) => (
              <div key={h.kind} className="rounded-lg border border-slate-100 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-900">{h.label}</span>
                  {h.status === "COMPLETED" && h.completedAt && <span className="text-xs text-slate-400">{new Date(h.completedAt).toLocaleDateString("ru-RU")}</span>}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {h.status === "COMPLETED" ? `Результат: ${h.overallPercentage}%` : h.status === "IN_PROGRESS" ? "В процессе" : "Не начата"}
                </div>
                {h.status === "COMPLETED" && (
                  <p className="mt-1 text-xs text-slate-400">Не официальный экзамен, без CEFR-уровня без утверждённой матрицы порогов.</p>
                )}
              </div>
            ))}
          </div>
        )}
        {(["PROGRESS", "CREDIT"] as const)
          .filter((kind) => !data.history.some((h) => h.kind === kind))
          .map((kind) => (
            <p key={kind} className="mt-2 text-xs text-slate-400">
              {kind === "PROGRESS" ? "Progress Check" : "Final Diagnostic"}: пока нет результатов.
            </p>
          ))}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Таблица навыков</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Навык</th>
                <th className="py-2 pr-3">Старт</th>
                <th className="py-2 pr-3">Промежуточный</th>
                <th className="py-2 pr-3">Итоговый</th>
                <th className="py-2 pr-3">Изменение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.skillTable.map((row) => (
                <tr key={row.skill}>
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.label}</td>
                  {row.assessed ? (
                    <>
                      <td className="py-2 pr-3">{formatPercent(row.start)}</td>
                      <td className="py-2 pr-3">{formatPercent(row.progress)}</td>
                      <td className="py-2 pr-3">{formatPercent(row.final)}</td>
                      <td className="py-2 pr-3">{row.changePoints !== null ? `${row.changePoints > 0 ? "+" : ""}${row.changePoints} п.п.` : "—"}</td>
                    </>
                  ) : (
                    <td className="py-2 pr-3 text-slate-400" colSpan={4}>
                      Не оценивался
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.hasChangeSummary && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Что изменилось?</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            {data.skillTable
              .filter((r) => r.assessed && r.changePoints !== null)
              .map((r) => (
                <li key={r.skill}>
                  {r.label}: {formatPercent(r.start)} → {formatPercent(r.final ?? r.progress)} ({r.changePoints! > 0 ? "+" : ""}
                  {r.changePoints} п.п.)
                </li>
              ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// --- Анкета (ТЗ раздел 9) -------------------------------------------------

function QuestionnaireTab({ data, loading }: { data: QuestionnaireTabResponse | null; loading: boolean }) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  if (loading || !data) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Загрузка…</p>
      </Card>
    );
  }
  if (data.status !== "COMPLETED") {
    return (
      <Card>
        <EmptyState title="Анкетирование ещё не завершено." />
      </Card>
    );
  }

  return (
    <Card>
      <div className="divide-y divide-slate-100">
        {data.sections.map((s) => (
          <div key={s.id} className="py-2">
            <button
              type="button"
              onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
              className="flex w-full items-center justify-between py-2 text-left text-sm font-medium text-slate-800"
            >
              <span>{s.title}</span>
              <span className="text-slate-400">{openSection === s.id ? "−" : "+"}</span>
            </button>
            {openSection === s.id && (
              <ul className="space-y-3 pb-3 pl-1">
                {s.items.map((item, i) => (
                  <li key={i} className="text-sm">
                    <div className="text-slate-500">{item.question}</div>
                    <div className="text-slate-900">{item.answer}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// --- Цели (ТЗ разделы 13-14) ----------------------------------------------

const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  NOT_STARTED: "Не начата",
  IN_PROGRESS: "В процессе",
  DONE: "Выполнена",
  NOT_ACHIEVED: "Не реализована",
};

function GoalsTab({ overview, onStatusChange }: { overview: OverviewResponse; onStatusChange: (code: string, status: GoalStatus) => Promise<void> }) {
  const { goals } = overview;
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Главная цель</h3>
        <p className="text-sm text-slate-800">{goals.mainGoal ?? "Анкетирование ещё не завершено."}</p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Цели на учебный год</h3>
        {goals.yearGoals.length === 0 ? (
          <EmptyState title="Цели пока не выбраны." />
        ) : (
          <ul className="space-y-3">
            {goals.yearGoals.map((g) => (
              <li key={g.code} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <span className="text-sm text-slate-800">{g.label}</span>
                <Select
                  value={g.status}
                  onChange={(e) => onStatusChange(g.code, e.target.value as GoalStatus)}
                  className="w-auto"
                >
                  {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {GOAL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Готовность работать</h3>
          <p className="text-sm text-slate-800">{goals.willingnessToWork !== null ? `${goals.willingnessToWork} / 5` : "—"}</p>
        </Card>
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Планируемые действия</h3>
          {goals.plannedActions.length === 0 ? (
            <p className="text-sm text-slate-500">—</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800">
              {goals.plannedActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// --- Достижения (Этап 8) — портфолио и квалификационные баллы, разные
// понятия (ТЗ п.20): портфолио включает ЛЮБОЕ подтверждённое
// достижение (с баллом или без), результативные — только те, что дали
// балл. Полная проверка/решения — на отдельной странице «Проверка
// достижений» (переход по ссылке), не дублируется здесь. -----------------

function AchievementsTab({ achievements }: { achievements: OverviewResponse["achievements"] }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="text-2xl font-semibold text-slate-900">{achievements.portfolioCount}</div>
          <div className="mt-1 text-xs text-slate-500">Достижения (портфолио)</div>
        </Card>
        <Card>
          <div className="text-2xl font-semibold text-slate-900">{achievements.resultfulCount}</div>
          <div className="mt-1 text-xs text-slate-500">Результативные достижения</div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Список достижений</h3>
        {achievements.list.length === 0 ? (
          <EmptyState title="Пока нет достижений." hint="Студент ещё не отправлял подтверждённые результаты внеаудиторной активности." />
        ) : (
          <ul className="space-y-2">
            {achievements.list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                <div className="min-w-0 flex-1 break-words">
                  <div className="text-sm font-medium text-slate-900">{a.eventName}</div>
                  <div className="text-xs text-slate-500">
                    {new Date(a.eventDate).toLocaleDateString("ru-RU")} · {CLAIMED_RESULT_LABELS_RU[a.claimedResult]}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={ACHIEVEMENT_STATUS_TONE[a.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[a.status]}</Badge>
                  {a.qualificationPoint === 1 && <span className="text-xs font-medium text-brand-700">+1</span>}
                  <Link to={`/teacher/achievements/${a.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                    Открыть
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CreditTab({ qualificationPoints }: { qualificationPoints: OverviewResponse["kpi"]["qualificationPoints"] }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Мой зачёт</h3>
      <ul className="space-y-2 text-sm">
        <li className="text-slate-500">Допуск (активный словарь) — не реализовано</li>
        <li className="text-slate-500">Лексико-грамматический тест — не реализовано</li>
        <li>
          Квалификационные баллы — <span className="font-medium">{qualificationPoints.points} / 5</span>
        </li>
        <li>
          Устная часть —{" "}
          <span className="font-medium">{qualificationPoints.oralPartStatus === "EXEMPTED" ? "Освобождён" : "Обязательна"}</span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-slate-400">Допуск по словарю и лексико-грамматический тест появятся на одном из следующих этапов.</p>
    </Card>
  );
}

// --- Progress (ТЗ разделы 18-19) ------------------------------------------

function ProgressTab({ progress }: { progress: OverviewResponse["progress"] }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">START → NOW</h3>
      <EmptyState
        title="Промежуточная диагностика ещё не проводилась."
        hint={`Рекомендуемый срок: через ${progress.recommendedAfterMonths[0]}–${progress.recommendedAfterMonths[1]} месяцев после стартовой диагностики.`}
      />
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          disabled
          title="Модуль Progress Check ещё не реализован — назначение промежуточной диагностики появится на одном из следующих этапов."
          className="inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
        >
          Назначить диагностику
        </button>
      </div>
      <div className="mt-6 border-t border-slate-100 pt-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Внеаудиторная активность</h4>
        <p className="text-sm text-slate-800">{progress.extracurricularActivity.resultfulCount} результативных мероприятий</p>
        <p className="mt-1 text-xs text-slate-400">
          Динамика «Старт → Progress Check» появится вместе с модулем Progress Check — сейчас показано только текущее
          состояние, без выдуманной точки отсчёта. Это отдельный показатель образовательной активности, а не языкового уровня.
        </p>
      </div>
    </Card>
  );
}

// --- Заметки (ТЗ раздел 20) ------------------------------------------------

function NotesTab({ notes, groupId, studentId, onAdded }: { notes: NoteEntry[]; groupId: string; studentId: string; onAdded: (n: NoteEntry) => void }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">История заметок</h3>
        {notes.length === 0 ? (
          <EmptyState title="Заметок пока нет." />
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <Badge>{noteTypeLabel(n.noteType)}</Badge>
                  <span className="text-xs text-slate-400">{new Date(n.createdAt).toLocaleString("ru-RU")}</span>
                </div>
                <div className="text-slate-800">{n.text}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Новая заметка</h3>
        <TeacherNoteForm groupId={groupId} studentId={studentId} onAdded={onAdded} />
      </Card>
    </div>
  );
}

// --- Модалка быстрого добавления заметки (из шапки) ------------------------

function NoteModal({ fullName, groupId, studentId, onAdded, onClose }: { fullName: string; groupId: string; studentId: string; onAdded: (n: NoteEntry) => void; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h4 className="text-sm font-semibold text-slate-800">Заметка о студенте — {fullName}</h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Закрыть">
            ✕
          </button>
        </div>
        {saved ? (
          <p className="text-sm text-brand-700">Заметка сохранена.</p>
        ) : (
          <TeacherNoteForm
            groupId={groupId}
            studentId={studentId}
            onAdded={(n) => {
              onAdded(n);
              setSaved(true);
            }}
          />
        )}
        <PrimaryButton type="button" className="mt-4 w-full" onClick={onClose}>
          Закрыть
        </PrimaryButton>
      </div>
    </div>
  );
}
