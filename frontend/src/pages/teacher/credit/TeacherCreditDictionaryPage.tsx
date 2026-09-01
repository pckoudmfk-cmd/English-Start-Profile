import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { workspaceApi, type Group } from "../../../api/workspace";
import { DICTIONARY_STATUS_LABELS_RU, teacherCreditApi, type DictionaryRow } from "../../../api/credit";
import { Badge, Card, EmptyState, ErrorAlert, PageTitle, Select } from "../../../components/ui";

// English Start Profile — Этап 9: «Проверка словарей» (ТЗ п.7) —
// объединённая очередь по ВСЕМ группам преподавателя (тот же приём UX,
// что и «Проверка достижений» на Этапе 8), т.к. backend-маршрут
// возвращает список по одной группе — объединяем на клиенте.
export function TeacherCreditDictionaryPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [rows, setRows] = useState<(DictionaryRow & { groupName: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    workspaceApi
      .listGroups({ status: "ACTIVE" })
      .then(async (gs) => {
        setGroups(gs);
        const lists = await Promise.all(gs.map((g) => teacherCreditApi.listDictionary(g.id).then((rs) => rs.map((r) => ({ ...r, groupName: g.name })))));
        setRows(lists.flat());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить заявки на допуск."));
  }, []);

  const filtered = (rows ?? []).filter((r) => (groupFilter ? r.groupId === groupFilter : true)).filter((r) => (statusFilter ? r.status === statusFilter : true));

  return (
    <div>
      <PageTitle subtitle="Заявки на допуск к зачёту (активный словарь) по всем вашим группам.">Проверка словарей</PageTitle>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Группа</label>
            <Select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Все группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Статус</label>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Все</option>
              {Object.entries(DICTIONARY_STATUS_LABELS_RU).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <ErrorAlert>{error}</ErrorAlert>

      <Card>
        {rows === null ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <EmptyState title="Заявок по заданным фильтрам не найдено." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3">Студент</th>
                  <th className="py-2 pr-3">Группа</th>
                  <th className="py-2 pr-3 text-right">Количество слов</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Дата</th>
                  <th className="py-2 pr-3">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 font-medium text-slate-800">{r.studentName}</td>
                    <td className="py-2 pr-3">{r.groupName}</td>
                    <td className="py-2 pr-3 text-right">{r.wordCount}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.status === "CONFIRMED" ? "brand" : r.status === "REJECTED" ? "slate" : "sky"}>{DICTIONARY_STATUS_LABELS_RU[r.status]}</Badge>
                    </td>
                    <td className="py-2 pr-3">{new Date(r.createdAt).toLocaleDateString("ru-RU")}</td>
                    <td className="py-2 pr-3">
                      <Link to={`/teacher/credit/dictionary/${r.id}`} className="text-xs font-medium text-brand-600 hover:underline">
                        Открыть
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
