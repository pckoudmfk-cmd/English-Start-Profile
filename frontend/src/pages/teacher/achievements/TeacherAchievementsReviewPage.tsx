import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { workspaceApi, type Group } from "../../../api/workspace";
import {
  ACHIEVEMENT_STATUS_LABELS_RU,
  ACHIEVEMENT_STATUS_TONE,
  CLAIMED_RESULT_LABELS_RU,
  CLAIMED_RESULTS,
  EVENT_TYPE_LABELS_RU,
  EVENT_TYPES,
  teacherAchievementsApi,
  type AchievementStatus,
  type ClaimedResult,
  type EventType,
  type TeacherAchievementRow,
  type TeacherFilters,
} from "../../../api/achievements";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, Select, SecondaryButton } from "../../../components/ui";

const ACHIEVEMENT_STATUSES: AchievementStatus[] = ["PENDING", "NEEDS_CLARIFICATION", "CONFIRMED", "CONFIRMED_NO_POINT", "REJECTED"];

// English Start Profile — Этап 8: «Проверка достижений» (преподаватель).
export function TeacherAchievementsReviewPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [rows, setRows] = useState<TeacherAchievementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [groupId, setGroupId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [eventType, setEventType] = useState<EventType | "">("");
  const [status, setStatus] = useState<AchievementStatus | "">("");
  const [claimedResult, setClaimedResult] = useState<ClaimedResult | "">("");
  const [pendingOnly, setPendingOnly] = useState(false);
  const [sort, setSort] = useState<TeacherFilters["sort"]>("date");
  // Полный, ничем не отфильтрованный список — источник вариантов для
  // селектора "Студент" (иначе список студентов сужался бы вместе с
  // остальными фильтрами, а не показывал всех, кого вообще можно выбрать).
  const [allRows, setAllRows] = useState<TeacherAchievementRow[]>([]);

  useEffect(() => {
    workspaceApi.listGroups({ status: "ACTIVE" }).then(setGroups);
    teacherAchievementsApi.list({}).then(setAllRows).catch(() => {});
  }, []);

  function load() {
    const filters: TeacherFilters = {
      groupId: groupId || undefined,
      studentId: studentId || undefined,
      eventType: eventType || undefined,
      status: pendingOnly ? undefined : status || undefined,
      claimedResult: claimedResult || undefined,
      pendingOnly: pendingOnly || undefined,
      sort,
    };
    teacherAchievementsApi
      .list(filters)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить достижения."));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [groupId, studentId, eventType, status, claimedResult, pendingOnly, sort]);

  const studentOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of allRows) map.set(r.studentId, r.studentName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  }, [allRows]);

  function resetFilters() {
    setGroupId("");
    setStudentId("");
    setEventType("");
    setStatus("");
    setClaimedResult("");
    setPendingOnly(false);
    setSort("date");
  }

  return (
    <div>
      <PageTitle subtitle="Достижения студентов ваших групп">Проверка достижений</PageTitle>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Группа</label>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Студент</label>
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Все студенты</option>
              {studentOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Тип мероприятия</label>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value as EventType | "")}>
              <option value="">Все</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS_RU[t]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Результат</label>
            <Select value={claimedResult} onChange={(e) => setClaimedResult(e.target.value as ClaimedResult | "")}>
              <option value="">Все</option>
              {CLAIMED_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {CLAIMED_RESULT_LABELS_RU[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Статус</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as AchievementStatus | "")} disabled={pendingOnly}>
              <option value="">Все (кроме черновиков)</option>
              {ACHIEVEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ACHIEVEMENT_STATUS_LABELS_RU[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Сортировка</label>
            <Select value={sort} onChange={(e) => setSort(e.target.value as TeacherFilters["sort"])}>
              <option value="date">По дате</option>
              <option value="student">По студенту</option>
              <option value="status">По статусу</option>
              <option value="type">По типу мероприятия</option>
            </Select>
          </div>
          <SecondaryButton
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            className={pendingOnly ? "border-brand-500 text-brand-700" : ""}
          >
            Требуют проверки
          </SecondaryButton>
          <SecondaryButton type="button" onClick={resetFilters}>
            Сбросить фильтры
          </SecondaryButton>
        </div>
      </Card>

      <ErrorAlert>{error}</ErrorAlert>

      <Card>
        {rows === null ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Достижений по заданным фильтрам не найдено." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">Студент</th>
                    <th className="py-2 pr-3">Мероприятие</th>
                    <th className="py-2 pr-3">Дата</th>
                    <th className="py-2 pr-3">Результат</th>
                    <th className="py-2 pr-3">Статус</th>
                    <th className="py-2 pr-3 text-right">Балл</th>
                    <th className="py-2 pr-3">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.studentName}</td>
                      <td className="py-2 pr-3">{r.eventName}</td>
                      <td className="py-2 pr-3">{new Date(r.eventDate).toLocaleDateString("ru-RU")}</td>
                      <td className="py-2 pr-3">{CLAIMED_RESULT_LABELS_RU[r.claimedResult]}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={ACHIEVEMENT_STATUS_TONE[r.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[r.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right">{r.qualificationPoint === 1 ? "+1" : "—"}</td>
                      <td className="py-2 pr-3">
                        <Link to={`/teacher/achievements/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                          Открыть
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="break-words text-sm font-medium text-slate-900">{r.studentName}</div>
                  <div className="mt-1 break-words text-xs text-slate-500">{r.eventName}</div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <dt className="text-slate-400">Дата</dt>
                    <dd>{new Date(r.eventDate).toLocaleDateString("ru-RU")}</dd>
                    <dt className="text-slate-400">Результат</dt>
                    <dd>{CLAIMED_RESULT_LABELS_RU[r.claimedResult]}</dd>
                    <dt className="text-slate-400">Статус</dt>
                    <dd><Badge tone={ACHIEVEMENT_STATUS_TONE[r.status]}>{ACHIEVEMENT_STATUS_LABELS_RU[r.status]}</Badge></dd>
                    <dt className="text-slate-400">Балл</dt>
                    <dd>{r.qualificationPoint === 1 ? "+1" : "—"}</dd>
                  </dl>
                  <Link to={`/teacher/achievements/${r.id}`} className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
                    Открыть
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
