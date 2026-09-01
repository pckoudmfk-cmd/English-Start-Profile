// English Start Profile — Этап 9: предварительная оценка устной части
// (ТЗ п.22 — "система МОЖЕТ вычислить и показать предварительный
// результат, но не может сама завершить оценку").
//
// Это раскрытая, детерминированная эвристика (тот же принцип "никаких
// чёрных ящиков", что и в analytics/profile.ts на Этапе 7), а НЕ
// автоматическое выставление итоговой оценки — вызывающий код обязан
// сопровождать результат этой функции подписью "Итоговую оценку
// подтверждает преподаватель" и никогда не записывать её как
// OralAssessment.finalGrade напрямую.
//
// Правило построено на дословном тексте положения (ТЗ п.20): каждый
// критерий даёт "потолок" итоговой оценки по своей отдельной шкале,
// предварительный результат — МИНИМУМ (самый строгий) из всех
// потолков. Так решение не может "случайно" завысить оценку из-за
// одного сильного критерия при слабых остальных — именно так же
// дословно построено само положение (каждая оценка требует
// одновременного выполнения всех перечисленных условий).
import type { ActiveVocabularyValue, ErrorCount, FinalGrade, LogicValue, QuestionResponseValue, TaskCompletion } from "../credit/constants";

const GRADE_RANK: Record<FinalGrade, number> = {
  UNSATISFACTORY: 0,
  SATISFACTORY: 1,
  GOOD: 2,
  EXCELLENT: 3,
};
const RANK_TO_GRADE: FinalGrade[] = ["UNSATISFACTORY", "SATISFACTORY", "GOOD", "EXCELLENT"];

const CEILING_BY_ERROR_COUNT: Record<ErrorCount, FinalGrade> = {
  NONE: "EXCELLENT",
  ONE_TWO: "EXCELLENT", // "1–2 незначительные ошибки" — верхняя граница ОТЛИЧНО
  THREE_FIVE: "GOOD",
  SIX_NINE: "SATISFACTORY",
  MORE_THAN_TEN: "UNSATISFACTORY",
};
const CEILING_BY_TASK_COMPLETION: Record<TaskCompletion, FinalGrade> = {
  DONE: "EXCELLENT",
  THREE_QUARTERS: "GOOD",
  HALF: "SATISFACTORY",
  NOT_DONE: "UNSATISFACTORY",
};
const CEILING_BY_LOGIC: Record<LogicValue, FinalGrade> = {
  COHERENT: "EXCELLENT",
  MOSTLY: "GOOD",
  PARTIAL: "SATISFACTORY",
  BROKEN: "UNSATISFACTORY",
};
// "используется активная лексика" явно требуется для ХОРОШО и ОТЛИЧНО
// (п.20) — недостаточное использование ограничивает результат сверху
// УДОВЛЕТВОРИТЕЛЬНО.
const CEILING_BY_ACTIVE_VOCABULARY: Record<ActiveVocabularyValue, FinalGrade> = {
  USED: "EXCELLENT",
  INSUFFICIENT: "SATISFACTORY",
};
// "правильно интерпретирует вопросы" впервые появляется в описании
// УДОВЛЕТВОРИТЕЛЬНО — неспособность интерпретировать вопросы
// ограничивает результат НЕУДОВЛЕТВОРИТЕЛЬНО.
const CEILING_BY_QUESTION_RESPONSES: Record<QuestionResponseValue, FinalGrade> = {
  ADEQUATE: "EXCELLENT",
  INTERPRETING: "SATISFACTORY",
  NOT_INTERPRETING: "UNSATISFACTORY",
};

export interface OralCriteriaInput {
  taskCompletion: TaskCompletion | null;
  errorCount: ErrorCount | null;
  logic: LogicValue | null;
  activeVocabulary: ActiveVocabularyValue | null;
  questionResponses: QuestionResponseValue | null;
}

// null, если хотя бы один из 5 критериев ещё не заполнен преподавателем
// — предварительный результат не показывается, пока форма не заполнена
// целиком (не додумываем недостающие критерии).
export function computePreliminaryGrade(input: OralCriteriaInput): FinalGrade | null {
  const { taskCompletion, errorCount, logic, activeVocabulary, questionResponses } = input;
  if (!taskCompletion || !errorCount || !logic || !activeVocabulary || !questionResponses) {
    return null;
  }
  const ceilings = [
    CEILING_BY_ERROR_COUNT[errorCount],
    CEILING_BY_TASK_COMPLETION[taskCompletion],
    CEILING_BY_LOGIC[logic],
    CEILING_BY_ACTIVE_VOCABULARY[activeVocabulary],
    CEILING_BY_QUESTION_RESPONSES[questionResponses],
  ];
  const minRank = Math.min(...ceilings.map((g) => GRADE_RANK[g]));
  return RANK_TO_GRADE[minRank];
}
