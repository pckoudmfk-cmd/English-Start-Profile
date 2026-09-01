import { api } from "./client";

export type Skill = "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING";
export type AttemptStatus = "IN_PROGRESS" | "COMPLETED";

export interface PublicDiagnosticItem {
  id: string;
  skill: Skill;
  passageId?: string;
  promptEn: string;
  optionsEn: string[];
}

export interface DiagnosticBlock {
  skill: Skill;
  titleRu: string;
  instructionRu: string;
  items: PublicDiagnosticItem[];
}

export interface DiagnosticPassage {
  id: string;
  skill: "READING" | "LISTENING";
  contextType: string;
  titleRu: string;
  contentEn: string;
}

export interface StoredAnswer {
  selectedOptionIndex: number;
  correct: boolean;
}

export interface DiagnosticAttemptResponse {
  id: string;
  status: AttemptStatus;
  startedAt: string;
  completedAt: string | null;
  blocks: DiagnosticBlock[];
  passages: DiagnosticPassage[];
  totalItems: number;
  answers: Record<string, StoredAnswer>;
}

export interface AnswerFeedback {
  correct: boolean;
  correctOptionIndex: number;
  feedbackRu: string;
}

export interface SkillBreakdownEntry {
  skill: Skill;
  correct: number;
  total: number;
  percentage: number;
}

export interface DiagnosticResultResponse {
  overallCorrect: number;
  overallTotal: number;
  overallPercentage: number;
  skillBreakdown: SkillBreakdownEntry[];
  diagnosticRange: string | null;
  computedAt: string;
}

export const diagnosticApi = {
  startOrResume: (groupId: string) => api.post<DiagnosticAttemptResponse>("/api/student/diagnostic/attempts", { groupId }),
  getAttempt: (attemptId: string) => api.get<DiagnosticAttemptResponse>(`/api/student/diagnostic/attempts/${attemptId}`),
  answerItem: (attemptId: string, itemId: string, selectedOptionIndex: number) =>
    api.post<AnswerFeedback>(`/api/student/diagnostic/attempts/${attemptId}/items/${itemId}/answer`, { selectedOptionIndex }),
  complete: (attemptId: string) => api.post<DiagnosticResultResponse>(`/api/student/diagnostic/attempts/${attemptId}/complete`),
  getResult: (attemptId: string) => api.get<DiagnosticResultResponse>(`/api/student/diagnostic/attempts/${attemptId}/result`),
};
