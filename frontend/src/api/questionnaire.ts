import { api } from "./client";
import type { BlockDef } from "../questionnaire/definition";

export type AttemptStatus = "IN_PROGRESS" | "COMPLETED";

export interface AttemptResponse {
  id: string;
  status: AttemptStatus;
  startedAt: string;
  completedAt: string | null;
  blocks: Pick<BlockDef, "id" | "title">[];
  answers: Record<string, unknown>;
}

export interface CompleteError {
  error: "INCOMPLETE";
  message: string;
  missing: string[];
}

export const questionnaireApi = {
  startOrResume: (groupId: string) => api.post<AttemptResponse>("/api/student/questionnaire/attempts", { groupId }),
  getAttempt: (attemptId: string) => api.get<AttemptResponse>(`/api/student/questionnaire/attempts/${attemptId}`),
  saveAnswer: (attemptId: string, code: string, value: unknown) =>
    api.put<void>(`/api/student/questionnaire/attempts/${attemptId}/answers`, { code, value }),
  complete: (attemptId: string) =>
    api.post<AttemptResponse>(`/api/student/questionnaire/attempts/${attemptId}/complete`),
};
