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

export const teacherDashboardApi = {
  getDashboard: (groupId: string) => api.get<DashboardResponse>(`/api/teacher/groups/${groupId}/dashboard`),
};
