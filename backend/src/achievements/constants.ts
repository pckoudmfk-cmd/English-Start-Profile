// English Start Profile — Этап 8: справочники достижений.
//
// Ровно те категории, что перечислены в ТЗ (п.5 — "не добавляй
// дополнительные категории без необходимости"; п.15 описывает те же
// категории прозой — отдельной таксономии не завожу, см. комментарий у
// модели Achievement в schema.prisma).

export const EVENT_TYPES = ["CONFERENCE", "COMPETITION", "OLYMPIAD", "ACADEMIC", "PROJECT", "OTHER"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_TYPE_LABELS_RU: Record<EventType, string> = {
  CONFERENCE: "Конференция",
  COMPETITION: "Конкурс",
  OLYMPIAD: "Олимпиада",
  ACADEMIC: "Научно-практическое мероприятие",
  PROJECT: "Проект",
  OTHER: "Другое",
};

export const CLAIMED_RESULTS = ["PARTICIPANT", "PRIZE_PLACE", "WINNER", "PUBLISHED", "NOMINATION_WINNER", "OTHER"] as const;
export type ClaimedResult = (typeof CLAIMED_RESULTS)[number];
export const CLAIMED_RESULT_LABELS_RU: Record<ClaimedResult, string> = {
  PARTICIPANT: "Участник",
  PRIZE_PLACE: "Призовое место",
  WINNER: "Победитель",
  PUBLISHED: "Статья опубликована",
  NOMINATION_WINNER: "Победитель номинации",
  OTHER: "Другое",
};

export const ACHIEVEMENT_STATUSES = ["DRAFT", "PENDING", "CONFIRMED", "CONFIRMED_NO_POINT", "REJECTED", "NEEDS_CLARIFICATION"] as const;
export type AchievementStatus = (typeof ACHIEVEMENT_STATUSES)[number];
export const ACHIEVEMENT_STATUS_LABELS_RU: Record<AchievementStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На проверке",
  CONFIRMED: "Подтверждено",
  CONFIRMED_NO_POINT: "Подтверждено без квалификационного балла",
  REJECTED: "Отклонено",
  NEEDS_CLARIFICATION: "Требует уточнения",
};

// Статусы, которые студент считает "своими" (может редактировать/
// удалять/дозаполнять) — ТЗ п.4, 30: после отправки на проверку
// редактирование и удаление запрещены, единственный путь назад —
// NEEDS_CLARIFICATION (преподаватель явно попросил уточнить).
export const STUDENT_EDITABLE_STATUSES: AchievementStatus[] = ["DRAFT", "NEEDS_CLARIFICATION"];
export const STUDENT_DELETABLE_STATUSES: AchievementStatus[] = ["DRAFT"];

// Статусы, из которых доступны 4 прямых решения преподавателя —
// только "на проверке" (после уточнения студент повторно отправляет
// достижение, статус снова становится PENDING, см. routes/
// studentAchievements.ts submit).
export const TEACHER_REVIEWABLE_STATUSES: AchievementStatus[] = ["PENDING"];

// Статусы, из которых доступно "Изменить статус" (ТЗ п.30 — только
// после уже принятого решения, для исправления ошибки).
export const TEACHER_OVERRIDE_FROM_STATUSES: AchievementStatus[] = ["CONFIRMED", "CONFIRMED_NO_POINT", "REJECTED"];

export function normalizeForDuplicateCheck(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
