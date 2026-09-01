import { api } from "./client";
import type { BlockDef } from "../questionnaire/definition";

// English Start Profile — Этап 10: ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА. Типы
// отражают форму ответов backend (routes/studentProgressCheck.ts,
// routes/teacherProgressCheck.ts) один в один.

export type ProgressAttemptStatus = "NOT_ASSIGNED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type Skill = "GRAMMAR" | "VOCABULARY" | "READING" | "LISTENING";

export interface ProgressOverview {
  assigned: boolean;
  periodStartAt: string | null;
  periodEndAt: string | null;
  openNow: boolean;
  test: { status: ProgressAttemptStatus; attemptId: string | null };
  questionnaire: { status: ProgressAttemptStatus; attemptId: string | null };
}

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
export interface ProgressTestAttempt {
  id: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
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

export interface ProgressQuestionnaireAttempt {
  id: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  blocks: Pick<BlockDef, "id" | "title">[];
  answers: Record<string, unknown>;
}

export const studentProgressCheckApi = {
  getOverview: (groupId: string) => api.get<ProgressOverview>(`/api/student/progress-check/${groupId}`),
  test: {
    open: (groupId: string) => api.get<ProgressTestAttempt>(`/api/student/progress-check/${groupId}/test`),
    answerItem: (groupId: string, itemId: string, selectedOptionIndex: number) =>
      api.patch<AnswerFeedback>(`/api/student/progress-check/${groupId}/test/items/${itemId}/answer`, { selectedOptionIndex }),
    complete: (groupId: string) => api.post<DiagnosticResultResponse>(`/api/student/progress-check/${groupId}/test/complete`),
    getResult: (groupId: string) => api.get<DiagnosticResultResponse>(`/api/student/progress-check/${groupId}/test/result`),
  },
  questionnaire: {
    open: (groupId: string) => api.get<ProgressQuestionnaireAttempt>(`/api/student/progress-check/${groupId}/questionnaire`),
    saveAnswer: (groupId: string, code: string, value: unknown) =>
      api.put<void>(`/api/student/progress-check/${groupId}/questionnaire/answers`, { code, value }),
    complete: (groupId: string) => api.post<ProgressQuestionnaireAttempt>(`/api/student/progress-check/${groupId}/questionnaire/complete`),
  },
  getSummary: (groupId: string) => api.get<ProgressCheckSummary>(`/api/student/progress-check/${groupId}/summary`),
};

// --- Сравнение "Старт → Сейчас → Что изменилось" --------------------------

export interface SkillComparisonRow {
  skill: Skill;
  label: string;
  start: number | null;
  now: number | null;
  changePoints: number | null;
}
interface MetricComparison {
  start: number | null;
  now: number | null;
  change: number | null;
}
interface GoalEntry {
  code: string;
  label: string;
}
export interface ProgressCheckSummary {
  progressStatus: ProgressAttemptStatus;
  assignedAt: string | null;
  periodStartAt: string | null;
  periodEndAt: string | null;
  startCompletedAt: string | null;
  progressCompletedAt: string | null;
  monthsSinceStart: number | null;
  skillTable: SkillComparisonRow[];
  selfAssessment: MetricComparison;
  motivation: MetricComparison;
  autonomy: MetricComparison;
  goals: { start: GoalEntry[]; now: GoalEntry[]; added: GoalEntry[]; removed: GoalEntry[]; kept: GoalEntry[] };
  achievements: { atStart: number; now: number; change: number };
}

// --- Преподаватель ---------------------------------------------------------

export interface RosterEntry {
  studentId: string;
  fullName: string;
  startDiagnosticCompleted: boolean;
  status: ProgressAttemptStatus;
  periodStartAt: string | null;
  periodEndAt: string | null;
  assignedAt: string | null;
  completedAt: string | null;
}
export type AssignOutcome = "ASSIGNED" | "ALREADY_ASSIGNED";

export const teacherProgressCheckApi = {
  getRoster: (groupId: string) => api.get<RosterEntry[]>(`/api/teacher/progress-check/groups/${groupId}/roster`),
  assign: (groupId: string, body: { studentIds: string[]; periodStartAt: string; periodEndAt?: string | null }) =>
    api.post<{ results: { studentId: string; outcome: AssignOutcome }[] }>(`/api/teacher/progress-check/groups/${groupId}/assign`, body),
  getComparison: (groupId: string, studentId: string) => api.get<ProgressCheckSummary>(`/api/teacher/progress-check/groups/${groupId}/students/${studentId}/summary`),
};
