import type { DiagnosticItem, Skill } from "./itemBank";
import { itemsForForm, type DiagnosticForm } from "./forms";

export interface SkillBreakdownEntry {
  skill: Skill;
  correct: number;
  total: number;
  percentage: number;
}

export interface ComputedResult {
  overallCorrect: number;
  overallTotal: number;
  overallPercentage: number;
  skillBreakdown: SkillBreakdownEntry[];
}

/**
 * Считает результат по массиву ответов ({itemId, correct}) для ЗАДАННОЙ
 * формы (Этап 10: Form A — Start Diagnostic, Form B — Промежуточная
 * диагностика, см. diagnostic/forms.ts). Total по каждому навыку
 * берётся из банка заданий ЭТОЙ формы целиком (а не только из
 * отвеченных) — вызывающий код (routes/studentDiagnostic.ts) уже
 * гарантирует полноту перед вызовом этой функции; здесь это просто
 * защитная проверка согласованности, а не источник истины о том,
 * сколько вопросов "должно быть".
 *
 * Намеренно НЕ вычисляет диагностический диапазон (A1/A2/B1/B2) —
 * ТЗ Этапа 5 прямо запрещает превращать процент в CEFR-уровень без
 * утверждённой матрицы порогов. Только числовой результат и skill
 * profile. Это же правило действует и для Формы B — Этап 10 не отменяет
 * запрет Этапа 5.
 */
export function computeResult(form: DiagnosticForm, answers: { itemId: string; correct: boolean }[]): ComputedResult {
  const items: DiagnosticItem[] = itemsForForm(form);
  const correctByItemId = new Map(answers.map((a) => [a.itemId, a.correct]));

  const skills: Skill[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"];
  const skillBreakdown: SkillBreakdownEntry[] = skills.map((skill) => {
    const itemsForSkill = items.filter((i) => i.skill === skill);
    const total = itemsForSkill.length;
    const correct = itemsForSkill.filter((i) => correctByItemId.get(i.id) === true).length;
    return { skill, correct, total, percentage: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0 };
  });

  const overallTotal = items.length;
  const overallCorrect = items.filter((i) => correctByItemId.get(i.id) === true).length;

  return {
    overallCorrect,
    overallTotal,
    overallPercentage: overallTotal > 0 ? Math.round((overallCorrect / overallTotal) * 1000) / 10 : 0,
    skillBreakdown,
  };
}
