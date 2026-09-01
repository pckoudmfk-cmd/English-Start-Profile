import { api } from "./client";
import type { AttemptStatus, CreditOverallStatus, GapCategory, OralPartStatus } from "./teacherDashboard";
import type { AchievementStatus, ClaimedResult, EventType } from "./achievements";

// Типы отражают форму ответов backend (см. backend/src/routes/
// teacherStudentProfile.ts) — намеренно 1:1, три отдельных маршрута
// вместо одного, тот же принцип "не тянуть лишнее" (ТЗ Этапа 7, п.24):
// Обзор лёгкий, полные ответы анкеты и полная история диагностики
// подгружаются отдельно, только когда открыта соответствующая вкладка.

export type GoalStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_ACHIEVED";
export type NoteType = "OBSERVATION" | "RECOMMENDATION" | "AGREEMENT" | "IMPORTANT" | "EVENT_PREP";

export interface RecommendationEntry {
  label: string;
  reasonLines: string[];
  source: string;
}

export interface GoalEntry {
  code: string;
  label: string;
  status: GoalStatus;
  updatedAt: string | null;
}

export interface SelfAssessmentDetailEntry {
  skill: string;
  selfAssessment: number | null;
  objectivePercentage: number | null;
  hasObjectiveComparison: boolean;
}

export interface NoteEntry {
  id: string;
  text: string;
  noteType: NoteType | null;
  createdAt: string;
}

export interface OverviewResponse {
  student: {
    id: string;
    fullName: string;
    email: string;
    specialty: string | null;
    course: string | null;
    academicYear: string | null;
    group: { id: string; name: string };
  };
  header: {
    diagnosticStatus: AttemptStatus;
    creditStatusLabel: string;
  };
  kpi: {
    diagnosticPercentage: number | null;
    selfAssessment: number | null;
    gapCategory: GapCategory | null;
    isLargeGap: boolean;
    motivation: number | null;
    autonomy: number | null;
    // Этап 8: реальные данные модуля достижений.
    qualificationPoints: { implemented: true; points: number; oralPartStatus: OralPartStatus; pointsUntilExemption: number };
    // Этап 9: полный "Итог" зачёта (было honest-стабом до появления модуля).
    creditStatus: { implemented: true; status: CreditOverallStatus; statusLabel: string };
  };
  overview: {
    available: boolean;
    strengths: string[];
    weaknesses: string[];
    potentialBadges: string[];
    recommendations: RecommendationEntry[];
  };
  selfAssessmentDetail: SelfAssessmentDetailEntry[] | null;
  motivationAndLearning: {
    motivation: number | null;
    autonomy: number | null;
    willingnessToWork: number | null;
    preferredMethods: string[];
    barriers: string[];
    neededSupport: string[];
  } | null;
  goals: {
    mainGoal: string | null;
    yearGoals: GoalEntry[];
    willingnessToWork: number | null;
    plannedActions: string[];
  };
  achievements: {
    implemented: true;
    portfolioCount: number;
    resultfulCount: number;
    list: {
      id: string;
      eventName: string;
      eventDate: string;
      eventType: EventType;
      claimedResult: ClaimedResult;
      status: AchievementStatus;
      qualificationPoint: number;
    }[];
  };
  // Этап 9: полный конвейер зачёта (ТЗ п.32).
  credit: {
    implemented: true;
    overallStatus: CreditOverallStatus;
    overallStatusLabel: string;
    dictionary: { status: string | null; statusLabel: string; wordCount: number | null };
    test: { status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; attemptsUsed: number; maxAttempts: number; result: { correctCount: number; totalCount: number } | null };
    qualificationPoints: { points: number; oralPartExempt: boolean; pointsUntilExemption: number };
    oral: { status: string; topic: { id: string; en: string; ru: string } | null; preliminaryGrade: string | null; finalGrade: string | null; exemptionReason: string | null };
  };
  progress: {
    status: "NOT_CONDUCTED";
    recommendedAfterMonths: [number, number];
    extracurricularActivity: { resultfulCount: number };
  };
  notes: NoteEntry[];
}

export interface QuestionnaireSection {
  id: string;
  title: string;
  items: { question: string; answer: string }[];
}

export interface QuestionnaireTabResponse {
  status: AttemptStatus;
  completedAt?: string | null;
  sections: QuestionnaireSection[];
}

export interface DiagnosticHistoryEntry {
  kind: "START" | "PROGRESS" | "CREDIT";
  label: string;
  status: AttemptStatus;
  completedAt: string | null;
  overallPercentage: number | null;
  skillBreakdown: { skill: string; correct: number; total: number; percentage: number }[] | null;
  diagnosticRange: string | null;
}

export interface SkillTableRow {
  skill: string;
  label: string;
  assessed: boolean;
  start: number | null;
  progress: number | null;
  final: number | null;
  changePoints: number | null;
}

export interface DiagnosticTabResponse {
  history: DiagnosticHistoryEntry[];
  skillTable: SkillTableRow[];
  hasChangeSummary: boolean;
}

export const teacherStudentProfileApi = {
  getOverview: (groupId: string, studentId: string) =>
    api.get<OverviewResponse>(`/api/teacher/groups/${groupId}/students/${studentId}`),
  getQuestionnaire: (groupId: string, studentId: string) =>
    api.get<QuestionnaireTabResponse>(`/api/teacher/groups/${groupId}/students/${studentId}/questionnaire`),
  getDiagnostic: (groupId: string, studentId: string) =>
    api.get<DiagnosticTabResponse>(`/api/teacher/groups/${groupId}/students/${studentId}/diagnostic`),
  setGoalStatus: (groupId: string, studentId: string, goalCode: string, status: GoalStatus) =>
    api.put<{ goalCode: string; status: GoalStatus; updatedAt: string }>(
      `/api/teacher/groups/${groupId}/students/${studentId}/goals/${goalCode}`,
      { status }
    ),
  addNote: (groupId: string, studentId: string, text: string, noteType?: NoteType) =>
    api.post<NoteEntry>(`/api/teacher/groups/${groupId}/students/${studentId}/notes`, { text, noteType }),
};
