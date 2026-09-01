import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import { workspaceApi, type Group } from "../../../api/workspace";
import { teacherProgressCheckApi, type RosterEntry } from "../../../api/progressCheck";
import { Badge, Card, EmptyState, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, Select, SuccessAlert, TextInput } from "../../../components/ui";

const STATUS_LABELS: Record<string, string> = {
  NOT_ASSIGNED: "Не назначена",
  ASSIGNED: "Назначена",
  IN_PROGRESS: "В процессе",
  COMPLETED: "Завершена",
};
const STATUS_TONE: Record<string, "slate" | "brand" | "sky"> = {
  NOT_ASSIGNED: "slate",
  ASSIGNED: "sky",
  IN_PROGRESS: "sky",
  COMPLETED: "brand",
};

// English Start Profile — Этап 10: «Промежуточная диагностика»
// (преподаватель) — workflow ТЗ: группа → студенты → период →
// назначить. Запустить может ТОЛЬКО преподаватель.
export function TeacherProgressCheckPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodStartAt, setPeriodStartAt] = useState("");
  const [periodEndAt, setPeriodEndAt] = useState("");
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    workspaceApi.listGroups({ status: "ACTIVE" }).then((gs) => {
      setGroups(gs);
      if (gs.length > 0) setGroupId(gs[0].id);
    });
  }, []);

  function load() {
    if (!groupId) return;
    teacherProgressCheckApi
      .getRoster(groupId)
      .then((r) => {
        setRoster(r);
        setSelected(new Set());
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить список студентов."));
  }
  useEffect(load, [groupId]);

  function toggle(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function handleAssign() {
    if (!groupId || selected.size === 0 || !periodStartAt) {
      setError("Выберите хотя бы одного студента и укажите начало периода.");
      return;
    }
    setAssigning(true);
    setError(null);
    try {
      const res = await teacherProgressCheckApi.assign(groupId, {
        studentIds: [...selected],
        periodStartAt: new Date(periodStartAt).toISOString(),
        periodEndAt: periodEndAt ? new Date(periodEndAt).toISOString() : null,
      });
      const assignedCount = res.results.filter((r) => r.outcome === "ASSIGNED").length;
      const alreadyCount = res.results.filter((r) => r.outcome === "ALREADY_ASSIGNED").length;
      setSuccess(`Назначено: ${assignedCount}.${alreadyCount > 0 ? ` Уже было назначено ранее: ${alreadyCount}.` : ""}`);
      setPeriodStartAt("");
      setPeriodEndAt("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось назначить диагностику.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div>
      <PageTitle subtitle="Сравнение результатов студентов: СТАРТ → СЕЙЧАС. Рекомендуемый срок — через 5–6 месяцев после стартовой диагностики.">
        Промежуточная диагностика
      </PageTitle>

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
      <SuccessAlert>{success}</SuccessAlert>

      {roster === null ? (
        <Card>
          <p className="text-sm text-slate-500">{groups.length === 0 ? "Нет активных групп." : "Загрузка…"}</p>
        </Card>
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState title="В этой группе пока нет студентов." />
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Назначить выбранным студентам</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <FieldLabel htmlFor="periodStart">Начало периода</FieldLabel>
                <TextInput id="periodStart" type="date" value={periodStartAt} onChange={(e) => setPeriodStartAt(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="periodEnd">Окончание периода (необязательно)</FieldLabel>
                <TextInput id="periodEnd" type="date" value={periodEndAt} onChange={(e) => setPeriodEndAt(e.target.value)} />
              </div>
              <PrimaryButton type="button" onClick={handleAssign} disabled={assigning || selected.size === 0}>
                {assigning ? "Назначаем…" : `Назначить (${selected.size})`}
              </PrimaryButton>
            </div>
            <p className="mt-2 text-xs text-slate-400">Студент не сможет открыть диагностику раньше начала периода.</p>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3"> </th>
                    <th className="py-2 pr-3">Студент</th>
                    <th className="py-2 pr-3">Старт пройден</th>
                    <th className="py-2 pr-3">Статус</th>
                    <th className="py-2 pr-3">Период</th>
                    <th className="py-2 pr-3">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roster.map((r) => (
                    <tr key={r.studentId}>
                      <td className="py-2 pr-3">
                        <input type="checkbox" checked={selected.has(r.studentId)} onChange={() => toggle(r.studentId)} disabled={r.status !== "NOT_ASSIGNED"} />
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.fullName}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={r.startDiagnosticCompleted ? "brand" : "slate"}>{r.startDiagnosticCompleted ? "Да" : "Нет"}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-500">
                        {r.periodStartAt ? new Date(r.periodStartAt).toLocaleDateString("ru-RU") : "—"}
                        {r.periodEndAt ? ` – ${new Date(r.periodEndAt).toLocaleDateString("ru-RU")}` : ""}
                      </td>
                      <td className="py-2 pr-3">
                        {r.status !== "NOT_ASSIGNED" && (
                          <Link to={`/teacher/diagnostics/groups/${groupId}/students/${r.studentId}`} className="text-xs font-medium text-brand-600 hover:underline">
                            Сравнение →
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
