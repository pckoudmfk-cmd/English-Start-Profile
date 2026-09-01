import type { ProgressCheckSummary } from "../api/progressCheck";
import { Badge, Card } from "./ui";

// English Start Profile — Этап 10: «Что было → Что стало → Что
// изменилось» — общий компонент для страницы студента и страницы
// преподавателя (не дублируем разметку сравнения в двух местах).
function formatChange(change: number | null): { text: string; tone: "brand" | "sky" | "slate" } {
  if (change === null) return { text: "—", tone: "slate" };
  if (change > 0) return { text: `+${change}`, tone: "brand" };
  if (change < 0) return { text: `${change}`, tone: "sky" };
  return { text: "0", tone: "slate" };
}

function MetricRow({ label, start, now, change }: { label: string; start: number | null; now: number | null; change: number | null }) {
  const c = formatChange(change);
  return (
    <tr>
      <td className="py-2 pr-3 font-medium text-slate-800">{label}</td>
      <td className="py-2 pr-3 text-right">{start ?? "—"}</td>
      <td className="py-2 pr-3 text-right">{now ?? "—"}</td>
      <td className="py-2 pr-3 text-right">
        <Badge tone={c.tone}>{c.text}</Badge>
      </td>
    </tr>
  );
}

export function ProgressComparisonView({ summary }: { summary: ProgressCheckSummary }) {
  const notReady = summary.startCompletedAt === null || summary.progressCompletedAt === null;

  return (
    <div className="space-y-4">
      {notReady && (
        <Card className="border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            {summary.startCompletedAt === null
              ? "Стартовая диагностика ещё не завершена — сравнивать не с чем."
              : "Промежуточная диагностика ещё не завершена (тест и/или анкета) — итоговое сравнение появится после завершения обеих частей."}
          </p>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Навыки: СТАРТ → СЕЙЧАС</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Навык</th>
                <th className="py-2 pr-3 text-right">Старт</th>
                <th className="py-2 pr-3 text-right">Сейчас</th>
                <th className="py-2 pr-3 text-right">Изменение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.skillTable.map((row) => (
                <MetricRow key={row.skill} label={row.label} start={row.start} now={row.now} change={row.changePoints} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Самооценка, мотивация, самостоятельность</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3">Показатель</th>
                <th className="py-2 pr-3 text-right">Старт</th>
                <th className="py-2 pr-3 text-right">Сейчас</th>
                <th className="py-2 pr-3 text-right">Изменение</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <MetricRow label="Самооценка" start={summary.selfAssessment.start} now={summary.selfAssessment.now} change={summary.selfAssessment.change} />
              <MetricRow label="Мотивация" start={summary.motivation.start} now={summary.motivation.now} change={summary.motivation.change} />
              <MetricRow label="Самостоятельность" start={summary.autonomy.start} now={summary.autonomy.now} change={summary.autonomy.change} />
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Шкала 1–5, из анкеты (Q1–Q45).</p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Цели</h2>
        {summary.goals.start.length === 0 && summary.goals.now.length === 0 ? (
          <p className="text-sm text-slate-400">Цели не заполнены ни в стартовой, ни в промежуточной анкете.</p>
        ) : (
          <div className="space-y-2 text-sm">
            {summary.goals.kept.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-400">Остались: </span>
                {summary.goals.kept.map((g) => (
                  <Badge key={g.code} tone="slate">
                    {g.label}
                  </Badge>
                ))}
              </div>
            )}
            {summary.goals.added.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-400">Добавились: </span>
                {summary.goals.added.map((g) => (
                  <Badge key={g.code} tone="brand">
                    {g.label}
                  </Badge>
                ))}
              </div>
            )}
            {summary.goals.removed.length > 0 && (
              <div>
                <span className="text-xs font-medium text-slate-400">Больше не выбраны: </span>
                {summary.goals.removed.map((g) => (
                  <Badge key={g.code} tone="sky">
                    {g.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Достижения</h2>
        <p className="text-sm text-slate-700">
          На момент старта: <strong>{summary.achievements.atStart}</strong> · сейчас: <strong>{summary.achievements.now}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-400">Результативные (подтверждённые с квалификационным баллом) достижения.</p>
      </Card>
    </div>
  );
}
