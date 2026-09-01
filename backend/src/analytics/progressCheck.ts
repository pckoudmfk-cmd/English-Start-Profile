// English Start Profile — Этап 10: ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА — единая
// функция расчёта сравнения "СТАРТ → СЕЙЧАС" (тот же принцип "не
// дублировать расчёт", что и в analytics/qualification.ts/credit.ts на
// Этапах 8-9). Используется и student-, и teacher-маршрутами.
import { prisma } from "../db";
import { computeAutonomy, computeMotivation, computeSelfAssessment, round1, type SkillBreakdownEntry } from "./scoring";
import { findQuestion } from "../questionnaire/definition";

const DIAGNOSED_SKILLS = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"] as const;
export const SKILL_LABELS_RU: Record<string, string> = {
  GRAMMAR: "Грамматика",
  VOCABULARY: "Лексика",
  READING: "Чтение",
  LISTENING: "Аудирование",
};

export interface SkillComparisonRow {
  skill: string;
  label: string;
  start: number | null;
  now: number | null;
  changePoints: number | null;
}

interface MetricComparison {
  start: number | null;
  now: number | null;
  change: number | null;
}

interface GoalEntry {
  code: string;
  label: string;
}

export interface ProgressCheckSummary {
  // NOT_ASSIGNED — преподаватель ещё не назначал Промежуточную
  // диагностику этому студенту в этой группе.
  progressStatus: "NOT_ASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
  assignedAt: Date | null;
  periodStartAt: Date | null;
  periodEndAt: Date | null;
  startCompletedAt: Date | null;
  progressCompletedAt: Date | null;
  // Месяцев с момента завершения Start Diagnostic — только для
  // ориентира преподавателю (ТЗ: "рекомендуемый срок — через 5-6
  // месяцев"); не блокирует и не влияет ни на что содержательно.
  monthsSinceStart: number | null;
  skillTable: SkillComparisonRow[];
  selfAssessment: MetricComparison;
  motivation: MetricComparison;
  autonomy: MetricComparison;
  goals: { start: GoalEntry[]; now: GoalEntry[]; added: GoalEntry[]; removed: GoalEntry[]; kept: GoalEntry[] };
  achievements: { atStart: number; now: number; change: number };
}

function metricComparison(start: number | null, now: number | null): MetricComparison {
  return { start, now, change: start !== null && now !== null ? round1(now - start) : null };
}

function parseAnswers(rows: { questionCode: string; valueJson: string }[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.questionCode] = JSON.parse(r.valueJson);
    } catch {
      // повреждённая запись — пропускаем, не роняем весь расчёт
    }
  }
  return out;
}

function goalLabel(code: string): string {
  const q37 = findQuestion("Q37");
  return q37?.options?.find((o) => o.value === code)?.label ?? code;
}

export async function getStudentProgressComparison(groupId: string, studentId: string): Promise<ProgressCheckSummary> {
  const [startDiag, progressDiag, startQ, progressQ] = await Promise.all([
    prisma.diagnosticAttempt.findFirst({ where: { groupId, studentId, kind: "START" }, include: { result: true } }),
    prisma.diagnosticAttempt.findFirst({ where: { groupId, studentId, kind: "PROGRESS" }, include: { result: true } }),
    prisma.questionnaireAttempt.findFirst({ where: { groupId, studentId, kind: "START" }, include: { answers: true } }),
    prisma.questionnaireAttempt.findFirst({ where: { groupId, studentId, kind: "PROGRESS" }, include: { answers: true } }),
  ]);

  function breakdownFor(attempt: typeof startDiag): SkillBreakdownEntry[] | null {
    if (!attempt || attempt.status !== "COMPLETED" || !attempt.result) return null;
    return JSON.parse(attempt.result.skillBreakdownJson);
  }
  const startBreakdown = breakdownFor(startDiag);
  const progressBreakdown = breakdownFor(progressDiag);

  const skillTable: SkillComparisonRow[] = DIAGNOSED_SKILLS.map((skill) => {
    const start = startBreakdown?.find((s) => s.skill === skill)?.percentage ?? null;
    const now = progressBreakdown?.find((s) => s.skill === skill)?.percentage ?? null;
    return { skill, label: SKILL_LABELS_RU[skill], start, now, changePoints: start !== null && now !== null ? round1(now - start) : null };
  });

  const startAnswers = startQ?.status === "COMPLETED" ? parseAnswers(startQ.answers) : {};
  const progressAnswers = progressQ?.status === "COMPLETED" ? parseAnswers(progressQ.answers) : {};

  const selfAssessment = metricComparison(
    startQ?.status === "COMPLETED" ? computeSelfAssessment(startAnswers) : null,
    progressQ?.status === "COMPLETED" ? computeSelfAssessment(progressAnswers) : null
  );
  const motivation = metricComparison(
    startQ?.status === "COMPLETED" ? computeMotivation(startAnswers) : null,
    progressQ?.status === "COMPLETED" ? computeMotivation(progressAnswers) : null
  );
  const autonomy = metricComparison(
    startQ?.status === "COMPLETED" ? computeAutonomy(startAnswers) : null,
    progressQ?.status === "COMPLETED" ? computeAutonomy(progressAnswers) : null
  );

  // Цели — до 3 кодов из Q37 (ТЗ Этапа 4). "Изменение целей" = какие
  // добавились/пропали/остались между Start и Progress анкетами —
  // сравнение самих формулировок, не выдуманная оценка "прогресса по
  // цели" (это отдельный, уже существующий механизм — статус цели,
  // который явно ставит преподаватель, Этап 7).
  const startGoalCodes: string[] = startQ?.status === "COMPLETED" && Array.isArray(startAnswers.Q37) ? (startAnswers.Q37 as string[]) : [];
  const nowGoalCodes: string[] = progressQ?.status === "COMPLETED" && Array.isArray(progressAnswers.Q37) ? (progressAnswers.Q37 as string[]) : [];
  const toEntries = (codes: string[]): GoalEntry[] => codes.map((code) => ({ code, label: goalLabel(code) }));

  // Достижения (ТЗ: "Дополнительно: достижения") — сравниваем число
  // ПОДТВЕРЖДЁННЫХ результативных достижений (Этап 8) на момент
  // завершения Start Diagnostic (реальная временная метка,
  // Achievement.verifiedAt) с текущим числом — не выдуманная точка
  // отсчёта, а фильтр по уже существующему полю.
  let achievementsAtStart = 0;
  if (startDiag?.completedAt) {
    achievementsAtStart = await prisma.achievement.count({
      where: { groupId, studentId, status: "CONFIRMED", verifiedAt: { lte: startDiag.completedAt } },
    });
  }
  const achievementsNow = await prisma.achievement.count({ where: { groupId, studentId, status: "CONFIRMED" } });

  const monthsSinceStart = startDiag?.completedAt
    ? Math.floor((Date.now() - startDiag.completedAt.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    : null;

  return {
    progressStatus: (progressDiag?.status as ProgressCheckSummary["progressStatus"]) ?? "NOT_ASSIGNED",
    assignedAt: progressDiag?.assignedAt ?? null,
    periodStartAt: progressDiag?.periodStartAt ?? null,
    periodEndAt: progressDiag?.periodEndAt ?? null,
    startCompletedAt: startDiag?.completedAt ?? null,
    progressCompletedAt: progressDiag?.completedAt ?? null,
    monthsSinceStart,
    skillTable,
    selfAssessment,
    motivation,
    autonomy,
    goals: {
      start: toEntries(startGoalCodes),
      now: toEntries(nowGoalCodes),
      added: toEntries(nowGoalCodes.filter((c) => !startGoalCodes.includes(c))),
      removed: toEntries(startGoalCodes.filter((c) => !nowGoalCodes.includes(c))),
      kept: toEntries(startGoalCodes.filter((c) => nowGoalCodes.includes(c))),
    },
    achievements: { atStart: achievementsAtStart, now: achievementsNow, change: achievementsNow - achievementsAtStart },
  };
}
