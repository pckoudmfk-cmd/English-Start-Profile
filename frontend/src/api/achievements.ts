import { api, fileUrl, uploadFile } from "./client";

// Типы отражают форму ответов backend (см. backend/src/routes/
// studentAchievements.ts, teacherAchievements.ts, achievements/constants.ts)
// один в один.

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

export type AchievementStatus = "DRAFT" | "PENDING" | "CONFIRMED" | "CONFIRMED_NO_POINT" | "REJECTED" | "NEEDS_CLARIFICATION";
export const ACHIEVEMENT_STATUS_LABELS_RU: Record<AchievementStatus, string> = {
  DRAFT: "Черновик",
  PENDING: "На проверке",
  CONFIRMED: "Подтверждено",
  CONFIRMED_NO_POINT: "Подтверждено без квалификационного балла",
  REJECTED: "Отклонено",
  NEEDS_CLARIFICATION: "Требует уточнения",
};
export const ACHIEVEMENT_STATUS_TONE: Record<AchievementStatus, "slate" | "brand" | "sky"> = {
  DRAFT: "slate",
  PENDING: "sky",
  CONFIRMED: "brand",
  CONFIRMED_NO_POINT: "slate",
  REJECTED: "slate",
  NEEDS_CLARIFICATION: "sky",
};

export interface EvidenceEntry {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface AchievementFormFields {
  groupId?: string;
  eventName: string;
  eventDate: string;
  organizer: string;
  eventType: EventType;
  claimedResult: ClaimedResult;
  claimedResultOther?: string | null;
  resultPlace?: string | null;
  resultNomination?: string | null;
  description?: string | null;
}

export interface StudentAchievement extends AchievementFormFields {
  id: string;
  groupId: string;
  status: AchievementStatus;
  qualificationPoint: number;
  teacherComment: string | null;
  createdAt: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  evidence: EvidenceEntry[];
  possibleDuplicates?: { id: string; eventName: string; eventDate: string; status: AchievementStatus }[];
}

export interface TeacherAchievementRow {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  eventName: string;
  eventDate: string;
  eventType: EventType;
  claimedResult: ClaimedResult;
  status: AchievementStatus;
  qualificationPoint: number;
  hasEvidence: boolean;
}

export interface TeacherAchievementDetail {
  id: string;
  student: { id: string; fullName: string };
  group: { id: string; name: string; course: string; academicYear: string };
  eventName: string;
  eventDate: string;
  organizer: string;
  eventType: EventType;
  claimedResult: ClaimedResult;
  claimedResultOther: string | null;
  resultPlace: string | null;
  resultNomination: string | null;
  description: string | null;
  status: AchievementStatus;
  qualificationPoint: number;
  teacherComment: string | null;
  createdAt: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  evidence: EvidenceEntry[];
  possibleDuplicates: { id: string; eventName: string; eventDate: string; status: AchievementStatus }[];
  auditLog: { id: string; actorId: string; action: string; fromValue: string | null; toValue: string | null; reason: string | null; createdAt: string }[];
}

export type DecisionAction = "CONFIRM" | "CONFIRM_NO_POINT" | "REQUEST_CLARIFICATION" | "REJECT" | "CHANGE_STATUS";

export interface TeacherFilters {
  groupId?: string;
  studentId?: string;
  eventType?: EventType;
  status?: AchievementStatus;
  claimedResult?: ClaimedResult;
  dateFrom?: string;
  dateTo?: string;
  hasPoint?: boolean;
  pendingOnly?: boolean;
  sort?: "date" | "student" | "status" | "type";
}

function buildQuery(filters: TeacherFilters): string {
  const qs = new URLSearchParams();
  if (filters.groupId) qs.set("groupId", filters.groupId);
  if (filters.studentId) qs.set("studentId", filters.studentId);
  if (filters.eventType) qs.set("eventType", filters.eventType);
  if (filters.status) qs.set("status", filters.status);
  if (filters.claimedResult) qs.set("claimedResult", filters.claimedResult);
  if (filters.dateFrom) qs.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) qs.set("dateTo", filters.dateTo);
  if (filters.hasPoint !== undefined) qs.set("hasPoint", String(filters.hasPoint));
  if (filters.pendingOnly) qs.set("pendingOnly", "true");
  if (filters.sort) qs.set("sort", filters.sort);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const studentAchievementsApi = {
  list: (groupId?: string) => api.get<StudentAchievement[]>(`/api/student/achievements${groupId ? `?groupId=${groupId}` : ""}`),
  get: (id: string) => api.get<StudentAchievement>(`/api/student/achievements/${id}`),
  create: (data: { groupId: string } & AchievementFormFields) => api.post<StudentAchievement>("/api/student/achievements", data),
  update: (id: string, data: Partial<AchievementFormFields>) => api.put<StudentAchievement>(`/api/student/achievements/${id}`, data),
  submit: (id: string) => api.post<StudentAchievement>(`/api/student/achievements/${id}/submit`),
  remove: (id: string) => api.delete<void>(`/api/student/achievements/${id}`),
  uploadEvidence: (id: string, file: File) => uploadFile<EvidenceEntry>(`/api/student/achievements/${id}/evidence`, file),
  removeEvidence: (id: string, evidenceId: string) => api.delete<void>(`/api/student/achievements/${id}/evidence/${evidenceId}`),
  evidenceUrl: (id: string, evidenceId: string) => fileUrl(`/api/student/achievements/${id}/evidence/${evidenceId}`),
};

export const teacherAchievementsApi = {
  list: (filters: TeacherFilters = {}) => api.get<TeacherAchievementRow[]>(`/api/teacher/achievements${buildQuery(filters)}`),
  get: (id: string) => api.get<TeacherAchievementDetail>(`/api/teacher/achievements/${id}`),
  decide: (id: string, body: { action: DecisionAction; targetStatus?: AchievementStatus; comment?: string }) =>
    api.patch<{ id: string; status: AchievementStatus; qualificationPoint: number; teacherComment: string | null; verifiedAt: string }>(
      `/api/teacher/achievements/${id}/decision`,
      body
    ),
  evidenceUrl: (id: string, evidenceId: string) => fileUrl(`/api/teacher/achievements/${id}/evidence/${evidenceId}`),
};
