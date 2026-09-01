import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { workspaceApi, type AcademicYear, type Course, type Group } from "../../api/workspace";
import {
  teacherDashboardApi,
  type AttentionEntry,
  type DashboardResponse,
  type DashboardStudentRow,
  type GapCategory,
} from "../../api/teacherDashboard";
import { TeacherNoteForm } from "../../components/TeacherNoteForm";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, PrimaryButton, Select, SecondaryButton } from "../../components/ui";

// English Start Profile — Этап 6: TEACHER DASHBOARD (главная страница
// преподавателя).
//
// Ключевой принцип ТЗ: первый экран отвечает ровно на 4 вопроса —
// (1) что с группой (KPI), (2) кому нужно внимание, (3) кого можно
// развивать дальше, (4) что с зачётом/прогрессом. Всё остальное — в
// профиле студента, а не здесь (см. StudentProfilePage.tsx).
//
// Ни один показатель не считается на фронтенде — все агрегаты приходят
// готовыми из GET /api/teacher/groups/:id/dashboard (backend/src/routes/
// teacherDashboard.ts), который сам решает, что честно показать, а что
// оставить как "не реализовано" (Квалификационные баллы/Зачёт — эти
// модули ещё не построены).

const GAP_LABELS: Record<GapCategory, string> = {
  MATCHES: "Совпадает",
  SELF_HIGHER: "Самооценка выше",
  SELF_LOWER: "Самооценка ниже",
};

function formatScale(v: number | null): string {
  return v === null ? "—" : v.toFixed(1).replace(".", ",");
}

function formatPercent(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

export function TeacherHome() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectorsLoading, setSelectorsLoading] = useState(true);
  const [selectorsError, setSelectorsError] = useState<string | null>(null);

  const [yearId, setYearId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [groupId, setGroupId] = useState("");

  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Загружаем структуру (годы/курсы/группы) один раз — переключение
  // селекторов ниже работает по уже загрученным спискам, без повторных
  // запросов; повторно запрашивается только сам Dashboard выбранной
  // группы (ТЗ п.19 — не тянуть лишнее при каждом переключении).
  useEffect(() => {
    Promise.all([workspaceApi.listAcademicYears(), workspaceApi.listCourses(), workspaceApi.listGroups({ status: "ACTIVE" })])
      .then(([y, c, g]) => {
        setYears(y);
        setCourses(c);
        setGroups(g);
        const firstYear = y[0]?.id ?? "";
        const firstCourse = c.find((x) => x.academicYearId === firstYear)?.id ?? c[0]?.id ?? "";
        const firstGroup = g.find((x) => x.courseId === firstCourse)?.id ?? g[0]?.id ?? "";
        setYearId(firstYear);
        setCourseId(firstCourse);
        setGroupId(firstGroup);
      })
      .catch((err) => setSelectorsError(err instanceof ApiError ? err.message : "Не удалось загрузить список групп."))
      .finally(() => setSelectorsLoading(false));
  }, []);

  const coursesForYear = useMemo(() => courses.filter((c) => c.academicYearId === yearId), [courses, yearId]);
  const groupsForCourse = useMemo(() => groups.filter((g) => g.courseId === courseId), [groups, courseId]);
  const selectedGroupMeta = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);

  function handleYearChange(id: string) {
    setYearId(id);
    const nextCourse = courses.find((c) => c.academicYearId === id)?.id ?? "";
    setCourseId(nextCourse);
    const nextGroup = groups.find((g) => g.courseId === nextCourse)?.id ?? "";
    setGroupId(nextGroup);
  }

  function handleCourseChange(id: string) {
    setCourseId(id);
    const nextGroup = groups.find((g) => g.courseId === id)?.id ?? "";
    setGroupId(nextGroup);
  }

  // Смена группы пересчитывает ВСЕ показатели Dashboard заново — не
  // переиспользуем предыдущий результат ни при загрузке, ни при ошибке,
  // чтобы старые цифры от прошлой группы не «зависли» на экране.
  useEffect(() => {
    if (!groupId) {
      setDashboard(null);
      return;
    }
    setDashboardLoading(true);
    setDashboardError(null);
    teacherDashboardApi
      .getDashboard(groupId)
      .then(setDashboard)
      .catch((err) => {
        setDashboard(null);
        setDashboardError(err instanceof ApiError ? err.message : "Не удалось загрузить панель группы.");
      })
      .finally(() => setDashboardLoading(false));
  }, [groupId]);

  if (selectorsLoading) {
    return (
      <div>
        <PageTitle>Главная</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div>
        <PageTitle>Главная</PageTitle>
        <Card>
          <EmptyState
            title="Пока нет ни одной активной группы"
            hint={
              <>
                Создайте учебный год, курс и группу, чтобы увидеть панель преподавателя.{" "}
                <Link to="/teacher/groups" className="text-brand-600 hover:underline">
                  Перейти к группам
                </Link>
                .
              </>
            }
          />
        </Card>
        <ErrorAlert>{selectorsError}</ErrorAlert>
      </div>
    );
  }

  return (
    <div>
      <PageTitle>Главная</PageTitle>
      <ErrorAlert>{selectorsError}</ErrorAlert>

      {/* Селекторы Учебный год / Курс / Группа — каскадные (ТЗ п.1) */}
      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Учебный год</label>
            <Select value={yearId} onChange={(e) => handleYearChange(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Курс</label>
            <Select value={courseId} onChange={(e) => handleCourseChange(e.target.value)} disabled={coursesForYear.length === 0}>
              {coursesForYear.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Группа</label>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={groupsForCourse.length === 0}>
              {groupsForCourse.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {groupsForCourse.length === 0 && (
          <p className="mt-3 text-xs text-slate-400">В выбранном курсе пока нет активных групп.</p>
        )}
      </Card>

      <ErrorAlert>{dashboardError}</ErrorAlert>

      {dashboardLoading && (
        <Card>
          <p className="text-sm text-slate-500">Загрузка панели…</p>
        </Card>
      )}

      {!dashboardLoading && dashboard && (
        <DashboardView dashboard={dashboard} joinCode={selectedGroupMeta?.joinCode?.code ?? null} />
      )}
    </div>
  );
}

function DashboardView({ dashboard, joinCode }: { dashboard: DashboardResponse; joinCode: string | null }) {
  return (
    <div className="space-y-6">
      {/* Заголовок — курс, учебный год, группа, число студентов, статус
          диагностики (ТЗ п.1) */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {dashboard.group.name}
          {dashboard.group.specialty ? ` · ${dashboard.group.specialty}` : ""}
        </h2>
        <p className="text-sm text-slate-500">
          {dashboard.group.course.name} · {dashboard.group.academicYear.name} · {dashboard.studentCount}{" "}
          {studentsWord(dashboard.studentCount)} · Диагностика завершена: {dashboard.kpi.diagnosticCompletion.completed} из{" "}
          {dashboard.kpi.diagnosticCompletion.total}
        </p>
      </div>

      {dashboard.studentCount === 0 ? (
        <Card>
          <EmptyState
            title="В группе пока нет студентов."
            hint={
              joinCode ? (
                <CopyCodeHint code={joinCode} />
              ) : (
                "Код подключения группы деактивирован — включите его на странице группы."
              )
            }
          />
        </Card>
      ) : (
        <>
          <KpiGrid dashboard={dashboard} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <AttentionBlock entries={dashboard.attention} groupId={dashboard.group.id} />
            <OpportunityBlock entries={dashboard.opportunities} groupId={dashboard.group.id} />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ProgressBlock progress={dashboard.progress} />
            <CreditProgressBlock credit={dashboard.credit} pendingReview={dashboard.achievementsPendingReview} />
          </div>
          <StudentsTable dashboard={dashboard} />
        </>
      )}
    </div>
  );
}

function studentsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "студентов";
  if (mod10 === 1) return "студент";
  if (mod10 >= 2 && mod10 <= 4) return "студента";
  return "студентов";
}

function CopyCodeHint({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      <span>Поделитесь кодом подключения, чтобы студенты присоединились к группе.</span>
      <SecondaryButton
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            /* буфер обмена недоступен — код виден в заголовке кнопки ниже */
          }
        }}
      >
        {copied ? "Скопировано ✓" : `Скопировать код ${code}`}
      </SecondaryButton>
    </div>
  );
}

// --- KPI: «Состояние группы» — ровно 6 плиток (ТЗ п.3) -----------------

function KpiGrid({ dashboard }: { dashboard: DashboardResponse }) {
  const { kpi } = dashboard;
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Состояние группы</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          value={`${kpi.diagnosticCompletion.completed} / ${kpi.diagnosticCompletion.total}`}
          caption="Диагностика завершена"
        />
        <KpiTile
          value={formatPercent(kpi.avgDiagnosticPercentage)}
          caption="Средний диагностический результат группы"
          hint={kpi.avgDiagnosticPercentage === null ? "Ещё никто не завершил диагностику" : undefined}
        />
        <KpiTile value={`${formatScale(kpi.avgMotivation)} / 5`} caption="Средняя мотивация" />
        <KpiTile value={`${formatScale(kpi.avgAutonomy)} / 5`} caption="Средняя самостоятельность" />
        <KpiTile
          value={String(kpi.qualificationPoints.total)}
          caption="Всего подтверждено в группе"
          hint={kpi.qualificationPoints.studentsWithFivePlus > 0 ? `${kpi.qualificationPoints.studentsWithFivePlus} ${studentsWord(kpi.qualificationPoints.studentsWithFivePlus)} уже имеют 5+ баллов` : undefined}
        />
        {/* "Готовы к зачёту" целиком — по-прежнему честно не реализовано:
            помимо баллов нужны ещё допуск по словарю и лексико-
            грамматический тест, которых нет ни на одном из этапов. */}
        <KpiTile value="Не реализовано" muted caption="Готовы к зачёту" />
      </div>
    </Card>
  );
}

function KpiTile({ value, caption, hint, muted }: { value: string; caption: string; hint?: string; muted?: boolean }) {
  // Длинный текст ("Не реализовано" вместо числа) в крупном кегле не
  // помещается в узкую плитку при 6 колонках и накладывается на
  // соседнюю — используем меньший кегль для нечисловых значений.
  const isLongText = value.length > 6;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-center">
      <div className={`font-semibold ${isLongText ? "text-sm" : "text-xl"} ${muted ? "text-slate-400" : "text-slate-900"}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{caption}</div>
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

// --- «Требуют внимания» (ТЗ п.5-7) -------------------------------------

function AttentionBlock({ entries, groupId }: { entries: AttentionEntry[]; groupId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Требуют внимания</h3>
      <p className="mb-4 text-xs text-slate-400">
        Студенты, у которых сочетание нескольких показателей указывает на зону развития — это не диагноз, а
        педагогическая навигация.
      </p>
      {entries.length === 0 ? (
        <EmptyState title="Сейчас никому не требуется особое внимание." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.studentId} className="rounded-lg border border-slate-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <div className="min-w-0 flex-1 break-words">
                  <div className="text-sm font-medium text-slate-900">{e.fullName}</div>
                  <div className="text-sm text-slate-600">{e.primaryReason}</div>
                  <div className="text-xs text-slate-400">{e.keyMetricLabel}</div>
                </div>
                <Link to={`/teacher/groups/${groupId}/students/${e.studentId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                  Открыть профиль
                </Link>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(openId === e.studentId ? null : e.studentId)}
                className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                {openId === e.studentId ? "Скрыть «Почему?»" : "Почему? →"}
              </button>
              {openId === e.studentId && (
                <ul className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                  {e.factors.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <div className="font-medium text-slate-700">{f.label}</div>
                      {f.dataLines.map((line, j) => (
                        <div key={j} className="text-slate-500">
                          {line}
                        </div>
                      ))}
                      <div className="text-slate-400">Источник: {f.source}</div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- «Возможности развития» (ТЗ п.8-9) ---------------------------------

function OpportunityBlock({ entries, groupId }: { entries: { studentId: string; fullName: string; potentialLabel: string; reasonText: string }[]; groupId: string }) {
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Возможности развития</h3>
      <p className="mb-4 text-xs text-slate-400">
        Система только показывает возможность — решение о конкретном действии остаётся за преподавателем.
      </p>
      {entries.length === 0 ? (
        <EmptyState title="Сейчас нет студентов с выраженным потенциалом для развития." />
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.studentId} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 rounded-lg border border-slate-100 p-3">
              <div className="min-w-0 flex-1 break-words">
                <div className="text-sm font-medium text-slate-900">{e.fullName}</div>
                <Badge tone="brand">{e.potentialLabel}</Badge>
                <div className="mt-1 text-xs text-slate-500">{e.reasonText}</div>
              </div>
              <Link to={`/teacher/groups/${groupId}/students/${e.studentId}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                Открыть профиль
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- «Прогресс» (Progress Check) — честное пустое состояние (ТЗ п.10) --

function ProgressBlock({ progress }: { progress: DashboardResponse["progress"] }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Прогресс</h3>
      <EmptyState
        title="Промежуточная диагностика ещё не проводилась."
        hint={`Рекомендуемый срок: через ${progress.recommendedAfterMonths[0]}–${progress.recommendedAfterMonths[1]} месяцев после стартовой диагностики.`}
      />
    </Card>
  );
}

// --- «Прогресс по зачёту» — модуль ещё не реализован (ТЗ п.11) --------

function CreditProgressBlock({ credit, pendingReview }: { credit: DashboardResponse["credit"]; pendingReview: number }) {
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Прогресс по зачёту</h3>
      <ul className="space-y-2 text-sm text-slate-700">
        <li className="text-slate-500">Активный словарь — не реализовано</li>
        <li className="text-slate-500">Лексико-грамматический тест — не реализовано</li>
        <li>
          Квалификационные баллы — <span className="font-medium">{credit.qualificationPoints.total}</span>
          {credit.qualificationPoints.studentsWithFivePlus > 0 && (
            <span className="text-slate-500"> ({credit.qualificationPoints.studentsWithFivePlus} {studentsWord(credit.qualificationPoints.studentsWithFivePlus)} с 5+ баллами)</span>
          )}
        </li>
        <li>
          Устная часть — <span className="font-medium">{credit.oralPart.exemptedCount}</span> освобождены, <span className="font-medium">{credit.oralPart.requiredCount}</span> обязательна
        </li>
      </ul>
      {pendingReview > 0 && (
        <Link to="/teacher/achievements" className="mt-3 block text-xs font-medium text-brand-600 hover:underline">
          {pendingReview} {achievementsWord(pendingReview)} на проверке →
        </Link>
      )}
      <p className="mt-3 text-xs text-slate-400">Допуск по словарю и лексико-грамматический тест появятся на одном из следующих этапов.</p>
    </Card>
  );
}

function achievementsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "достижений";
  if (mod10 === 1) return "достижение";
  if (mod10 >= 2 && mod10 <= 4) return "достижения";
  return "достижений";
}

// --- Таблица студентов (ТЗ п.12-15) ------------------------------------

type SortKey = "name" | "diagnostic" | "motivation" | "autonomy";

function StudentsTable({ dashboard }: { dashboard: DashboardResponse }) {
  const [search, setSearch] = useState("");
  const [diagnosticFilter, setDiagnosticFilter] = useState("");
  const [developmentAreaFilter, setDevelopmentAreaFilter] = useState("");
  const [potentialFilter, setPotentialFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [noteFor, setNoteFor] = useState<DashboardStudentRow | null>(null);

  const developmentAreas = useMemo(
    () => Array.from(new Set(dashboard.students.map((s) => s.developmentArea).filter((v): v is string => !!v))),
    [dashboard.students]
  );
  const potentials = useMemo(
    () => Array.from(new Set(dashboard.students.map((s) => s.potentialLabel).filter((v): v is string => !!v))),
    [dashboard.students]
  );

  function resetFilters() {
    setSearch("");
    setDiagnosticFilter("");
    setDevelopmentAreaFilter("");
    setPotentialFilter("");
    setStatusFilter("");
  }

  const filtered = useMemo(() => {
    return dashboard.students.filter((s) => {
      if (search && !s.fullName.toLowerCase().includes(search.toLowerCase())) return false;
      if (diagnosticFilter && diagnosticBand(s.diagnosticPercentage) !== diagnosticFilter) return false;
      if (developmentAreaFilter && s.developmentArea !== developmentAreaFilter) return false;
      if (potentialFilter && s.potentialLabel !== potentialFilter) return false;
      if (statusFilter && s.diagnosticStatus !== statusFilter) return false;
      return true;
    });
  }, [dashboard.students, search, diagnosticFilter, developmentAreaFilter, potentialFilter, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      switch (sortKey) {
        case "diagnostic":
          return (b.diagnosticPercentage ?? -1) - (a.diagnosticPercentage ?? -1);
        case "motivation":
          return (b.motivation ?? -1) - (a.motivation ?? -1);
        case "autonomy":
          return (b.autonomy ?? -1) - (a.autonomy ?? -1);
        default:
          return a.fullName.localeCompare(b.fullName, "ru");
      }
    });
    return copy;
  }, [filtered, sortKey]);

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-700">Студенты группы</h3>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Поиск по имени</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ФИО студента"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Диагностический диапазон</label>
          <Select value={diagnosticFilter} onChange={(e) => setDiagnosticFilter(e.target.value)}>
            <option value="">Все</option>
            <option value="none">Не пройдена</option>
            <option value="low">До 50%</option>
            <option value="mid">50–79%</option>
            <option value="high">80% и выше</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Статус диагностики</label>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Все</option>
            <option value="COMPLETED">Завершена</option>
            <option value="IN_PROGRESS">В процессе</option>
            <option value="NOT_STARTED">Не начата</option>
          </Select>
        </div>
        {developmentAreas.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Зона развития</label>
            <Select value={developmentAreaFilter} onChange={(e) => setDevelopmentAreaFilter(e.target.value)}>
              <option value="">Все</option>
              {developmentAreas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </div>
        )}
        {potentials.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Потенциал</label>
            <Select value={potentialFilter} onChange={(e) => setPotentialFilter(e.target.value)}>
              <option value="">Все</option>
              {potentials.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Сортировка</label>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="name">По имени</option>
            <option value="diagnostic">По диагностическому результату</option>
            <option value="motivation">По мотивации</option>
            <option value="autonomy">По самостоятельности</option>
          </Select>
        </div>
        <SecondaryButton type="button" onClick={resetFilters}>
          Сбросить фильтры
        </SecondaryButton>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="По заданным фильтрам студентов не найдено." />
      ) : (
        <>
          {/* Десктоп — таблица; широкая таблица скроллится в своём
              контейнере, а не всей страницей (см. системные требования
              к артефактам/страницам про overflow-x). */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Студент</th>
                  <th className="py-2 pr-3">Диагностика</th>
                  <th className="py-2 pr-3">Самооценка</th>
                  <th className="py-2 pr-3">Разрыв</th>
                  <th className="py-2 pr-3">Мотивация</th>
                  <th className="py-2 pr-3">Самост-ть</th>
                  <th className="py-2 pr-3">Зона развития</th>
                  <th className="py-2 pr-3">Потенциал</th>
                  <th className="py-2 pr-3">Баллы</th>
                  <th className="py-2 pr-3">Зачёт</th>
                  <th className="py-2 pr-3">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((s) => (
                  <tr key={s.studentId}>
                    <td className="py-2 pr-3 font-medium text-slate-800">{s.fullName}</td>
                    <td className="py-2 pr-3">{s.diagnosticStatus === "COMPLETED" ? formatPercent(s.diagnosticPercentage) : statusLabel(s.diagnosticStatus)}</td>
                    <td className="py-2 pr-3">{formatScale(s.selfAssessment)}</td>
                    <td className="py-2 pr-3">{s.gapCategory ? GAP_LABELS[s.gapCategory] : "—"}</td>
                    <td className="py-2 pr-3">{formatScale(s.motivation)}</td>
                    <td className="py-2 pr-3">{formatScale(s.autonomy)}</td>
                    <td className="py-2 pr-3">{s.developmentArea ?? "—"}</td>
                    <td className="py-2 pr-3">{s.potentialLabel ?? "—"}</td>
                    <td className="py-2 pr-3">{s.qualificationPoints}</td>
                    <td className="py-2 pr-3">{creditStatusLabel(s.creditStatus)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <Link to={`/teacher/groups/${dashboard.group.id}/students/${s.studentId}`} className="text-xs font-medium text-brand-600 hover:underline">
                          Профиль
                        </Link>
                        <button type="button" onClick={() => setNoteFor(s)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                          + Заметка
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Мобильная версия — карточки вместо таблицы (ТЗ п.17) */}
          <div className="space-y-3 md:hidden">
            {sorted.map((s) => (
              <div key={s.studentId} className="rounded-lg border border-slate-100 p-3">
                <div className="break-words text-sm font-medium text-slate-900">{s.fullName}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                  <dt className="text-slate-400">Диагностика</dt>
                  <dd>{s.diagnosticStatus === "COMPLETED" ? formatPercent(s.diagnosticPercentage) : statusLabel(s.diagnosticStatus)}</dd>
                  <dt className="text-slate-400">Мотивация</dt>
                  <dd>{formatScale(s.motivation)}</dd>
                  <dt className="text-slate-400">Зона развития</dt>
                  <dd>{s.developmentArea ?? "—"}</dd>
                  <dt className="text-slate-400">Баллы</dt>
                  <dd>{s.qualificationPoints}</dd>
                  <dt className="text-slate-400">Зачёт</dt>
                  <dd>{creditStatusLabel(s.creditStatus)}</dd>
                </dl>
                <div className="mt-3 flex gap-3">
                  <Link to={`/teacher/groups/${dashboard.group.id}/students/${s.studentId}`} className="text-xs font-medium text-brand-600 hover:underline">
                    Открыть профиль
                  </Link>
                  <button type="button" onClick={() => setNoteFor(s)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                    + Заметка
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {noteFor && (
        <NoteModal groupId={dashboard.group.id} student={noteFor} onClose={() => setNoteFor(null)} />
      )}
    </Card>
  );
}

function diagnosticBand(percentage: number | null): string {
  if (percentage === null) return "none";
  if (percentage < 50) return "low";
  if (percentage < 80) return "mid";
  return "high";
}

function statusLabel(status: DashboardStudentRow["diagnosticStatus"]): string {
  if (status === "IN_PROGRESS") return "В процессе";
  if (status === "COMPLETED") return "Завершена";
  return "Не начата";
}

function creditStatusLabel(status: DashboardStudentRow["creditStatus"]): string {
  // Только статус устной части (Этап 8) — полный статус зачёта не
  // реализован (см. комментарий у KpiGrid/CreditProgressBlock выше).
  return status === "EXEMPTED" ? "Устная часть: освобождён" : "Устная часть: требуется";
}

function NoteModal({ groupId, student, onClose }: { groupId: string; student: DashboardStudentRow; onClose: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between">
          <h4 className="text-sm font-semibold text-slate-800">Заметка о студенте — {student.fullName}</h4>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Закрыть">
            ✕
          </button>
        </div>
        {saved ? (
          <p className="text-sm text-brand-700">Заметка сохранена.</p>
        ) : (
          <TeacherNoteForm groupId={groupId} studentId={student.studentId} onAdded={() => setSaved(true)} />
        )}
        <PrimaryButton type="button" className="mt-4 w-full" onClick={onClose}>
          Закрыть
        </PrimaryButton>
      </div>
    </div>
  );
}
