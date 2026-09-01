// English Start Profile — Этап 6: TEACHER DASHBOARD, аналитика группы.
//
// SPEC.md (раздел 24) определяет группы показателей ("Motivation — по
// вопросам Q15–Q18", "Learning autonomy — по Q20–Q22" и т.д.), но не
// даёт формулу перевода категориальных ответов анкеты в числовую шкалу
// 1–5 — такой матрицы просто не существует в исходных документах. Этот
// файл — единственное место, где такая формула выбрана, и выбор
// нарочно консервативный и раскрыт полностью:
//
//   Из вопроса каждой группы в числовой балл превращаются ТОЛЬКО те,
//   у которых варианты ответа образуют однозначную порядковую шкалу
//   («от точно да» до «точно нет» и т.п.). Вопросы, где варианты — это
//   набор причин/целей без встроенного порядка (Q17, Q18, Q20, Q23...),
//   в числовой средний балл НЕ включаются — они остаются качественным
//   контекстом (видны в профиле студента), а не выдуманным числом.
//
// Мотивация  = среднее по Q15, Q16 (обе — явная порядковая шкала
//              «отношение к английскому», 5 вариантов от положительного
//              к отрицательному).
// Самостоятельность = среднее по Q21, Q22 (обе — явная порядковая шкала
//              «готовность заниматься самостоятельно»).
//
// Это тот же принцип, что и "не превращать процент в CEFR без матрицы
// порогов" на Этапе 5: здесь формула ЕСТЬ (иначе KPI "Мотивация: 3,7/5"
// нечем было бы посчитать), но она сознательно проста, полностью
// раскрыта в этом комментарии и не выдаёт себя за валидированный
// психометрический инструмент.

import { findQuestion } from "../questionnaire/definition";

// DESC — первый вариант в списке самый позитивный (индекс 0 → балл 5).
// ASC  — первый вариант в списке самый негативный (индекс 0 → балл 1).
// Направление определяется порядком вариантов, как они заданы в самой
// анкете (questionnaire/definition.ts), а не выбирается произвольно
// здесь.
const ORDINAL_QUESTION_DIRECTION: Record<string, "ASC" | "DESC"> = {
  Q15: "DESC", // "мне действительно интересно" ... "не хочу им заниматься"
  Q16: "DESC", // "точно да" ... "точно нет"
  Q21: "ASC", // "не готов(а)" ... "более 2 часов"
  Q22: "DESC", // "сам(а) планирую" ... "практически не занимаюсь"
};

export const MOTIVATION_QUESTION_CODES = ["Q15", "Q16"];
export const AUTONOMY_QUESTION_CODES = ["Q21", "Q22"];
export const SELF_ASSESSMENT_QUESTION_CODE = "Q12";
export const BARRIERS_QUESTION_CODE = "Q23";
// Вопросы, нужные для потенциала развития (см. computePotentialSignals)
// и для качественного контекста барьеров.
export const POTENTIAL_QUESTION_CODES = ["Q29", "Q33", "Q37"];

// Все коды вопросов, которые Dashboard вообще запрашивает у анкеты —
// используется маршрутом, чтобы забрать из БД только эти строки
// QuestionnaireAnswer, а не все 45 (см. ТЗ Этапа 6, п.19
// "Производительность").
export const DASHBOARD_QUESTION_CODES = [
  ...MOTIVATION_QUESTION_CODES,
  ...AUTONOMY_QUESTION_CODES,
  SELF_ASSESSMENT_QUESTION_CODE,
  BARRIERS_QUESTION_CODE,
  ...POTENTIAL_QUESTION_CODES,
];

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ordinalScore(code: string, value: unknown): number | null {
  const direction = ORDINAL_QUESTION_DIRECTION[code];
  if (!direction || typeof value !== "string") return null;
  const question = findQuestion(code);
  if (!question || question.type !== "SINGLE_CHOICE" || !question.options) return null;
  const index = question.options.findIndex((o) => o.value === value);
  if (index === -1) return null;
  const n = question.options.length;
  return direction === "DESC" ? n - index : index + 1;
}

function averageOrdinal(codes: string[], answers: Record<string, unknown>): number | null {
  const scores = codes.map((c) => ordinalScore(c, answers[c])).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  return round1(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function computeMotivation(answers: Record<string, unknown>): number | null {
  return averageOrdinal(MOTIVATION_QUESTION_CODES, answers);
}

export function computeAutonomy(answers: Record<string, unknown>): number | null {
  return averageOrdinal(AUTONOMY_QUESTION_CODES, answers);
}

// Средняя самооценка (Q12 — матрица из 5 навыков, каждый 1–5).
export function computeSelfAssessment(answers: Record<string, unknown>): number | null {
  const raw = answers[SELF_ASSESSMENT_QUESTION_CODE];
  if (!raw || typeof raw !== "object") return null;
  const items = findQuestion(SELF_ASSESSMENT_QUESTION_CODE)?.matrixItems ?? [];
  const values = items
    .map((i) => (raw as Record<string, unknown>)[i.value])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

export type GapCategory = "MATCHES" | "SELF_HIGHER" | "SELF_LOWER";

// Переводит диагностический результат (0–100%) в ту же шкалу 1–5, что
// и самооценка, чтобы их можно было сравнивать — простое линейное
// масштабирование (0% → 1, 100% → 5), не психометрическая эквиваленция
// с CEFR (такой матрицы нет, см. Этап 5).
export function normalizeDiagnosticToFivePointScale(percentage: number): number {
  return round1(1 + (percentage / 100) * 4);
}

// Порог "заметного расхождения" (в баллах шкалы 1–5) — раскрытая,
// осознанно простая эвристика, не утверждённый психометрический порог.
const GAP_CATEGORY_THRESHOLD = 0.75;
const GAP_ATTENTION_THRESHOLD = 1.5; // порог для флага "Требуют внимания" — расхождение сильнее, чем просто категория

export function computeGapCategory(selfAssessment: number, normalizedDiagnostic: number): GapCategory {
  const diff = selfAssessment - normalizedDiagnostic;
  if (Math.abs(diff) < GAP_CATEGORY_THRESHOLD) return "MATCHES";
  return diff > 0 ? "SELF_HIGHER" : "SELF_LOWER";
}

export function isLargeGap(selfAssessment: number, normalizedDiagnostic: number): boolean {
  return Math.abs(selfAssessment - normalizedDiagnostic) >= GAP_ATTENTION_THRESHOLD;
}

export interface SkillBreakdownEntry {
  skill: "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING";
  correct: number;
  total: number;
  percentage: number;
}

const SKILL_LABELS_RU: Record<string, string> = {
  GRAMMAR: "Грамматика",
  VOCABULARY: "Лексика",
  READING: "Чтение",
  LISTENING: "Аудирование",
};

// Основная зона развития — навык с наименьшим процентом в диагностике.
export function computeDevelopmentArea(skillBreakdown: SkillBreakdownEntry[] | null): string | null {
  if (!skillBreakdown || skillBreakdown.length === 0) return null;
  const weakest = [...skillBreakdown].sort((a, b) => a.percentage - b.percentage)[0];
  return SKILL_LABELS_RU[weakest.skill] ?? weakest.skill;
}

export function skillLabelRu(skill: string): string {
  return SKILL_LABELS_RU[skill] ?? skill;
}

// Барьеры (Q23, multi-choice, максимум 3 варианта) — качественный
// контекст, не переводится в число. "Выражен" — выбрано 2 и более
// вариантов (не считая "ничего из перечисленного").
export function computeBarriersCount(answers: Record<string, unknown>): number {
  const raw = answers[BARRIERS_QUESTION_CODE];
  if (!Array.isArray(raw)) return 0;
  return raw.filter((v) => v !== "none").length;
}

// --- Потенциал развития (см. analytics/insights.ts) -------------------
//
// Признаки интереса к конференциям/проектам/исследованиям — берутся
// только из вопросов, где такой интерес выражен явно выбором
// конкретного варианта (Q29, Q33, Q37), а не домысливаются из общей
// мотивации.
export interface PotentialSignals {
  conference: boolean;
  project: boolean;
  research: boolean;
}

function includesAny(value: unknown, targets: string[]): boolean {
  return Array.isArray(value) && targets.some((t) => value.includes(t));
}

export function computePotentialSignals(answers: Record<string, unknown>): PotentialSignals {
  const q29 = answers.Q29;
  const q33 = answers.Q33;
  const q37 = answers.Q37;
  return {
    conference: includesAny(q29, ["conference", "speaking_in_english", "presentation"]) || includesAny(q37, ["participate_conferences"]),
    project: includesAny(q29, ["team_project", "competition", "olympiad"]) || includesAny(q37, ["participate_competitions"]),
    research: includesAny(q29, ["research_paper", "research_project", "publication"]) || includesAny(q33, ["research_skills"]) || includesAny(q37, ["prepare_publication"]),
  };
}
