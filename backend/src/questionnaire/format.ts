// Форматирование ответа анкеты в человекочитаемый текст — общая
// функция для всех мест backend, где ответ анкеты показывается
// преподавателю (профиль студента, вкладка «Анкета»). Вынесена из
// routes/teacherDashboard.ts (Этап 6) в отдельный модуль на Этапе 7,
// когда понадобилась ещё и в routes/teacherStudentProfile.ts — чтобы
// не дублировать и не тащить друг у друга через незначащий импорт
// целого файла с роутами.
import { findQuestion } from "./definition";

export function formatAnswerForDisplay(code: string, value: unknown): string {
  const question = findQuestion(code);
  if (!question) return String(value);
  if (question.type === "SINGLE_CHOICE" && typeof value === "string") {
    return question.options?.find((o) => o.value === value)?.label ?? value;
  }
  if (question.type === "MULTI_CHOICE" && Array.isArray(value)) {
    const labels = value.map((v) => question.options?.find((o) => o.value === v)?.label ?? String(v));
    return labels.join(", ");
  }
  if (question.type === "MATRIX_SCALE_1_5" && value && typeof value === "object") {
    const items = question.matrixItems ?? [];
    return items.map((item) => `${item.label}: ${(value as Record<string, unknown>)[item.value] ?? "—"}`).join("; ");
  }
  if (typeof value === "number" || typeof value === "string") return String(value);
  return JSON.stringify(value);
}
