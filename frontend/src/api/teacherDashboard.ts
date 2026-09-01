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

// Этап 9: полный "Итог" зачёта (analytics/credit.ts) — заменил собой
// OralPartStatus в этой строке (был только статус устной части).
export type CreditOverallStatus = "NOT_ADMITTED" | "ADMITTED" | "ORAL_REQUIRED" | "COMPLETED";

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
  creditStatus: CreditOverallStatus;
  creditStatusLabel: string;
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
    // Этап 9: "Готовы к зачёту" — теперь реальное число студентов с
    // "Итог" = "Зачёт завершён" (было честно implemented:false до
    // появления полного модуля "Зачёт").
    credit: { implemented: true; completedCount: number; total: number };
  };
  attention: AttentionEntry[];
  opportunities: OpportunityEntry[];
  // Этап 10: реальные числа — сколько студентов назначено/завершило
  // Промежуточную диагностику в этой группе.
  progress: { status: "NOT_CONDUCTED" | "CONDUCTED"; recommendedAfterMonths: [number, number]; assignedCount: number; completedCount: number; total: number };
  credit: {
    // Этап 9: все 4 подпункта теперь реальны.
    vocabulary: { implemented: true; confirmedCount: number; underReviewCount: number; total: number };
    lexicoGrammarTest: { implemented: true; completedCount: number; total: number };
    qualificationPoints: { implemented: true; total: number; studentsWithFivePlus: number };
    oralPart: { implemented: true; exemptedCount: number; requiredCount: number };
  };
  // Этап 9: 8 сводных чисел экрана "Зачёт" (ТЗ п.29).
  creditSummary: {
    totalStudents: number;
    admissionConfirmed: number;
    dictionaryUnderReview: number;
    testCompleted: number;
    fivePlusPoints: number;
    oralExempted: number;
    oralPending: number;
    creditCompleted: number;
  };
  achievementsPendingReview: number;
  students: DashboardStudentRow[];
}

export const teacherDashboardApi = {
  getDashboard: (groupId: string) => api.get<DashboardResponse>(`/api/teacher/groups/${groupId}/dashboard`),
};
