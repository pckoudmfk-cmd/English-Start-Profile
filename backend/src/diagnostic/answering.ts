// English Start Profile — Этап 10: общая логика сохранения ответа на
// задание объективной диагностики — используется и Start Diagnostic
// (Form A), и Промежуточной диагностикой (Form B). Вынесена, чтобы не
// дублировать между routes/studentDiagnostic.ts и
// routes/studentProgressCheck.ts (тот же принцип, что и в
// diagnostic/completion.ts).
import { prisma } from "../db";
import { findItemForForm, type DiagnosticForm } from "./forms";

export class DiagnosticAnswerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface AnswerFeedback {
  correct: boolean;
  correctOptionIndex: number;
  feedbackRu: string;
}

// Ответ фиксируется один раз (уникальный индекс attemptId+itemId) —
// повторная отправка (двойной клик, повтор сети) идемпотентно
// возвращает уже сохранённый результат, не позволяет "переотвечать".
export async function answerDiagnosticItem(attemptId: string, itemId: string, selectedOptionIndex: number, form: DiagnosticForm): Promise<AnswerFeedback> {
  const item = findItemForForm(form, itemId);
  if (!item) {
    throw new DiagnosticAnswerError("UNKNOWN_ITEM", "Неизвестное задание.");
  }
  if (selectedOptionIndex < 0 || selectedOptionIndex >= item.optionsEn.length) {
    throw new DiagnosticAnswerError("INVALID_ANSWER", "Недопустимый вариант ответа.");
  }

  const existingAnswer = await prisma.diagnosticAnswer.findUnique({
    where: { attemptId_itemId: { attemptId, itemId: item.id } },
  });
  if (existingAnswer) {
    return {
      correct: existingAnswer.correct,
      correctOptionIndex: item.correctOptionIndex,
      feedbackRu: existingAnswer.correct ? "Верно!" : `Неверно. Правильный ответ: «${item.optionsEn[item.correctOptionIndex]}».`,
    };
  }

  const correct = selectedOptionIndex === item.correctOptionIndex;
  await prisma.diagnosticAnswer.create({
    data: { attemptId, itemId: item.id, skill: item.skill, selectedOptionIndex, correct },
  });

  return {
    correct,
    correctOptionIndex: item.correctOptionIndex,
    feedbackRu: correct ? "Верно!" : `Неверно. Правильный ответ: «${item.optionsEn[item.correctOptionIndex]}».`,
  };
}
