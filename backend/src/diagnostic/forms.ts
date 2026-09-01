// English Start Profile — Этап 10: диспетчер "форм" объективной
// диагностики. Start Diagnostic (Этап 5) использует Form A
// (itemBank.ts), Промежуточная диагностика — Form B (itemBankB.ts,
// ТЗ Этапа 10: "Не использовать те же задания, что были в Start
// Diagnostic"). Раскладка по kind в одном месте — чтобы форма не
// выбиралась заново в каждом маршруте.
import { DIAGNOSTIC_ITEMS, DIAGNOSTIC_PASSAGES, findItem, findPassage, type DiagnosticItem, type DiagnosticPassage, type Skill } from "./itemBank";
import { DIAGNOSTIC_ITEMS_B, DIAGNOSTIC_PASSAGES_B, findItemB, findPassageB } from "./itemBankB";

export type DiagnosticForm = "A" | "B";

// START (и любой будущий диагностический прогон, для которого форма не
// оговорена отдельно) → Form A. PROGRESS → Form B. CREDIT здесь
// намеренно не упоминается: это Этап 5-овское зарезервированное, но
// никогда не заполнявшееся значение — Этап 9 держит его дремлющим (см.
// комментарий в analytics/credit.ts), эта функция не обязана его
// поддерживать содержательно.
export function formForKind(kind: string): DiagnosticForm {
  return kind === "PROGRESS" ? "B" : "A";
}

export function itemsForForm(form: DiagnosticForm): DiagnosticItem[] {
  return form === "B" ? DIAGNOSTIC_ITEMS_B : DIAGNOSTIC_ITEMS;
}

export function findItemForForm(form: DiagnosticForm, id: string): DiagnosticItem | undefined {
  return form === "B" ? findItemB(id) : findItem(id);
}

export function passagesForForm(form: DiagnosticForm): DiagnosticPassage[] {
  return form === "B" ? DIAGNOSTIC_PASSAGES_B : DIAGNOSTIC_PASSAGES;
}

export function findPassageForForm(form: DiagnosticForm, id: string): DiagnosticPassage | undefined {
  return form === "B" ? findPassageB(id) : findPassage(id);
}

export function getItemsForSkillInForm(form: DiagnosticForm, skill: Skill): DiagnosticItem[] {
  return itemsForForm(form).filter((i) => i.skill === skill);
}
