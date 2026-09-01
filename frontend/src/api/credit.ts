import { api, fileUrl, uploadFile } from "./client";

// Типы и справочники отражают backend/src/credit/constants.ts и
// backend/src/analytics/credit.ts один в один (тот же приём, что и в
// api/achievements.ts на Этапе 8).

export const DICTIONARY_STATUS_LABELS_RU: Record<string, string> = {
  SUBMITTED: "Предоставлен",
  UNDER_REVIEW: "На проверке",
  NEEDS_CLARIFICATION: "Требует уточнения",
  CONFIRMED: "Подтверждён",
  REJECTED: "Отклонён",
};
export const DICTIONARY_NOT_SUBMITTED_LABEL_RU = "Не предоставлен";

export const GRAMMAR_TOPICS = [
  "PRESENT_SIMPLE",
  "PRESENT_PERFECT",
  "PRESENT_CONTINUOUS",
  "PRESENT_PERFECT_CONTINUOUS",
  "PAST_SIMPLE",
  "FUTURE_SIMPLE",
  "PASSIVE_VOICE",
  "QUANTIFIERS",
  "OTHER",
  "PHRASAL_VERBS",
  "COMPARISON_DEGREES",
] as const;
export type GrammarTopic = (typeof GRAMMAR_TOPICS)[number];
export const GRAMMAR_TOPIC_LABELS_RU: Record<GrammarTopic, string> = {
  PRESENT_SIMPLE: "Present Simple",
  PRESENT_PERFECT: "Present Perfect",
  PRESENT_CONTINUOUS: "Present Continuous",
  PRESENT_PERFECT_CONTINUOUS: "Present Perfect Continuous",
  PAST_SIMPLE: "Past Simple",
  FUTURE_SIMPLE: "Future Simple",
  PASSIVE_VOICE: "Passive Voice",
  QUANTIFIERS: "some/any/few/a few/little/a little",
  OTHER: "Другое",
  PHRASAL_VERBS: "Фразовые глаголы с предлогами",
  COMPARISON_DEGREES: "Степени сравнения прилагательных",
};

export const CREDIT_TEST_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type CreditTestDifficulty = (typeof CREDIT_TEST_DIFFICULTIES)[number];
export const CREDIT_TEST_DIFFICULTY_LABELS_RU: Record<CreditTestDifficulty, string> = {
  EASY: "Лёгкое",
  MEDIUM: "Среднее",
  HARD: "Сложное",
};

export interface OralTopic {
  id: string;
  en: string;
  ru: string;
}

export const TASK_COMPLETION_LABELS_RU: Record<string, string> = {
  NOT_DONE: "не выполнена",
  HALF: "выполнена наполовину",
  THREE_QUARTERS: "выполнена на три четверти",
  DONE: "выполнена",
};
export const ERROR_COUNT_LABELS_RU: Record<string, string> = {
  NONE: "0",
  ONE_TWO: "1–2",
  THREE_FIVE: "3–5",
  SIX_NINE: "6–9",
  MORE_THAN_TEN: "более 10",
};
export const ERROR_NATURE_LABELS_RU: Record<string, string> = {
  GRAMMAR: "грамматические",
  LEXICAL: "лексические",
  PHONETIC: "фонетические",
};
export const LOGIC_LABELS_RU: Record<string, string> = {
  BROKEN: "нарушена",
  PARTIAL: "частично соблюдена",
  MOSTLY: "в основном соблюдена",
  COHERENT: "логичная и связная",
};
export const ACTIVE_VOCABULARY_LABELS_RU: Record<string, string> = {
  USED: "используется",
  INSUFFICIENT: "используется недостаточно",
};
export const QUESTION_RESPONSE_LABELS_RU: Record<string, string> = {
  NOT_INTERPRETING: "не интерпретирует вопросы",
  INTERPRETING: "интерпретирует вопросы",
  ADEQUATE: "даёт адекватные ответы",
};
export const FINAL_GRADE_LABELS_RU: Record<string, string> = {
  UNSATISFACTORY: "неудовлетворительно",
  SATISFACTORY: "удовлетворительно",
  GOOD: "хорошо",
  EXCELLENT: "отлично",
};

export const CREDIT_OVERALL_STATUS_LABELS_RU: Record<string, string> = {
  NOT_ADMITTED: "Не допущен",
  ADMITTED: "Допущен",
  ORAL_REQUIRED: "Устная часть обязательна",
  COMPLETED: "Зачёт завершён",
};
export const STUDENT_TOP_STATUS_LABELS_RU: Record<string, string> = {
  REQUIREMENTS_NOT_MET: "Требования не выполнены",
  IN_PROGRESS: "В процессе",
  ADMITTED: "Допущен",
  TEST_COMPLETED: "Тест выполнен",
  ORAL_REQUIRED: "Устная часть обязательна",
  ORAL_DONE: "Устная часть выполнена",
  COMPLETED: "Зачёт завершён",
};

export interface DictionaryFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}
export interface DictionarySubmission {
  id: string;
  wordCount: number;
  description: string | null;
  link: string | null;
  status: string;
  teacherComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  files: DictionaryFile[];
}

export interface CreditTestSummary {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  attemptsUsed: number;
  maxAttempts: number;
  canStartNewAttempt: boolean;
  latestAttemptId: string | null;
  latestAttemptStatus: string | null;
  latestResult: { correctCount: number; totalCount: number } | null;
}

export interface StudentCreditOverview {
  topStatus: string;
  topStatusLabel: string;
  dictionary: { status: string | null; statusLabel: string; latest: DictionarySubmission | null };
  test: CreditTestSummary;
  qualification: { points: number; oralPartExempt: boolean; pointsUntilExemption: number };
  oral: {
    status: string;
    topic: OralTopic | null;
    assignedComment: string | null;
    finalGrade: string | null;
    teacherComment: string | null;
    exemptionReason: string | null;
  };
}

export interface TestAttemptItem {
  itemId: string;
  orderIndex: number;
  question: string;
  options: string[];
  selectedOptionIndex: number | null;
  correctOptionIndex: number | null;
  correct: boolean | null;
}
export interface TestAttemptDetail {
  id: string;
  status: "IN_PROGRESS" | "COMPLETED";
  startedAt: string;
  completedAt: string | null;
  totalItems: number;
  answeredCount: number;
  items: TestAttemptItem[];
  result: { correctCount: number; totalCount: number } | null;
}

function buildDashboardQuery(filters: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const studentCreditApi = {
  getOverview: (groupId: string) => api.get<StudentCreditOverview>(`/api/student/credit/${groupId}`),
  listDictionary: (groupId: string) => api.get<DictionarySubmission[]>(`/api/student/credit/${groupId}/dictionary`),
  submitDictionary: (groupId: string, data: { wordCount: number; description?: string; link?: string }) =>
    api.post<DictionarySubmission>(`/api/student/credit/${groupId}/dictionary`, data),
  uploadDictionaryFile: (groupId: string, submissionId: string, file: File) =>
    uploadFile<DictionaryFile>(`/api/student/credit/${groupId}/dictionary/${submissionId}/files`, file),
  dictionaryFileUrl: (groupId: string, submissionId: string, fileId: string) =>
    fileUrl(`/api/student/credit/${groupId}/dictionary/${submissionId}/files/${fileId}`),
  removeDictionaryFile: (groupId: string, submissionId: string, fileId: string) =>
    api.delete<void>(`/api/student/credit/${groupId}/dictionary/${submissionId}/files/${fileId}`),

  startTestAttempt: (groupId: string) => api.post<{ id: string; resumed: boolean }>(`/api/student/credit/${groupId}/test/attempts`),
  getTestAttempt: (groupId: string, attemptId: string) => api.get<TestAttemptDetail>(`/api/student/credit/${groupId}/test/attempts/${attemptId}`),
  answerTestItem: (groupId: string, attemptId: string, itemId: string, selectedOptionIndex: number) =>
    api.patch<void>(`/api/student/credit/${groupId}/test/attempts/${attemptId}/items/${itemId}/answer`, { selectedOptionIndex }),
  completeTestAttempt: (groupId: string, attemptId: string) =>
    api.post<{ correctCount: number; totalCount: number; revealCorrectAnswers: boolean }>(`/api/student/credit/${groupId}/test/attempts/${attemptId}/complete`),
};

export interface CreditDashboardKpi {
  totalStudents: number;
  admissionConfirmed: number;
  dictionaryUnderReview: number;
  testCompleted: number;
  fivePlusPoints: number;
  oralExempted: number;
  oralPending: number;
  creditCompleted: number;
}
export interface CreditDashboardStudentRow {
  studentId: string;
  fullName: string;
  dictionaryStatus: string | null;
  dictionaryStatusLabel: string;
  testStatus: string;
  testResult: { correctCount: number | null; totalCount: number | null } | null;
  qualificationPoints: number;
  oralStatus: string;
  overallStatus: string;
  overallStatusLabel: string;
}
export interface CreditDashboardResponse {
  group: { id: string; name: string; course: { id: string; name: string }; academicYear: { id: string; name: string } };
  kpi: CreditDashboardKpi;
  students: CreditDashboardStudentRow[];
}

export interface CreditDashboardFilters {
  [key: string]: string | undefined;
  dictionaryFilter?: string;
  testFilter?: string;
  pointsFilter?: "5plus";
  oralFilter?: string;
  overallFilter?: string;
}

export interface DictionaryRow {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  wordCount: number;
  status: string;
  createdAt: string;
  hasFiles: boolean;
}
export interface DictionaryDetail {
  id: string;
  student: { id: string; fullName: string };
  groupId: string;
  wordCount: number;
  description: string | null;
  link: string | null;
  status: string;
  teacherComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
  files: DictionaryFile[];
  isLatest: boolean;
  history: { id: string; wordCount: number; status: string; createdAt: string }[];
}

export interface CreditTestItem {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
  grammarTopic: GrammarTopic;
  vocabularyTopic: string;
  difficulty: CreditTestDifficulty;
  active: boolean;
  explanationRu: string | null;
  createdAt: string;
}
export interface CreditSettings {
  maxTestAttempts: number;
  revealCorrectAnswers: boolean;
}

export interface OralCriteriaOptions {
  taskCompletion: readonly string[];
  errorCount: readonly string[];
  errorNature: readonly string[];
  logic: readonly string[];
  activeVocabulary: readonly string[];
  questionResponses: readonly string[];
  finalGrades: readonly string[];
}

export interface StudentCreditFullSummary extends StudentCreditOverview {
  overallStatus: string;
  overallStatusLabel: string;
}

export const teacherCreditApi = {
  getDashboard: (groupId: string, filters: CreditDashboardFilters = {}) =>
    api.get<CreditDashboardResponse>(`/api/teacher/credit/groups/${groupId}/dashboard${buildDashboardQuery(filters)}`),
  getStudentSummary: (groupId: string, studentId: string) =>
    api.get<StudentCreditFullSummary & { oral: StudentCreditFullSummary["oral"] & { errorNature: string[] } }>(`/api/teacher/credit/groups/${groupId}/students/${studentId}/summary`),

  listDictionary: (groupId: string, status?: string) => api.get<DictionaryRow[]>(`/api/teacher/credit/groups/${groupId}/dictionary${status ? `?status=${status}` : ""}`),
  getDictionaryDetail: (id: string) => api.get<DictionaryDetail>(`/api/teacher/credit/dictionary/${id}`),
  dictionaryFileUrl: (id: string, fileId: string) => fileUrl(`/api/teacher/credit/dictionary/${id}/files/${fileId}`),
  decideDictionary: (id: string, body: { action: "OPEN" | "CONFIRM" | "REQUEST_CLARIFICATION" | "REJECT"; comment?: string }) =>
    api.patch<{ id: string; status: string; teacherComment: string | null; reviewedAt: string | null }>(`/api/teacher/credit/dictionary/${id}/decision`, body),

  getSettings: (courseId: string) => api.get<CreditSettings>(`/api/teacher/credit/courses/${courseId}/settings`),
  putSettings: (courseId: string, body: CreditSettings) => api.put<CreditSettings>(`/api/teacher/credit/courses/${courseId}/settings`, body),

  listTestItems: (courseId: string) => api.get<CreditTestItem[]>(`/api/teacher/credit/courses/${courseId}/test-items`),
  createTestItem: (
    courseId: string,
    body: { question: string; options: string[]; correctOptionIndex: number; grammarTopic: GrammarTopic; vocabularyTopic: string; difficulty?: CreditTestDifficulty; explanationRu?: string }
  ) => api.post<CreditTestItem>(`/api/teacher/credit/courses/${courseId}/test-items`, body),
  updateTestItem: (id: string, body: Partial<{ question: string; options: string[]; correctOptionIndex: number; grammarTopic: GrammarTopic; vocabularyTopic: string; difficulty: CreditTestDifficulty; explanationRu: string }>) =>
    api.put<CreditTestItem>(`/api/teacher/credit/test-items/${id}`, body),
  toggleTestItemActive: (id: string, active: boolean) => api.patch<CreditTestItem>(`/api/teacher/credit/test-items/${id}/active`, { active }),

  getStudentTestAttempts: (groupId: string, studentId: string) =>
    api.get<
      {
        id: string;
        attemptNumber: number;
        status: string;
        startedAt: string;
        completedAt: string | null;
        correctCount: number | null;
        totalCount: number | null;
        items: { question: string; options: string[]; selectedOptionIndex: number | null; correctOptionIndex: number; correct: boolean | null; grammarTopic: string }[];
      }[]
    >(`/api/teacher/credit/groups/${groupId}/students/${studentId}/test-attempts`),

  getOralTopics: () => api.get<OralTopic[]>(`/api/teacher/credit/oral/topics`),
  getOralCriteriaOptions: () => api.get<OralCriteriaOptions>(`/api/teacher/credit/oral/criteria-options`),
  assignOralTopic: (groupId: string, studentId: string, body: { topicId: string; comment?: string }) =>
    api.post<{ id: string; status: string; topicId: string }>(`/api/teacher/credit/groups/${groupId}/students/${studentId}/oral/assign`, body),
  saveOralCriteria: (
    groupId: string,
    studentId: string,
    body: { taskCompletion?: string; errorCount?: string; errorNature?: string[]; logic?: string; activeVocabulary?: string; questionResponses?: string }
  ) =>
    api.put<{
      status: string;
      criteriaTaskCompletion: string | null;
      criteriaErrorCount: string | null;
      errorNature: string[];
      criteriaLogic: string | null;
      criteriaActiveVocabulary: string | null;
      criteriaQuestionResponses: string | null;
      preliminaryGrade: string | null;
    }>(`/api/teacher/credit/groups/${groupId}/students/${studentId}/oral/criteria`, body),
  confirmOralGrade: (groupId: string, studentId: string, body: { finalGrade: string; comment?: string }) =>
    api.post<{ status: string; finalGrade: string; confirmedAt: string }>(`/api/teacher/credit/groups/${groupId}/students/${studentId}/oral/confirm`, body),

  getAuditLog: (groupId: string, studentId: string) =>
    api.get<{ id: string; entityType: string; entityId: string | null; actorId: string; action: string; fromValue: string | null; toValue: string | null; reason: string | null; createdAt: string }[]>(
      `/api/teacher/credit/groups/${groupId}/students/${studentId}/audit-log`
    ),
};
