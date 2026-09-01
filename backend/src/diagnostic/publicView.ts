import {
  DIAGNOSTIC_BLOCKS,
  DIAGNOSTIC_PASSAGES,
  getItemsForSkill,
  type DiagnosticItem,
  type Skill,
} from "./itemBank";

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

export function getPublicBlocks() {
  return DIAGNOSTIC_BLOCKS.map((b) => ({
    skill: b.skill,
    titleRu: b.titleRu,
    instructionRu: b.instructionRu,
    items: getItemsForSkill(b.skill).map(toPublicItem),
  }));
}

export function getPublicPassages(): PublicPassage[] {
  return DIAGNOSTIC_PASSAGES.map((p) => ({
    id: p.id,
    skill: p.skill,
    contextType: p.contextType,
    titleRu: p.titleRu,
    contentEn: p.contentEn,
  }));
}
