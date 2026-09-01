import { api } from "./client";

// Типы отражают форму ответа backend (см. backend/src/routes/teacherDashboard.ts)
// один в один — намеренно, чтобы не заводить отдельный "фронтовый" слой
// трансформации данных для Dashboard.

export type AttemptStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type GapCategory = "MATCHES" | "SELF_HIGHER" | "SELF_LOWER";

export interface AttentionFactor {
  label: string;
  dataLines: string[];
  source: string;
}

export interface AttentionEntry {
  studentId: string;
  fullName: string;
  primaryReason: string;
  keyMetricLabel: string;
  severity: number;
  factors: AttentionFactor[];
}

export interface OpportunityEntry {
  studentId: string;
  fullName: string;
  potentialLabel: string;
  reasonText: string;
}

export interface DashboardStudentRow {
  studentId: string;
  fullName: string;
  questionnaireStatus: AttemptStatus;
  diagnosticStatus: AttemptStatus;
  diagnosticPercentage: number | null;
  selfAssessment: number | null;
  gapCategory: GapCategory | null;
  isLargeGap: boolean;
  motivation: number | null;
  autonomy: number | null;
  developmentArea: string | null;
  potentialLabel: string | null;
  qualificationPoints: number | null;
  creditStatus: string | null;
}

export interface DashboardResponse {
  group: {
    id: string;
    name: string;
    specialty: string | null;
    status: "ACTIVE" | "ARCHIVED";
    course: { id: string; name: string };
    academicYear: { id: string; name: string };
  };
  studentCount: number;
  kpi: {
    diagnosticCompletion: { completed: number; total: number };
    avgDiagnosticPercentage: number | null;
    avgMotivation: number | null;
    avgAutonomy: number | null;
    qualificationPoints: { implemented: false };
    credit: { implemented: false };
  };
  attention: AttentionEntry[];
  opportunities: OpportunityEntry[];
  progress: { status: "NOT_CONDUCTED"; recommendedAfterMonths: [number, number] };
  credit: { implemented: false };
  students: DashboardStudentRow[];
}

export interface TeacherStudentProfile {
  student: {
    id: string;
    fullName: string;
    email: string;
    specialty: string | null;
    course: string | null;
    academicYear: string | null;
  };
  questionnaire: {
    status: AttemptStatus;
    completedAt: string | null;
    answers: { question: string; answer: string }[];
  } | null;
  diagnostic: {
    status: AttemptStatus;
    completedAt: string | null;
    overallPercentage: number | null;
    skillBreakdown: { skill: string; correct: number; total: number; percentage: number }[] | null;
    diagnosticRange: string | null;
  } | null;
  metrics: {
    selfAssessment: number | null;
    motivation: number | null;
    autonomy: number | null;
    gapCategory: GapCategory | null;
  };
  notes: { id: string; text: string; createdAt: string }[];
}

export const teacherDashboardApi = {
  getDashboard: (groupId: string) => api.get<DashboardResponse>(`/api/teacher/groups/${groupId}/dashboard`),
  getStudentProfile: (groupId: string, studentId: string) =>
    api.get<TeacherStudentProfile>(`/api/teacher/groups/${groupId}/students/${studentId}`),
  addNote: (groupId: string, studentId: string, text: string) =>
    api.post<{ id: string; text: string; createdAt: string }>(
      `/api/teacher/groups/${groupId}/students/${studentId}/notes`,
      { text }
    ),
};
