// English Start Profile — Этап 6: TEACHER DASHBOARD, агрегирующие маршруты.
//
// Вынесено из groups.ts в отдельный файл (сам роутер остаётся смонтирован
// под тем же префиксом /api/teacher/groups в src/index.ts, порядок
// регистрации не меняется — это просто дополнительные подпути того же
// уже-первого-в-очереди роутера) — чтобы не раздувать groups.ts логикой
// аналитики, у которой другая природа (только чтение, агрегация) и
// другой набор импортов (analytics/scoring, analytics/insights).
//
// Производительность (ТЗ п.19): для Dashboard группы НЕ загружается
// полный набор из 45 ответов анкеты на студента — только код вопросов
// из DASHBOARD_QUESTION_CODES (9 штук), и не сырые DiagnosticAnswer, а
// уже посчитанный на Этапе 5 DiagnosticResult. Полные ответы анкеты
// подгружаются только на странице профиля студента (getStudentProfile).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { findQuestion } from "../questionnaire/definition";
import {
  DASHBOARD_QUESTION_CODES,
  computeAutonomy,
  computeDevelopmentArea,
  computeGapCategory,
  computeMotivation,
  computePotentialSignals,
  computeSelfAssessment,
  isLargeGap,
  normalizeDiagnosticToFivePointScale,
  round1,
  type SkillBreakdownEntry,
} from "../analytics/scoring";
import { buildAttentionEntry, buildOpportunityEntry, type AttemptStatus, type StudentMetrics } from "../analytics/insights";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

// Та же проверка владения, что и в groups.ts (findOwnedGroup) — 404 на
// чужую/несуществующую группу, а не 403, чтобы нельзя было по коду
// ответа отличить "не ваша группа" от "такой группы вообще нет".
async function findOwnedGroupHeader(teacherId: string, groupId: string) {
  return prisma.group.findFirst({
    where: { id: groupId, teacherId },
    include: { course: { include: { academicYear: true } } },
  });
}

function studentDisplayName(student: { email: string; studentProfile: { fullName: string | null } | null }) {
  return student.studentProfile?.fullName || student.email;
}

interface RosterEntry {
  studentId: string;
  fullName: string;
}

async function loadRoster(groupId: string): Promise<RosterEntry[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, status: "ACTIVE" },
    include: { student: { include: { studentProfile: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ studentId: m.studentId, fullName: studentDisplayName(m.student) }));
}

// Строит StudentMetrics для каждого студента ростера группы — общая
// часть для Dashboard (GET /:id/dashboard) и для профиля студента.
// Один запрос на модель на всю группу (не N+1 на студента).
async function buildMetricsForRoster(groupId: string, roster: RosterEntry[]): Promise<StudentMetrics[]> {
  const studentIds = roster.map((r) => r.studentId);
  if (studentIds.length === 0) return [];

  const [questionnaireAttempts, diagnosticAttempts] = await Promise.all([
    prisma.questionnaireAttempt.findMany({
      where: { groupId, kind: "START", studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.diagnosticAttempt.findMany({
      where: { groupId, kind: "START", studentId: { in: studentIds } },
      include: { result: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const questionnaireByStudent = new Map<string, (typeof questionnaireAttempts)[number]>();
  for (const a of questionnaireAttempts) {
    if (!questionnaireByStudent.has(a.studentId)) questionnaireByStudent.set(a.studentId, a);
  }
  const diagnosticByStudent = new Map<string, (typeof diagnosticAttempts)[number]>();
  for (const a of diagnosticAttempts) {
    if (!diagnosticByStudent.has(a.studentId)) diagnosticByStudent.set(a.studentId, a);
  }

  const completedAttemptIds = [...questionnaireByStudent.values()]
    .filter((a) => a.status === "COMPLETED")
    .map((a) => a.id);
  const rawAnswers = completedAttemptIds.length
    ? await prisma.questionnaireAnswer.findMany({
        where: { attemptId: { in: completedAttemptIds }, questionCode: { in: DASHBOARD_QUESTION_CODES } },
      })
    : [];
  const answersByAttempt = new Map<string, Record<string, unknown>>();
  for (const a of rawAnswers) {
    if (!answersByAttempt.has(a.attemptId)) answersByAttempt.set(a.attemptId, {});
    answersByAttempt.get(a.attemptId)![a.questionCode] = JSON.parse(a.valueJson);
  }

  return roster.map(({ studentId, fullName }) => {
    const qAttempt = questionnaireByStudent.get(studentId);
    const dAttempt = diagnosticByStudent.get(studentId);
    const answers = qAttempt && qAttempt.status === "COMPLETED" ? answersByAttempt.get(qAttempt.id) ?? {} : {};
    const skillBreakdown: SkillBreakdownEntry[] | null =
      dAttempt?.status === "COMPLETED" && dAttempt.result ? JSON.parse(dAttempt.result.skillBreakdownJson) : null;

    return {
      studentId,
      fullName,
      questionnaireStatus: (qAttempt?.status ?? "NOT_STARTED") as AttemptStatus,
      diagnosticStatus: (dAttempt?.status ?? "NOT_STARTED") as AttemptStatus,
      diagnosticPercentage: dAttempt?.status === "COMPLETED" && dAttempt.result ? Math.round(dAttempt.result.overallPercentage) : null,
      skillBreakdown,
      selfAssessment: computeSelfAssessment(answers),
      motivation: computeMotivation(answers),
      autonomy: computeAutonomy(answers),
      answers,
    };
  });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}

router.get("/:id/dashboard", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.id);
  if (!group) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }

  const roster = await loadRoster(group.id);
  const metrics = await buildMetricsForRoster(group.id, roster);

  const diagnosticCompleted = metrics.filter((m) => m.diagnosticStatus === "COMPLETED");
  const diagnosticPercentages = diagnosticCompleted.map((m) => m.diagnosticPercentage).filter((v): v is number => v !== null);
  const motivations = metrics.map((m) => m.motivation).filter((v): v is number => v !== null);
  const autonomies = metrics.map((m) => m.autonomy).filter((v): v is number => v !== null);

  // "Требуют внимания" — максимум 5, приоритет по суммарному весу
  // факторов (ТЗ п.5). "Возможности развития" — тот же лимит по тому же
  // принципу "не перегружать первый экран" (ТЗ п.8 своего явного лимита
  // не задаёт, лимит в 5 — осознанный выбор по аналогии с блоком
  // внимания, чтобы оба блока были соразмерны на первом экране).
  const attention = metrics
    .map(buildAttentionEntry)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 5);

  const opportunities = metrics
    .filter((m) => m.questionnaireStatus === "COMPLETED") // сигналы интереса берутся из анкеты — без неё интерес неизвестен, а не "отсутствует"
    .map((m) => ({ entry: buildOpportunityEntry(m, computePotentialSignals(m.answers)), m }))
    .filter((x): x is { entry: NonNullable<ReturnType<typeof buildOpportunityEntry>>; m: StudentMetrics } => x.entry !== null)
    .sort((a, b) => (b.m.motivation ?? 0) + (b.m.autonomy ?? 0) - ((a.m.motivation ?? 0) + (a.m.autonomy ?? 0)))
    .slice(0, 5)
    .map((x) => x.entry);

  const studentsTable = metrics.map((m) => {
    const normalizedDiagnostic = m.diagnosticPercentage !== null ? normalizeDiagnosticToFivePointScale(m.diagnosticPercentage) : null;
    const gapCategory =
      m.selfAssessment !== null && normalizedDiagnostic !== null ? computeGapCategory(m.selfAssessment, normalizedDiagnostic) : null;
    const opportunity = m.questionnaireStatus === "COMPLETED" ? buildOpportunityEntry(m, computePotentialSignals(m.answers)) : null;
    return {
      studentId: m.studentId,
      fullName: m.fullName,
      questionnaireStatus: m.questionnaireStatus,
      diagnosticStatus: m.diagnosticStatus,
      diagnosticPercentage: m.diagnosticPercentage,
      selfAssessment: m.selfAssessment,
      gapCategory,
      isLargeGap:
        m.selfAssessment !== null && normalizedDiagnostic !== null ? isLargeGap(m.selfAssessment, normalizedDiagnostic) : false,
      motivation: m.motivation,
      autonomy: m.autonomy,
      developmentArea: computeDevelopmentArea(m.skillBreakdown),
      potentialLabel: opportunity?.potentialLabel ?? null,
      // Квалификационные баллы и статус зачёта — модуль "Зачёт/Достижения"
      // ещё не реализован ни в одном из предыдущих этапов, поэтому здесь
      // не выдумывается число или статус: null означает "не реализовано",
      // фронтенд обязан показать честную заглушку, а не нулевое значение
      // как будто балл посчитан и равен нулю.
      qualificationPoints: null as number | null,
      creditStatus: null as string | null,
    };
  });

  return res.json({
    group: {
      id: group.id,
      name: group.name,
      specialty: group.specialty,
      status: group.status,
      course: { id: group.course.id, name: group.course.name },
      academicYear: { id: group.course.academicYear.id, name: group.course.academicYear.name },
    },
    studentCount: roster.length,
    kpi: {
      diagnosticCompletion: { completed: diagnosticCompleted.length, total: roster.length },
      avgDiagnosticPercentage: average(diagnosticPercentages),
      avgMotivation: average(motivations),
      avgAutonomy: average(autonomies),
      // Квалификационные баллы и Зачёт — честные "не реализовано":
      // модуля начислений и зачёта в приложении пока нет (см. README,
      // раздел "Не реализовано"). implemented:false — явный сигнал для
      // фронтенда показать заглушку, а не 0/32 как будто посчитано.
      qualificationPoints: { implemented: false },
      credit: { implemented: false },
    },
    attention,
    opportunities,
    progress: {
      // Progress Check как модуль не реализован ни на одном из этапов —
      // единственно честный ответ здесь дословно повторяет текст ТЗ
      // (Этап 6, п.10) для случая "ещё не проводилась", а не выдуманную
      // дату или прогресс.
      status: "NOT_CONDUCTED" as const,
      recommendedAfterMonths: [5, 6] as const,
    },
    credit: {
      // Зачёт/Достижения — не реализованы (см. выше про qualificationPoints).
      implemented: false,
    },
    students: studentsTable,
  });
});

const studentIdParam = z.object({ studentId: z.string().trim().min(1) });

function formatAnswerForDisplay(code: string, value: unknown): string {
  const question = findQuestion(code);
  if (!question) return String(value);
  if (question.type === "SINGLE_CHOICE" && typeof value === "string") {
    return question.options?.find((o) => o.value === value)?.label ?? value;
  }
  if (question.type === "MULTI_CHOICE" && Array.isArray(value)) {
    const labels = value.map((v) => question.options?.find((o) => o.value === v)?.label ?? String(v));
    return labels.join(", ");
  }
  if (question.type === "MATRIX_SCALE_1_5" && value && typeof value === "object") {
    const items = question.matrixItems ?? [];
    return items
      .map((item) => `${item.label}: ${(value as Record<string, unknown>)[item.value] ?? "—"}`)
      .join("; ");
  }
  if (typeof value === "number" || typeof value === "string") return String(value);
  return JSON.stringify(value);
}

// Профиль студента с точки зрения преподавателя (ТЗ Этапа 6: переход
// "Открыть профиль" из строки таблицы). Полные ответы анкеты
// подгружаются ЗДЕСЬ (а не на Dashboard) — см. комментарий вверху файла
// про производительность.
router.get("/:id/students/:studentId", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR" });
  }
  const group = await findOwnedGroupHeader(req.user!.id, req.params.id);
  if (!group) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }

  const membership = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId: req.params.studentId, status: "ACTIVE" },
    include: { student: { include: { studentProfile: true } } },
  });
  if (!membership) {
    return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });
  }

  const [questionnaireAttempt, diagnosticAttempt, notes] = await Promise.all([
    prisma.questionnaireAttempt.findFirst({
      where: { groupId: group.id, studentId: membership.studentId, kind: "START" },
      orderBy: { createdAt: "desc" },
      include: { answers: true },
    }),
    prisma.diagnosticAttempt.findFirst({
      where: { groupId: group.id, studentId: membership.studentId, kind: "START" },
      orderBy: { createdAt: "desc" },
      include: { result: true },
    }),
    prisma.teacherNote.findMany({
      where: { teacherId: req.user!.id, groupId: group.id, studentId: membership.studentId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const answersMap: Record<string, unknown> = {};
  if (questionnaireAttempt) {
    for (const a of questionnaireAttempt.answers) {
      answersMap[a.questionCode] = JSON.parse(a.valueJson);
    }
  }
  const dashboardAnswers: Record<string, unknown> = {};
  for (const code of DASHBOARD_QUESTION_CODES) {
    if (code in answersMap) dashboardAnswers[code] = answersMap[code];
  }

  const diagnosticPercentage =
    diagnosticAttempt?.status === "COMPLETED" && diagnosticAttempt.result ? Math.round(diagnosticAttempt.result.overallPercentage) : null;
  const selfAssessment = questionnaireAttempt?.status === "COMPLETED" ? computeSelfAssessment(dashboardAnswers) : null;
  const normalizedDiagnostic = diagnosticPercentage !== null ? normalizeDiagnosticToFivePointScale(diagnosticPercentage) : null;

  return res.json({
    student: {
      id: membership.studentId,
      fullName: studentDisplayName(membership.student),
      email: membership.student.email,
      specialty: membership.student.studentProfile?.specialty ?? null,
      course: membership.student.studentProfile?.course ?? null,
      academicYear: membership.student.studentProfile?.academicYear ?? null,
    },
    questionnaire: questionnaireAttempt
      ? {
          status: questionnaireAttempt.status,
          completedAt: questionnaireAttempt.completedAt,
          // Только человекочитаемые формулировки — без кодов вопросов
          // (ТЗ п.7: "не показывать внутренние технические идентификаторы").
          answers:
            questionnaireAttempt.status === "COMPLETED"
              ? questionnaireAttempt.answers
                  .map((a) => {
                    const q = findQuestion(a.questionCode);
                    if (!q) return null;
                    return { question: q.label, answer: formatAnswerForDisplay(a.questionCode, JSON.parse(a.valueJson)) };
                  })
                  .filter((x): x is { question: string; answer: string } => x !== null)
              : [],
        }
      : null,
    diagnostic: diagnosticAttempt
      ? {
          status: diagnosticAttempt.status,
          completedAt: diagnosticAttempt.completedAt,
          overallPercentage: diagnosticAttempt.status === "COMPLETED" && diagnosticAttempt.result ? diagnosticAttempt.result.overallPercentage : null,
          skillBreakdown:
            diagnosticAttempt.status === "COMPLETED" && diagnosticAttempt.result
              ? (JSON.parse(diagnosticAttempt.result.skillBreakdownJson) as SkillBreakdownEntry[])
              : null,
          // Без утверждённой матрицы порогов остаётся null — тот же принцип,
          // что и на Этапе 5 (см. schema.prisma, комментарий к DiagnosticResult).
          diagnosticRange: diagnosticAttempt.status === "COMPLETED" ? diagnosticAttempt.result?.diagnosticRange ?? null : null,
        }
      : null,
    metrics: {
      selfAssessment,
      motivation: questionnaireAttempt?.status === "COMPLETED" ? computeMotivation(dashboardAnswers) : null,
      autonomy: questionnaireAttempt?.status === "COMPLETED" ? computeAutonomy(dashboardAnswers) : null,
      gapCategory: selfAssessment !== null && normalizedDiagnostic !== null ? computeGapCategory(selfAssessment, normalizedDiagnostic) : null,
    },
    notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt })),
  });
});

const noteSchema = z.object({
  text: z.string().trim().min(1, "Введите текст заметки").max(2000),
});

router.post("/:id/students/:studentId/notes", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR" });
  }
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  const group = await findOwnedGroupHeader(req.user!.id, req.params.id);
  if (!group) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }
  const membership = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId: req.params.studentId, status: "ACTIVE" },
  });
  if (!membership) {
    return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });
  }

  const note = await prisma.teacherNote.create({
    data: { teacherId: req.user!.id, groupId: group.id, studentId: membership.studentId, text: parsed.data.text },
  });

  return res.status(201).json({ id: note.id, text: note.text, createdAt: note.createdAt });
});

export default router;
