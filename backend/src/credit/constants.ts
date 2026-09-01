// English Start Profile — Этап 9: справочники модуля «Дифференцированный
// зачёт». Ровно те значения, что перечислены в утверждённом ТЗ и
// положении о зачёте — без добавления новых видов работ, тем,
// критериев или порогов (ТЗ п.37 — "не добавляй без согласования").

// --- Допуск (словарь), ТЗ п.4-7 ------------------------------------------

export const DICTIONARY_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "NEEDS_CLARIFICATION", "CONFIRMED", "REJECTED"] as const;
export type DictionaryStatus = (typeof DICTIONARY_STATUSES)[number];
export const DICTIONARY_STATUS_LABELS_RU: Record<DictionaryStatus, string> = {
  SUBMITTED: "Предоставлен",
  UNDER_REVIEW: "На проверке",
  NEEDS_CLARIFICATION: "Требует уточнения",
  CONFIRMED: "Подтверждён",
  REJECTED: "Отклонён",
};
// "Не предоставлен" — не значение поля status, а отсутствие самой
// записи DictionarySubmission (см. analytics/credit.ts).
export const DICTIONARY_NOT_SUBMITTED_LABEL_RU = "Не предоставлен";

// Действия преподавателя (ТЗ п.7): Открыть / Подтвердить / Запросить
// уточнение / Отклонить. "Открыть" — явный переход в "На проверке" (не
// автоматический), собственная трактовка соответствия 4 текстовых
// статусов ТЗ п.4 набору действий ТЗ п.7 — задокументирована в отчёте.
export type DictionaryDecisionAction = "OPEN" | "CONFIRM" | "REQUEST_CLARIFICATION" | "REJECT";
export const DICTIONARY_DECISION_TARGET_STATUS: Record<DictionaryDecisionAction, DictionaryStatus> = {
  OPEN: "UNDER_REVIEW",
  CONFIRM: "CONFIRMED",
  REQUEST_CLARIFICATION: "NEEDS_CLARIFICATION",
  REJECT: "REJECTED",
};
export const DICTIONARY_DECISION_AUDIT_ACTION: Record<DictionaryDecisionAction, string> = {
  OPEN: "OPENED_FOR_REVIEW",
  CONFIRM: "CONFIRMED",
  REQUEST_CLARIFICATION: "CLARIFICATION_REQUESTED",
  REJECT: "REJECTED",
};
// Комментарий обязателен для уточнения/отклонения (тот же принцип, что
// у достижений на Этапе 8) — не для "Открыть"/"Подтвердить".
export function dictionaryCommentRequired(action: DictionaryDecisionAction): boolean {
  return action === "REQUEST_CLARIFICATION" || action === "REJECT";
}
// Из каких статусов действие вообще доступно.
export const DICTIONARY_REVIEWABLE_STATUSES: DictionaryStatus[] = ["SUBMITTED", "UNDER_REVIEW"];

// --- Лексико-грамматический тест, ТЗ п.8-16 -------------------------------

// РОВНО 11 тем ТЗ п.9 — другие темы не добавляются без согласования.
export const GRAMMAR_TOPICS = [
  "PRESENT_SIMPLE",
  "PRESENT_PERFECT",
  "PRESENT_CONTINUOUS",
  "PRESENT_PERFECT_CONTINUOUS",
  "PAST_SIMPLE",
  "FUTURE_SIMPLE",
  "PASSIVE_VOICE",
  "QUANTIFIERS", // some/any/few/a few/little/a little
  "OTHER",
  "PHRASAL_VERBS", // фразовые глаголы с предлогами
  "COMPARISON_DEGREES", // степени сравнения прилагательных
] as const;
export type GrammarTopic = (typeof GRAMMAR_TOPICS)[number];
export const GRAMMAR_TOPIC_LABELS_RU: Record<GrammarTopic, string> = {
  PRESENT_SIMPLE: "Present Simple",
  PRESENT_PERFECT: "Present Perfect",
  PRESENT_CONTINUOUS: "Present Continuous",
  PRESENT_PERFECT_CONTINUOUS: "Present Perfect Continuous",
  PAST_SIMPLE: "Past Simple",
  FUTURE_SIMPLE: "Future Simple",
  PASSIVE_VOICE: "Passive Voice",
  QUANTIFIERS: "some/any/few/a few/little/a little",
  OTHER: "Другое",
  PHRASAL_VERBS: "Фразовые глаголы с предлогами",
  COMPARISON_DEGREES: "Степени сравнения прилагательных",
};

// ТЗ требует само поле "difficulty", но не определяет шкалу (см.
// комментарий у модели CreditTestItem в schema.prisma) — минимальное
// трёхуровневое допущение.
export const CREDIT_TEST_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type CreditTestDifficulty = (typeof CREDIT_TEST_DIFFICULTIES)[number];
export const CREDIT_TEST_DIFFICULTY_LABELS_RU: Record<CreditTestDifficulty, string> = {
  EASY: "Лёгкое",
  MEDIUM: "Среднее",
  HARD: "Сложное",
};

export const CREDIT_TEST_ITEM_COUNT = 10; // ТЗ п.8: "10 вопросов"

// --- Устная часть — темы, ТЗ п.18 -----------------------------------------
//
// Английские названия — ДОСЛОВНО из ТЗ, не переформулированы. Русский
// перевод — только вспомогательная подпись в интерфейсе, не заменяет
// английское название (ТЗ п.18).
export interface OralTopic {
  id: string;
  en: string;
  ru: string;
}
export const ORAL_TOPICS: OralTopic[] = [
  { id: "family_relationships", en: "Family relationships", ru: "Семейные отношения" },
  { id: "appearance_character", en: "Describing a person's appearance and character", ru: "Описание внешности и характера человека" },
  { id: "day_of_financier", en: "A Day in the Life of a Financier", ru: "Один день из жизни финансиста" },
  { id: "leisure_hobbies", en: "Leisure. Hobbies.", ru: "Досуг. Увлечения." },
  { id: "youth_financial_independence", en: "Modern Youth Problems: Financial Independence and Ways to Achieve It", ru: "Проблемы современной молодёжи: финансовая независимость и пути её достижения" },
  { id: "building_room", en: "Describing a building, interior. Describing your room.", ru: "Описание здания, интерьера. Описание своей комнаты." },
  { id: "healthy_lifestyle", en: "Healthy lifestyle. Healthy and unhealthy food.", ru: "Здоровый образ жизни. Полезная и вредная еда." },
  { id: "traveling", en: "Traveling by train, by plane. Travelling in my life.", ru: "Путешествия на поезде, самолёте. Путешествия в моей жизни." },
  { id: "uk", en: "The UK: its geography, climate, population and political-economic structure", ru: "Великобритания: география, климат, население, политико-экономическое устройство" },
  { id: "usa", en: "The USA", ru: "США" },
  { id: "moscow", en: "Moscow: financial and economic center of Russia and its major landmarks", ru: "Москва: финансово-экономический центр России и её главные достопримечательности" },
  { id: "central_bank", en: "The Central Bank of Russia and the Federal Budget", ru: "Центральный банк России и федеральный бюджет" },
  { id: "economist_profession", en: "The Profession of an Economist and the role of English in Finance", ru: "Профессия экономиста и роль английского языка в финансах" },
  { id: "russia_economy", en: "The Economy of Russia", ru: "Экономика России" },
  { id: "financial_documentation", en: "Financial documentation and services", ru: "Финансовая документация и услуги" },
  { id: "digital_tech_finance", en: "Scientific achievements and modern digital technology in finance", ru: "Научные достижения и современные цифровые технологии в финансах" },
  { id: "famous_financiers", en: "Famous financiers in Russia and abroad and their contribution to the world finances", ru: "Известные финансисты в России и за рубежом и их вклад в мировые финансы" },
];
export function findOralTopic(id: string): OralTopic | undefined {
  return ORAL_TOPICS.find((t) => t.id === id);
}

// --- Устная часть — критерии оценки, ТЗ п.21 (дословно из положения) -----

export const TASK_COMPLETION_VALUES = ["NOT_DONE", "HALF", "THREE_QUARTERS", "DONE"] as const;
export type TaskCompletion = (typeof TASK_COMPLETION_VALUES)[number];
export const TASK_COMPLETION_LABELS_RU: Record<TaskCompletion, string> = {
  NOT_DONE: "не выполнена",
  HALF: "выполнена наполовину",
  THREE_QUARTERS: "выполнена на три четверти",
  DONE: "выполнена",
};

export const ERROR_COUNT_VALUES = ["NONE", "ONE_TWO", "THREE_FIVE", "SIX_NINE", "MORE_THAN_TEN"] as const;
export type ErrorCount = (typeof ERROR_COUNT_VALUES)[number];
export const ERROR_COUNT_LABELS_RU: Record<ErrorCount, string> = {
  NONE: "0",
  ONE_TWO: "1–2",
  THREE_FIVE: "3–5",
  SIX_NINE: "6–9",
  MORE_THAN_TEN: "более 10",
};

export const ERROR_NATURE_VALUES = ["GRAMMAR", "LEXICAL", "PHONETIC"] as const;
export type ErrorNature = (typeof ERROR_NATURE_VALUES)[number];
export const ERROR_NATURE_LABELS_RU: Record<ErrorNature, string> = {
  GRAMMAR: "грамматические",
  LEXICAL: "лексические",
  PHONETIC: "фонетические",
};

export const LOGIC_VALUES = ["BROKEN", "PARTIAL", "MOSTLY", "COHERENT"] as const;
export type LogicValue = (typeof LOGIC_VALUES)[number];
export const LOGIC_LABELS_RU: Record<LogicValue, string> = {
  BROKEN: "нарушена",
  PARTIAL: "частично соблюдена",
  MOSTLY: "в основном соблюдена",
  COHERENT: "логичная и связная",
};

export const ACTIVE_VOCABULARY_VALUES = ["USED", "INSUFFICIENT"] as const;
export type ActiveVocabularyValue = (typeof ACTIVE_VOCABULARY_VALUES)[number];
export const ACTIVE_VOCABULARY_LABELS_RU: Record<ActiveVocabularyValue, string> = {
  USED: "используется",
  INSUFFICIENT: "используется недостаточно",
};

export const QUESTION_RESPONSE_VALUES = ["NOT_INTERPRETING", "INTERPRETING", "ADEQUATE"] as const;
export type QuestionResponseValue = (typeof QUESTION_RESPONSE_VALUES)[number];
export const QUESTION_RESPONSE_LABELS_RU: Record<QuestionResponseValue, string> = {
  NOT_INTERPRETING: "не интерпретирует вопросы",
  INTERPRETING: "интерпретирует вопросы",
  ADEQUATE: "даёт адекватные ответы",
};

// Итоговые оценки устной части — ТЗ п.20 (дословно из положения).
export const FINAL_GRADES = ["UNSATISFACTORY", "SATISFACTORY", "GOOD", "EXCELLENT"] as const;
export type FinalGrade = (typeof FINAL_GRADES)[number];
export const FINAL_GRADE_LABELS_RU: Record<FinalGrade, string> = {
  UNSATISFACTORY: "неудовлетворительно",
  SATISFACTORY: "удовлетворительно",
  GOOD: "хорошо",
  EXCELLENT: "отлично",
};

export const ORAL_ASSESSMENT_STATUSES = ["ASSIGNED", "GRADED_DRAFT", "CONFIRMED", "EXEMPTED"] as const;
export type OralAssessmentStatus = (typeof ORAL_ASSESSMENT_STATUSES)[number];

// Фиксированная формулировка причины освобождения (ТЗ п.25) — не
// перефразируется в разных местах приложения.
export const ORAL_EXEMPTION_REASON_RU = "Освобождение от устной части на основании 5 квалификационных баллов";
