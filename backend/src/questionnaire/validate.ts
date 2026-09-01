import { type QuestionDef } from "./definition";

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

// Один валидатор, управляемый метаданными вопроса, вместо 45 отдельных
// zod-схем — тип, варианты ответов и maxSelections уже описаны в
// definition.ts, дублировать их в схеме валидации незачем.
export function validateAnswerValue(question: QuestionDef, value: unknown): ValidationResult {
  switch (question.type) {
    case "TEXT":
    case "TEXTAREA": {
      if (typeof value !== "string") return { ok: false, message: "Ожидается текст." };
      if (value.length > 4000) return { ok: false, message: "Слишком длинный ответ." };
      return { ok: true };
    }
    case "SINGLE_CHOICE": {
      if (typeof value !== "string") return { ok: false, message: "Ожидается один вариант ответа." };
      const allowed = (question.options ?? []).map((o) => o.value);
      if (!allowed.includes(value)) return { ok: false, message: "Недопустимый вариант ответа." };
      return { ok: true };
    }
    case "MULTI_CHOICE": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        return { ok: false, message: "Ожидается список вариантов ответа." };
      }
      const allowed = new Set((question.options ?? []).map((o) => o.value));
      if (!value.every((v) => allowed.has(v))) {
        return { ok: false, message: "Недопустимый вариант ответа." };
      }
      if (new Set(value).size !== value.length) {
        return { ok: false, message: "Варианты ответа не должны повторяться." };
      }
      if (question.maxSelections && value.length > question.maxSelections) {
        return { ok: false, message: `Можно выбрать не более ${question.maxSelections}.` };
      }
      return { ok: true };
    }
    case "SCALE_1_5": {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
        return { ok: false, message: "Ожидается число от 1 до 5." };
      }
      return { ok: true };
    }
    case "MATRIX_SCALE_1_5": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, message: "Ожидается набор оценок по каждому навыку." };
      }
      const items = question.matrixItems ?? [];
      const allowedKeys = new Set(items.map((i) => i.value));
      const entries = Object.entries(value as Record<string, unknown>);
      if (!entries.every(([k]) => allowedKeys.has(k))) {
        return { ok: false, message: "Недопустимый навык в оценке." };
      }
      if (
        !entries.every(
          ([, v]) => typeof v === "number" && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
        )
      ) {
        return { ok: false, message: "Каждая оценка должна быть числом от 1 до 5." };
      }
      return { ok: true };
    }
    default:
      return { ok: false, message: "Неизвестный тип вопроса." };
  }
}
