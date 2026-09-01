// English Start Profile — Этап 10: общая логика завершения попытки
// объективной диагностики — используется и Start Diagnostic
// (routes/studentDiagnostic.ts, Form A), и Промежуточной диагностикой
// (routes/studentProgressCheck.ts, Form B). Вынесена в отдельный модуль,
// чтобы проверка полноты ответов и расчёт результата не дублировались
// между двумя маршрутами (тот же принцип "единая точка расчёта", что и
// в credit/service.ts на Этапе 9) — сама попытка (владение, статус,
// специфичные для формы проверки доступа) по-прежнему проверяется в
// каждом маршруте отдельно, т.к. эти проверки как раз и различаются.
import { prisma } from "../db";
import { itemsForForm, type DiagnosticForm } from "./forms";
import { computeResult } from "./scoring";

export class DiagnosticCompletionError extends Error {
  code: string;
  missing?: string[];
  constructor(code: string, message: string, missing?: string[]) {
    super(message);
    this.code = code;
    this.missing = missing;
  }
}

export function serializeDiagnosticResult(result: {
  overallCorrect: number;
  overallTotal: number;
  overallPercentage: number;
  skillBreakdownJson: string;
  diagnosticRange: string | null;
  computedAt: Date;
}) {
  return {
    overallCorrect: result.overallCorrect,
    overallTotal: result.overallTotal,
    overallPercentage: result.overallPercentage,
    skillBreakdown: JSON.parse(result.skillBreakdownJson),
    diagnosticRange: result.diagnosticRange,
    computedAt: result.computedAt,
  };
}

// Считает результат попытки и завершает её в ОДНОЙ транзакции — тот же
// приём, что и в Этапе 5: если попытка уже завершена, просто отдаёт
// уже посчитанный результат (идемпотентно), не пересчитывает.
export async function finalizeDiagnosticAttempt(
  attempt: { id: string; status: string; answers: { itemId: string; correct: boolean }[]; result: unknown },
  form: DiagnosticForm
) {
  if (attempt.status === "COMPLETED" && attempt.result) {
    return prisma.diagnosticResult.findUniqueOrThrow({ where: { attemptId: attempt.id } });
  }

  const answeredIds = new Set(attempt.answers.map((a) => a.itemId));
  const missing = itemsForForm(form).filter((i) => !answeredIds.has(i.id)).map((i) => i.id);
  if (missing.length > 0) {
    throw new DiagnosticCompletionError("INCOMPLETE", "Отвечены не все задания диагностики.", missing);
  }

  const computed = computeResult(form, attempt.answers);

  const [, result] = await prisma.$transaction([
    prisma.diagnosticAttempt.update({ where: { id: attempt.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.diagnosticResult.create({
      data: {
        attemptId: attempt.id,
        overallCorrect: computed.overallCorrect,
        overallTotal: computed.overallTotal,
        overallPercentage: computed.overallPercentage,
        skillBreakdownJson: JSON.stringify(computed.skillBreakdown),
        // diagnosticRange остаётся null — см. комментарий в schema.prisma
        // и docs/STAGE_5_REPORT.md: нет утверждённой матрицы порогов.
        // Этап 10 не отменяет это правило для Формы B.
      },
    }),
  ]);
  return result;
}
