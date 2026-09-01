import { DIAGNOSTIC_ITEMS, type Skill } from "./itemBank";

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
 * Считает результат по массиву ответов ({itemId, correct}). Total по
 * каждому навыку берётся из банка заданий целиком (а не только из
 * отвеченных) — вызывающий код (routes/studentDiagnostic.ts) уже
 * гарантирует полноту перед вызовом этой функции; здесь это просто
 * защитная проверка согласованности, а не источник истины о том,
 * сколько вопросов "должно быть".
 *
 * Намеренно НЕ вычисляет диагностический диапазон (A1/A2/B1/B2) —
 * ТЗ Этапа 5 прямо запрещает превращать процент в CEFR-уровень без
 * утверждённой матрицы порогов. Только числовой результат и skill
 * profile.
 */
export function computeResult(answers: { itemId: string; correct: boolean }[]): ComputedResult {
  const correctByItemId = new Map(answers.map((a) => [a.itemId, a.correct]));

  const skills: Skill[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"];
  const skillBreakdown: SkillBreakdownEntry[] = skills.map((skill) => {
    const itemsForSkill = DIAGNOSTIC_ITEMS.filter((i) => i.skill === skill);
    const total = itemsForSkill.length;
    const correct = itemsForSkill.filter((i) => correctByItemId.get(i.id) === true).length;
    return { skill, correct, total, percentage: total > 0 ? Math.round((correct / total) * 1000) / 10 : 0 };
  });

  const overallTotal = DIAGNOSTIC_ITEMS.length;
  const overallCorrect = DIAGNOSTIC_ITEMS.filter((i) => correctByItemId.get(i.id) === true).length;

  return {
    overallCorrect,
    overallTotal,
    overallPercentage: overallTotal > 0 ? Math.round((overallCorrect / overallTotal) * 1000) / 10 : 0,
    skillBreakdown,
  };
}
