import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { workspaceApi, type Group } from "../../../api/workspace";
import { teacherCreditApi, type CreditDashboardFilters, type CreditDashboardResponse } from "../../../api/credit";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, Select, SecondaryButton } from "../../../components/ui";

const DICTIONARY_FILTER_OPTIONS = [
  { value: "", label: "Все" },
  { value: "SUBMITTED", label: "Предоставлен" },
  { value: "UNDER_REVIEW", label: "На проверке" },
  { value: "NEEDS_CLARIFICATION", label: "Требует уточнения" },
  { value: "CONFIRMED", label: "Подтверждён" },
  { value: "REJECTED", label: "Отклонён" },
];
const TEST_FILTER_OPTIONS = [
  { value: "", label: "Все" },
  { value: "NOT_STARTED", label: "Не начат" },
  { value: "IN_PROGRESS", label: "В процессе" },
  { value: "COMPLETED", label: "Выполнен" },
];
const ORAL_FILTER_OPTIONS = [
  { value: "", label: "Все" },
  { value: "NOT_ASSIGNED", label: "Не назначена" },
  { value: "ASSIGNED", label: "Назначена" },
  { value: "GRADED_DRAFT", label: "Черновик оценки" },
  { value: "CONFIRMED", label: "Подтверждена" },
  { value: "EXEMPTED", label: "Освобождён" },
];
const OVERALL_FILTER_OPTIONS = [
  { value: "", label: "Все" },
  { value: "NOT_ADMITTED", label: "Не допущен" },
  { value: "ADMITTED", label: "Допущен" },
  { value: "ORAL_REQUIRED", label: "Устная часть обязательна" },
  { value: "COMPLETED", label: "Зачёт завершён" },
];

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </Card>
  );
}

// English Start Profile — Этап 9: сводный экран «Зачёт» (ТЗ п.29-31).
export function TeacherCreditDashboardPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [dash, setDash] = useState<CreditDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<CreditDashboardFilters>({});

  useEffect(() => {
    workspaceApi.listGroups({ status: "ACTIVE" }).then((gs) => {
      setGroups(gs);
      if (gs.length > 0) setGroupId(gs[0].id);
    });
  }, []);

  function load() {
    if (!groupId) return;
    teacherCreditApi
      .getDashboard(groupId, filters)
      .then(setDash)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить сводку зачёта."));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [groupId, filters]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <PageTitle subtitle="Допуск, лексико-грамматический тест, квалификационные баллы, устная часть.">Зачёт</PageTitle>
        <div className="flex gap-2">
          <Link to="/teacher/credit/dictionary">
            <SecondaryButton type="button">Проверка словарей</SecondaryButton>
          </Link>
          <Link to="/teacher/credit/test-bank">
            <SecondaryButton type="button">Банк заданий теста</SecondaryButton>
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <label className="mb-1 block text-xs font-medium text-slate-500">Группа</label>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.specialty ? ` · ${g.specialty}` : ""}
            </option>
          ))}
        </Select>
      </Card>

      <ErrorAlert>{error}</ErrorAlert>

      {!dash ? (
        <Card>
          <p className="text-sm text-slate-500">{groups.length === 0 ? "Нет активных групп." : "Загрузка…"}</p>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Всего студентов" value={dash.kpi.totalStudents} />
            <KpiTile label="Допуск подтверждён" value={dash.kpi.admissionConfirmed} />
            <KpiTile label="Словарь на проверке" value={dash.kpi.dictionaryUnderReview} />
            <KpiTile label="Тест завершён" value={dash.kpi.testCompleted} />
            <button type="button" onClick={() => setFilters((f) => ({ ...f, pointsFilter: f.pointsFilter === "5plus" ? undefined : "5plus" }))} className="text-left">
              <Card className={`text-center ${filters.pointsFilter === "5plus" ? "border-brand-400 ring-1 ring-brand-200" : ""}`}>
                <div className="text-2xl font-semibold text-slate-900">{dash.kpi.fivePlusPoints}</div>
                <div className="mt-1 text-xs text-slate-500">5+ квалификационных баллов</div>
              </Card>
            </button>
            <KpiTile label="Освобождены от устной части" value={dash.kpi.oralExempted} />
            <KpiTile label="Устная часть предстоит" value={dash.kpi.oralPending} />
            <KpiTile label="Зачёт завершён" value={dash.kpi.creditCompleted} />
          </div>

          <Card className="mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Допуск</label>
                <Select value={filters.dictionaryFilter ?? ""} onChange={(e) => setFilters((f) => ({ ...f, dictionaryFilter: e.target.value || undefined }))}>
                  {DICTIONARY_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Тест</label>
                <Select value={filters.testFilter ?? ""} onChange={(e) => setFilters((f) => ({ ...f, testFilter: e.target.value || undefined }))}>
                  {TEST_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Устная часть</label>
                <Select value={filters.oralFilter ?? ""} onChange={(e) => setFilters((f) => ({ ...f, oralFilter: e.target.value || undefined }))}>
                  {ORAL_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Итоговый статус</label>
                <Select value={filters.overallFilter ?? ""} onChange={(e) => setFilters((f) => ({ ...f, overallFilter: e.target.value || undefined }))}>
                  {OVERALL_FILTER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <SecondaryButton type="button" onClick={() => setFilters({})}>
                Сбросить фильтры
              </SecondaryButton>
            </div>
          </Card>

          <Card>
            {dash.students.length === 0 ? (
              <EmptyState title="По заданным фильтрам никого нет." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                      <th className="py-2 pr-3">Студент</th>
                      <th className="py-2 pr-3">Словарь</th>
                      <th className="py-2 pr-3">Тест</th>
                      <th className="py-2 pr-3">Тест, баллы</th>
                      <th className="py-2 pr-3">Квалификационные баллы</th>
                      <th className="py-2 pr-3">Устная часть</th>
                      <th className="py-2 pr-3">Итог</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dash.students.map((s) => (
                      <tr key={s.studentId}>
                        <td className="py-2 pr-3 font-medium text-slate-800">
                          <Link to={`/teacher/credit/groups/${groupId}/students/${s.studentId}`} className="hover:underline">
                            {s.fullName}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.dictionaryStatus === "CONFIRMED" ? "brand" : s.dictionaryStatus ? "sky" : "slate"}>{s.dictionaryStatusLabel}</Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.testStatus === "COMPLETED" ? "brand" : s.testStatus === "IN_PROGRESS" ? "sky" : "slate"}>
                            {s.testStatus === "COMPLETED" ? "Выполнен" : s.testStatus === "IN_PROGRESS" ? "В процессе" : "Не начат"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">{s.testResult ? `${s.testResult.correctCount} / ${s.testResult.totalCount}` : "—"}</td>
                        <td className="py-2 pr-3">{s.qualificationPoints} / 5</td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.oralStatus === "EXEMPTED" || s.oralStatus === "CONFIRMED" ? "brand" : s.oralStatus === "NOT_ASSIGNED" ? "slate" : "sky"}>
                            {s.oralStatus === "NOT_ASSIGNED"
                              ? "Не назначена"
                              : s.oralStatus === "ASSIGNED"
                                ? "Назначена"
                                : s.oralStatus === "GRADED_DRAFT"
                                  ? "Черновик оценки"
                                  : s.oralStatus === "CONFIRMED"
                                    ? "Подтверждена"
                                    : "Освобождён"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge tone={s.overallStatus === "COMPLETED" ? "brand" : s.overallStatus === "NOT_ADMITTED" ? "slate" : "sky"}>{s.overallStatusLabel}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
