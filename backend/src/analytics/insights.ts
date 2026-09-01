// English Start Profile — Этап 6: логика блоков «Требуют внимания» и
// «Возможности развития».
//
// Это система педагогической навигации, а не диагноз (ТЗ, п.6): статус
// студента строится из СОЧЕТАНИЯ факторов, а не одного слабого
// показателя без контекста, и использует только нейтральные
// формулировки ("требует внимания", "зона развития"), никогда —
// "проблемный/слабый/немотивированный/плохой студент".

import {
  computeBarriersCount,
  isLargeGap,
  normalizeDiagnosticToFivePointScale,
  skillLabelRu,
  type PotentialSignals,
  type SkillBreakdownEntry,
} from "./scoring";

export type AttemptStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface StudentMetrics {
  studentId: string;
  fullName: string;
  questionnaireStatus: AttemptStatus;
  diagnosticStatus: AttemptStatus;
  diagnosticPercentage: number | null;
  skillBreakdown: SkillBreakdownEntry[] | null;
  selfAssessment: number | null;
  motivation: number | null;
  autonomy: number | null;
  answers: Record<string, unknown>; // только DASHBOARD_QUESTION_CODES, не весь ответ анкеты
}

export interface AttentionFactor {
  label: string;
  dataLines: string[];
  source: string;
}

export interface AttentionEntry {
  studentId: string;
  fullName: string;
  primaryReason: string;
  keyMetricLabel: string;
  severity: number;
  factors: AttentionFactor[];
}

// Пороговые значения — раскрытые, осознанно простые эвристики для
// первой апробации (см. комментарий в scoring.ts), не утверждённые
// клинические/психометрические границы. Их предстоит откалибровать по
// результатам реального использования (SPEC.md, раздел 36).
const LOW_DIAGNOSTIC_THRESHOLD = 50;
const SEVERE_DIAGNOSTIC_THRESHOLD = 30;
const LOW_SCALE_THRESHOLD = 2.5;
const SEVERE_SCALE_THRESHOLD = 1.8;
const BARRIERS_THRESHOLD = 2;
const ATTENTION_WEIGHT_THRESHOLD = 2;

function formatScale(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export function buildAttentionEntry(m: StudentMetrics): AttentionEntry | null {
  const factors: Array<{ weight: number; label: string; dataLines: string[]; source: string }> = [];

  if (m.diagnosticStatus !== "COMPLETED") {
    factors.push({
      weight: 2,
      label: "Не завершена стартовая диагностика",
      dataLines: [`Статус: ${m.diagnosticStatus === "IN_PROGRESS" ? "в процессе" : "не начата"}`],
      source: "Start Diagnostic",
    });
  }
  if (m.questionnaireStatus !== "COMPLETED") {
    factors.push({
      weight: 1,
      label: "Не завершено анкетирование",
      dataLines: [`Статус: ${m.questionnaireStatus === "IN_PROGRESS" ? "в процессе" : "не начато"}`],
      source: "Start Profile",
    });
  }
  if (m.diagnosticPercentage !== null) {
    if (m.diagnosticPercentage < SEVERE_DIAGNOSTIC_THRESHOLD) {
      factors.push({
        weight: 2,
        label: "Низкий диагностический результат",
        dataLines: [`Диагностический результат: ${m.diagnosticPercentage}%`],
        source: "Start Diagnostic",
      });
    } else if (m.diagnosticPercentage < LOW_DIAGNOSTIC_THRESHOLD) {
      factors.push({
        weight: 1,
        label: "Невысокий диагностический результат",
        dataLines: [`Диагностический результат: ${m.diagnosticPercentage}%`],
        source: "Start Diagnostic",
      });
    }
    if (m.skillBreakdown) {
      const weakest = [...m.skillBreakdown].sort((a, b) => a.percentage - b.percentage)[0];
      if (weakest && weakest.percentage < LOW_DIAGNOSTIC_THRESHOLD) {
        factors.push({
          weight: 1,
          label: `Низкий результат по навыку «${skillLabelRu(weakest.skill)}»`,
          dataLines: [`${skillLabelRu(weakest.skill)} — ${weakest.percentage}%`],
          source: "Start Diagnostic",
        });
      }
    }
  }
  if (m.motivation !== null) {
    if (m.motivation < SEVERE_SCALE_THRESHOLD) {
      factors.push({ weight: 2, label: "Низкая мотивация", dataLines: [`Мотивация: ${formatScale(m.motivation)} / 5`], source: "Start Profile" });
    } else if (m.motivation < LOW_SCALE_THRESHOLD) {
      factors.push({ weight: 1, label: "Сниженная мотивация", dataLines: [`Мотивация: ${formatScale(m.motivation)} / 5`], source: "Start Profile" });
    }
  }
  if (m.autonomy !== null) {
    if (m.autonomy < SEVERE_SCALE_THRESHOLD) {
      factors.push({ weight: 2, label: "Низкая самостоятельность", dataLines: [`Самостоятельность: ${formatScale(m.autonomy)} / 5`], source: "Start Profile" });
    } else if (m.autonomy < LOW_SCALE_THRESHOLD) {
      factors.push({ weight: 1, label: "Сниженная самостоятельность", dataLines: [`Самостоятельность: ${formatScale(m.autonomy)} / 5`], source: "Start Profile" });
    }
  }
  if (m.selfAssessment !== null && m.diagnosticPercentage !== null) {
    const normalized = normalizeDiagnosticToFivePointScale(m.diagnosticPercentage);
    if (isLargeGap(m.selfAssessment, normalized)) {
      factors.push({
        weight: 1,
        label: "Большой разрыв между самооценкой и результатом",
        dataLines: [`Самооценка: ${formatScale(m.selfAssessment)} / 5`, `Диагностический результат: ${m.diagnosticPercentage}%`],
        source: "Start Profile + Start Diagnostic",
      });
    }
  }
  const barriersCount = computeBarriersCount(m.answers);
  if (barriersCount >= BARRIERS_THRESHOLD) {
    factors.push({
      weight: 1,
      label: "Несколько выраженных барьеров в обучении",
      dataLines: [`Отмечено барьеров: ${barriersCount}`],
      source: "Start Profile",
    });
  }

  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  if (totalWeight < ATTENTION_WEIGHT_THRESHOLD || factors.length === 0) return null;

  const primary = [...factors].sort((a, b) => b.weight - a.weight)[0];

  return {
    studentId: m.studentId,
    fullName: m.fullName,
    primaryReason: primary.label,
    keyMetricLabel: primary.dataLines[0],
    severity: totalWeight,
    factors: factors.map((f) => ({ label: f.label, dataLines: f.dataLines, source: f.source })),
  };
}

export interface OpportunityEntry {
  studentId: string;
  fullName: string;
  potentialLabel: string;
  reasonText: string;
}

const STRONG_MOTIVATION_THRESHOLD = 4;
const STRONG_AUTONOMY_THRESHOLD = 4;
const STRONG_DIAGNOSTIC_THRESHOLD = 70;
const HIGH_LANGUAGE_ONLY_THRESHOLD = 80;

export function buildOpportunityEntry(m: StudentMetrics, potential: PotentialSignals): OpportunityEntry | null {
  const strongMotivation = m.motivation !== null && m.motivation >= STRONG_MOTIVATION_THRESHOLD;
  const strongAutonomy = m.autonomy !== null && m.autonomy >= STRONG_AUTONOMY_THRESHOLD;
  const strongDiagnostic = m.diagnosticPercentage !== null && m.diagnosticPercentage >= STRONG_DIAGNOSTIC_THRESHOLD;

  const baseStrong = strongMotivation || strongAutonomy || strongDiagnostic;
  if (!baseStrong) return null;

  const strengthParts: string[] = [];
  if (strongMotivation) strengthParts.push("высокая мотивация");
  if (strongAutonomy) strengthParts.push("высокая самостоятельность");
  if (strongDiagnostic) strengthParts.push("высокий диагностический результат");

  // Приоритет: исследовательский > конференционный > проектный >
  // языковой (если нет специфического интереса, но результат очень
  // высокий) — соответствует категориям SPEC.md, раздел 25.
  if (potential.research) {
    return {
      studentId: m.studentId,
      fullName: m.fullName,
      potentialLabel: "Исследовательский потенциал",
      reasonText: `${capitalize(strengthParts.join(" + "))} + интерес к исследовательской деятельности`,
    };
  }
  if (potential.conference) {
    return {
      studentId: m.studentId,
      fullName: m.fullName,
      potentialLabel: "Конференционный потенциал",
      reasonText: `${capitalize(strengthParts.join(" + "))} + интерес к конференциям`,
    };
  }
  if (potential.project) {
    return {
      studentId: m.studentId,
      fullName: m.fullName,
      potentialLabel: "Проектный потенциал",
      reasonText: `${capitalize(strengthParts.join(" + "))} + интерес к проектной деятельности`,
    };
  }
  if (m.diagnosticPercentage !== null && m.diagnosticPercentage >= HIGH_LANGUAGE_ONLY_THRESHOLD) {
    return {
      studentId: m.studentId,
      fullName: m.fullName,
      potentialLabel: "Высокий языковой потенциал",
      reasonText: capitalize(strengthParts.join(" + ")),
    };
  }
  return null;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}
