import { api } from "./client";

export interface GroupPreview {
  id: string;
  name: string;
  specialty: string | null;
  course: string;
  academicYear: string;
  teacherName: string;
}

export interface PreviewResponse {
  group: GroupPreview;
  alreadyMember: boolean;
}

export interface JoinResponse {
  alreadyMember: boolean;
  group: GroupPreview;
  message?: string;
  membership?: { id: string; joinedAt: string };
}

export type AttemptStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export interface StudentGroupMembership {
  id: string;
  joinedAt: string;
  group: GroupPreview;
  // Анкетирование (Этап 4) и объективная диагностика (Этап 5) — два
  // разных модуля с разными данными, статусы не смешиваются.
  questionnaireStatus: AttemptStatus;
  questionnaireAttemptId: string | null;
  startDiagnosticStatus: AttemptStatus;
  startDiagnosticAttemptId: string | null;
}

export const studentGroupsApi = {
  previewCode: (code: string) => api.post<PreviewResponse>("/api/student/groups/preview", { code }),
  joinByCode: (code: string) => api.post<JoinResponse>("/api/student/groups/join", { code }),
  listMyGroups: () => api.get<StudentGroupMembership[]>("/api/student/groups"),
};
