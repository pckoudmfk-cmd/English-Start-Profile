import { DIAGNOSTIC_BLOCKS, type DiagnosticItem, type Skill } from "./itemBank";
import { getItemsForSkillInForm, passagesForForm, type DiagnosticForm } from "./forms";

// Единственное место, где DiagnosticItem превращается в то, что реально
// уходит студенту. correctOptionIndex сюда НЕ попадает — TypeScript
// здесь не спасает (Express всё равно сериализует то, что ему дали),
// поэтому "не включать поле" сделано явным перечислением полей ответа,
// а не деструктуризацией/omit, которую легко случайно расширить.
export interface PublicDiagnosticItem {
  id: string;
  skill: Skill;
  passageId?: string;
  promptEn: string;
  optionsEn: string[];
}

export function toPublicItem(item: DiagnosticItem): PublicDiagnosticItem {
  return {
    id: item.id,
    skill: item.skill,
    passageId: item.passageId,
    promptEn: item.promptEn,
    optionsEn: item.optionsEn,
  };
}

export interface PublicPassage {
  id: string;
  skill: "READING" | "LISTENING";
  contextType: string;
  titleRu: string;
  contentEn: string;
}

// Этап 10: параметризовано формой (A — Start Diagnostic, B —
// Промежуточная диагностика, см. diagnostic/forms.ts). DIAGNOSTIC_BLOCKS
// (заголовки/инструкции разделов) — общие для обеих форм: формулировка
// инструкции не зависит от конкретного содержания заданий, поэтому не
// дублируется в itemBankB.ts.
export function getPublicBlocks(form: DiagnosticForm) {
  return DIAGNOSTIC_BLOCKS.map((b) => ({
    skill: b.skill,
    titleRu: b.titleRu,
    instructionRu: b.instructionRu,
    items: getItemsForSkillInForm(form, b.skill).map(toPublicItem),
  }));
}

export function getPublicPassages(form: DiagnosticForm): PublicPassage[] {
  return passagesForForm(form).map((p) => ({
    id: p.id,
    skill: p.skill,
    contextType: p.contextType,
    titleRu: p.titleRu,
    contentEn: p.contentEn,
  }));
}
