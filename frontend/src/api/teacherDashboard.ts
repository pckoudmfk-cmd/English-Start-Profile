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

// "REQUIRED" | "EXEMPTED" — статус устной части зачёта (Этап 8),
// единственное, однозначно вычислимое из одних квалификационных
// баллов (см. backend/src/analytics/qualification.ts).
export type OralPartStatus = "REQUIRED" | "EXEMPTED";

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
  qualificationPoints: number;
  creditStatus: OralPartStatus;
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
    // Этап 8: реальные данные модуля достижений.
    qualificationPoints: { implemented: true; total: number; studentsWithFivePlus: number };
    // "Готовы к зачёту" целиком — по-прежнему не реализовано (нужны ещё
    // допуск по словарю и лексико-грамматический тест).
    credit: { implemented: false };
  };
  attention: AttentionEntry[];
  opportunities: OpportunityEntry[];
  progress: { status: "NOT_CONDUCTED"; recommendedAfterMonths: [number, number] };
  credit: {
    vocabulary: { implemented: false };
    lexicoGrammarTest: { implemented: false };
    qualificationPoints: { implemented: true; total: number; studentsWithFivePlus: number };
    oralPart: { implemented: true; exemptedCount: number; requiredCount: number };
  };
  achievementsPendingReview: number;
  students: DashboardStudentRow[];
}

export const teacherDashboardApi = {
  getDashboard: (groupId: string) => api.get<DashboardResponse>(`/api/teacher/groups/${groupId}/dashboard`),
};
