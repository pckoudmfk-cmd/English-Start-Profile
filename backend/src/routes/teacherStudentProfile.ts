// English Start Profile — Этап 7: ПОЛНЫЙ ПРОФИЛЬ СТУДЕНТА.
//
// Смонтирован под тем же префиксом /api/teacher/groups, что и
// groups.ts и teacherDashboard.ts (см. src/index.ts) — пути не
// пересекаются, порядок регистрации между ними не важен.
//
// Производительность (ТЗ п.24): три отдельных маршрута вместо одного
// большого. GET /:id/students/:studentId (Обзор) — лёгкий, без полных
// ответов анкеты и без полной истории диагностики. Полные 45 ответов
// анкеты — только на GET .../questionnaire (открывается вкладкой
// «Анкета»). Полная история диагностических попыток — только на
// GET .../diagnostic (вкладка «Диагностика»). Заметки и статусы целей
// достаточно лёгкие (максимум несколько строк), поэтому остаются в
// Обзоре — не создают отдельных вкладок ради самой идеи "по вкладкам",
// а не ради реальной экономии.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { findQuestion, QUESTIONNAIRE_BLOCKS } from "../questionnaire/definition";
import { formatAnswerForDisplay } from "../questionnaire/format";
import {
  computeAutonomy,
  computeGapCategory,
  computeMotivation,
  computePotentialSignals,
  computeSelfAssessment,
  isLargeGap,
  normalizeDiagnosticToFivePointScale,
  type SkillBreakdownEntry,
} from "../analytics/scoring";
import {
  PROFILE_QUESTION_CODES,
  computePotentialBadges,
  computeRecommendedFocus,
  computeStrengths,
  computeWeaknesses,
  type ProfileInputs,
} from "../analytics/profile";
import { findOwnedGroupHeader, studentDisplayName } from "../analytics/teacherAccess";
import { getStudentQualificationSummary } from "../analytics/qualification";
import { getStudentCreditSummary } from "../analytics/credit";
import { ORAL_TOPICS } from "../credit/constants";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

const studentIdParam = z.object({ studentId: z.string().trim().min(1) });

// Проверяет владение группой + членство студента в ней одним запросом
// каждое — общая точка входа для всех маршрутов этого файла. 404 (не
// 403/404-раздельно) на обоих уровнях: чужая группа и студент не в
// группе неотличимы друг от друга по ответу (ТЗ п.25 — нельзя узнать
// перебором URL, что вообще существует).
async function requireGroupAndStudent(teacherId: string, groupId: string, studentId: string) {
  const group = await findOwnedGroupHeader(teacherId, groupId);
  if (!group) return { group: null, membership: null } as const;
  const membership = await prisma.groupMembership.findFirst({
    where: { groupId: group.id, studentId, status: "ACTIVE" },
    include: { student: { include: { studentProfile: true } } },
  });
  return { group, membership } as const;
}

// ---------------------------------------------------------------------
// GET /:id/students/:studentId — Обзор (лёгкий).
// ---------------------------------------------------------------------
router.get("/:id/students/:studentId", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR" });

  const { group, membership } = await requireGroupAndStudent(req.user!.id, req.params.id, req.params.studentId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });

  const [questionnaireAttempt, diagnosticAttempt, notes, goalStatuses, portfolioCount, resultfulCount, qualification] = await Promise.all([
    prisma.questionnaireAttempt.findFirst({
      where: { groupId: group.id, studentId: membership.studentId, kind: "START" },
      orderBy: { createdAt: "desc" },
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
    prisma.studentGoalStatus.findMany({
      where: { groupId: group.id, studentId: membership.studentId },
    }),
    // Портфолио (ТЗ п.20): все подтверждённые достижения, с баллом или
    // без — CONFIRMED и CONFIRMED_NO_POINT. Черновики/на проверке/
    // отклонённые/требующие уточнения в портфолио не входят.
    prisma.achievement.count({ where: { groupId: group.id, studentId: membership.studentId, status: { in: ["CONFIRMED", "CONFIRMED_NO_POINT"] } } }),
    // Результативные достижения — отдельное число (ТЗ п.20, 25): только
    // те, что реально дали балл.
    prisma.achievement.count({ where: { groupId: group.id, studentId: membership.studentId, status: "CONFIRMED" } }),
    getStudentQualificationSummary(group.id, membership.studentId),
  ]);
  // Этап 9: полная сводка зачёта (единая функция расчёта, analytics/credit.ts).
  const creditSummary = await getStudentCreditSummary({
    studentId: membership.studentId,
    groupId: group.id,
    courseId: group.courseId,
    academicYearId: group.course.academicYearId,
  });
  const oralTopic = creditSummary.oral.assessment?.topicId ? ORAL_TOPICS.find((t) => t.id === creditSummary.oral.assessment!.topicId) ?? null : null;

  // Список достижений студента (не черновики — черновик ещё не "его"
  // для преподавателя, см. тот же принцип в routes/teacherAchievements.ts) —
  // достаточно лёгкий (обычно не более нескольких десятков строк), чтобы
  // не заводить под него отдельную вкладку/маршрут (см. комментарий
  // вверху файла про заметки/цели — тот же случай).
  const achievementsList = await prisma.achievement.findMany({
    where: { groupId: group.id, studentId: membership.studentId, status: { not: "DRAFT" } },
    orderBy: { eventDate: "desc" },
  });

  // Только нужные для Обзора коды (PROFILE_QUESTION_CODES, не все 45) —
  // и только если анкета завершена (частичные ответы не должны влиять
  // на аналитику, тот же принцип, что и в Dashboard).
  let answers: Record<string, unknown> = {};
  if (questionnaireAttempt?.status === "COMPLETED") {
    const rows = await prisma.questionnaireAnswer.findMany({
      where: { attemptId: questionnaireAttempt.id, questionCode: { in: PROFILE_QUESTION_CODES } },
    });
    for (const r of rows) answers[r.questionCode] = JSON.parse(r.valueJson);
  }

  const diagnosticPercentage =
    diagnosticAttempt?.status === "COMPLETED" && diagnosticAttempt.result ? Math.round(diagnosticAttempt.result.overallPercentage) : null;
  const skillBreakdown: SkillBreakdownEntry[] | null =
    diagnosticAttempt?.status === "COMPLETED" && diagnosticAttempt.result ? JSON.parse(diagnosticAttempt.result.skillBreakdownJson) : null;
  const selfAssessment = questionnaireAttempt?.status === "COMPLETED" ? computeSelfAssessment(answers) : null;
  const motivation = questionnaireAttempt?.status === "COMPLETED" ? computeMotivation(answers) : null;
  const autonomy = questionnaireAttempt?.status === "COMPLETED" ? computeAutonomy(answers) : null;
  const normalizedDiagnostic = diagnosticPercentage !== null ? normalizeDiagnosticToFivePointScale(diagnosticPercentage) : null;
  const gapCategory = selfAssessment !== null && normalizedDiagnostic !== null ? computeGapCategory(selfAssessment, normalizedDiagnostic) : null;

  const profileInputs: ProfileInputs = { diagnosticPercentage, skillBreakdown, selfAssessment, motivation, autonomy, answers };

  // «Педагогический обзор» строится только если анкета завершена —
  // без неё большая часть входных сигналов недоступна, и показывать
  // пустой/наполовину придуманный обзор хуже, чем честно сказать, что
  // анкетирование ещё не завершено (см. ниже в overview.available).
  const overviewAvailable = questionnaireAttempt?.status === "COMPLETED";
  const strengths = overviewAvailable ? computeStrengths(profileInputs) : [];
  const weaknesses = overviewAvailable ? computeWeaknesses(profileInputs) : [];
  const potentialBadges = overviewAvailable ? computePotentialBadges(profileInputs, computePotentialSignals(answers)) : [];
  const recommendations = overviewAvailable ? computeRecommendedFocus(profileInputs) : [];

  // Цели (Q37 — до 3 выбранных формулировок) + статус, который явно
  // ставит преподаватель (ТЗ п.14) — никогда не выводится автоматически
  // из диагностического результата.
  const q37Question = findQuestion("Q37");
  const selectedGoalCodes: string[] = Array.isArray(answers.Q37) ? (answers.Q37 as string[]) : [];
  const statusByGoal = new Map(goalStatuses.map((g) => [g.goalCode, g]));
  const yearGoals = selectedGoalCodes.map((code) => {
    const status = statusByGoal.get(code);
    return {
      code,
      label: q37Question?.options?.find((o) => o.value === code)?.label ?? code,
      status: status?.status ?? "NOT_STARTED",
      updatedAt: status?.updatedAt ?? null,
    };
  });

  return res.json({
    student: {
      id: membership.studentId,
      fullName: studentDisplayName(membership.student),
      email: membership.student.email,
      specialty: membership.student.studentProfile?.specialty ?? null,
      course: membership.student.studentProfile?.course ?? null,
      academicYear: membership.student.studentProfile?.academicYear ?? null,
      group: { id: group.id, name: group.name },
    },
    header: {
      diagnosticStatus: diagnosticAttempt?.status ?? "NOT_STARTED",
      // Этап 9: полный статус зачёта ("Итог", analytics/credit.ts).
      creditStatusLabel: creditSummary.overallStatusLabel,
    },
    kpi: {
      diagnosticPercentage,
      selfAssessment,
      gapCategory,
      isLargeGap: selfAssessment !== null && normalizedDiagnostic !== null ? isLargeGap(selfAssessment, normalizedDiagnostic) : false,
      motivation,
      autonomy,
      qualificationPoints: { implemented: true as const, points: qualification.points, oralPartStatus: qualification.oralPartStatus, pointsUntilExemption: qualification.pointsUntilExemption },
      creditStatus: { implemented: true as const, status: creditSummary.overallStatus, statusLabel: creditSummary.overallStatusLabel },
    },
    overview: {
      available: overviewAvailable,
      strengths,
      weaknesses,
      potentialBadges,
      recommendations,
    },
    selfAssessmentDetail: overviewAvailable ? buildSelfAssessmentDetail(answers, skillBreakdown) : null,
    motivationAndLearning: overviewAvailable ? buildMotivationAndLearning(answers, motivation, autonomy) : null,
    goals: {
      mainGoal: typeof answers.Q38 === "string" ? answers.Q38 : null,
      yearGoals,
      willingnessToWork: typeof answers.Q39 === "number" ? answers.Q39 : null,
      plannedActions: Array.isArray(answers.Q40) ? formatMultiChoice("Q40", answers.Q40) : [],
    },
    // Достижения (ТЗ п.20, 25) — портфолио (все подтверждённые, с
    // баллом или без) отделено от результативных (только те, что дали
    // балл) — это разные понятия, не переиспользуют друг друга.
    achievements: {
      implemented: true as const,
      portfolioCount,
      resultfulCount,
      list: achievementsList.map((a) => ({
        id: a.id,
        eventName: a.eventName,
        eventDate: a.eventDate,
        eventType: a.eventType,
        claimedResult: a.claimedResult,
        status: a.status,
        qualificationPoint: a.qualificationPoint,
      })),
    },
    // Этап 9: полный конвейер зачёта (ТЗ п.32 — "Допуск → Тест →
    // Квалификационные баллы → Устная часть/освобождение → Итог").
    credit: {
      implemented: true as const,
      overallStatus: creditSummary.overallStatus,
      overallStatusLabel: creditSummary.overallStatusLabel,
      dictionary: { status: creditSummary.dictionary.status, statusLabel: creditSummary.dictionary.statusLabel, wordCount: creditSummary.dictionary.latest?.wordCount ?? null },
      test: {
        status: creditSummary.test.status,
        attemptsUsed: creditSummary.test.attemptsUsed,
        maxAttempts: creditSummary.test.maxAttempts,
        result: creditSummary.test.latestAttempt?.status === "COMPLETED" ? { correctCount: creditSummary.test.latestAttempt.correctCount, totalCount: creditSummary.test.latestAttempt.totalCount } : null,
      },
      qualificationPoints: creditSummary.qualification,
      oral: {
        status: creditSummary.oral.status,
        topic: oralTopic,
        preliminaryGrade: creditSummary.oral.preliminaryGrade,
        finalGrade: creditSummary.oral.assessment?.status === "CONFIRMED" ? creditSummary.oral.assessment.finalGrade : null,
        exemptionReason: creditSummary.oral.assessment?.status === "EXEMPTED" ? creditSummary.oral.assessment.exemptionReason : null,
      },
    },
    progress: {
      status: "NOT_CONDUCTED" as const,
      recommendedAfterMonths: [5, 6] as const,
      // Текущее число результативных мероприятий (ТЗ п.26). Полноценная
      // динамика "Старт → Progress Check" требует исторического снимка
      // на момент Start Diagnostic, которого не существует (Progress
      // Check не реализован) — показывается только текущее состояние,
      // без выдуманной точки отсчёта.
      extracurricularActivity: { resultfulCount },
    },
    notes: notes.map((n) => ({ id: n.id, text: n.text, noteType: n.noteType, createdAt: n.createdAt })),
  });
});

const SELF_ASSESSMENT_LABELS_RU: Record<string, string> = {
  reading: "Чтение",
  listening: "Аудирование",
  speaking: "Говорение",
  writing: "Письмо",
  professional: "Профессиональный английский",
};
const SELF_ASSESSMENT_SKILL_OVERLAP: Record<string, string> = { reading: "READING", listening: "LISTENING" };

function buildSelfAssessmentDetail(answers: Record<string, unknown>, skillBreakdown: SkillBreakdownEntry[] | null) {
  const raw = answers.Q12;
  const items = findQuestion("Q12")?.matrixItems ?? [];
  if (!raw || typeof raw !== "object") return null;
  return items.map((item) => {
    const selfValue = (raw as Record<string, unknown>)[item.value];
    const overlapSkill = SELF_ASSESSMENT_SKILL_OVERLAP[item.value];
    const objective = overlapSkill ? skillBreakdown?.find((s) => s.skill === overlapSkill) ?? null : null;
    return {
      skill: SELF_ASSESSMENT_LABELS_RU[item.value] ?? item.label,
      selfAssessment: typeof selfValue === "number" ? selfValue : null,
      objectivePercentage: objective ? objective.percentage : null,
      // Для Speaking/Writing/Professional объективной пары нет — Start
      // Diagnostic их не проверяет (см. Этап 5). Явный флаг, а не
      // молчаливый null, чтобы фронтенд показал "не оценивается", а не
      // выглядел как "результат ещё не посчитан".
      hasObjectiveComparison: overlapSkill !== undefined,
    };
  });
}

function formatMultiChoice(code: string, values: string[]): string[] {
  const q = findQuestion(code);
  return values.map((v) => q?.options?.find((o) => o.value === v)?.label ?? v);
}

function buildMotivationAndLearning(answers: Record<string, unknown>, motivation: number | null, autonomy: number | null) {
  const barriersRaw = Array.isArray(answers.Q23) ? (answers.Q23 as string[]).filter((v) => v !== "none") : [];
  return {
    motivation,
    autonomy,
    willingnessToWork: typeof answers.Q39 === "number" ? answers.Q39 : null,
    preferredMethods: Array.isArray(answers.Q19) ? formatMultiChoice("Q19", answers.Q19 as string[]) : [],
    barriers: formatMultiChoice("Q23", barriersRaw),
    neededSupport: Array.isArray(answers.Q24) ? formatMultiChoice("Q24", answers.Q24 as string[]) : [],
  };
}

// ---------------------------------------------------------------------
// GET /:id/students/:studentId/questionnaire — вкладка «Анкета»
// (полные 45 ответов, сгруппированные по тем же 13 блокам, что и сама
// анкета — не изобретаем новую группировку).
// ---------------------------------------------------------------------
router.get("/:id/students/:studentId/questionnaire", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR" });

  const { group, membership } = await requireGroupAndStudent(req.user!.id, req.params.id, req.params.studentId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });

  const attempt = await prisma.questionnaireAttempt.findFirst({
    where: { groupId: group.id, studentId: membership.studentId, kind: "START" },
    orderBy: { createdAt: "desc" },
    include: { answers: true },
  });

  if (!attempt || attempt.status !== "COMPLETED") {
    return res.json({ status: attempt?.status ?? "NOT_STARTED", sections: [] });
  }

  const answersByCode = new Map(attempt.answers.map((a) => [a.questionCode, a]));
  // Только человекочитаемые формулировки — без кодов вопросов (ТЗ,
  // повторено из Этапа 6 п.7: "не показывать внутренние технические
  // идентификаторы вопросов").
  const sections = QUESTIONNAIRE_BLOCKS.map((block) => {
    const items = block.questions
      .map((q) => {
        const row = answersByCode.get(q.code);
        if (!row) return null;
        return { question: q.label, answer: formatAnswerForDisplay(q.code, JSON.parse(row.valueJson)) };
      })
      .filter((x): x is { question: string; answer: string } => x !== null);
    return { id: block.id, title: block.title, items };
  });

  return res.json({ status: attempt.status, completedAt: attempt.completedAt, sections });
});

// ---------------------------------------------------------------------
// GET /:id/students/:studentId/diagnostic — вкладка «Диагностика»
// (полная история: Start/Progress/Final + таблица навыков).
// ---------------------------------------------------------------------
// Русскоязычные подписи (ТЗ — "интерфейс полностью на русском"; см.
// docs/STAGE_10_REPORT.md — до Этапа 10 здесь ошибочно оставались
// английские технические названия, которые НИКОГДА не были видны
// реальному пользователю (kind="PROGRESS"/"CREDIT" не существовали в
// БД). Этап 10 сделал "PROGRESS" реально достижимым — исправлено сразу
// для всех трёх, а не только для нового.
const DIAGNOSTIC_KIND_LABELS: Record<string, string> = {
  START: "Стартовая диагностика",
  PROGRESS: "Промежуточная диагностика",
  CREDIT: "Итоговая диагностика",
};
const ALL_SKILLS_RU: Record<string, string> = {
  GRAMMAR: "Грамматика",
  VOCABULARY: "Лексика",
  READING: "Чтение",
  LISTENING: "Аудирование",
  WRITING: "Письмо",
  SPEAKING: "Говорение",
};
const DIAGNOSED_SKILLS = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING"];
const ALL_SKILLS = [...DIAGNOSED_SKILLS, "WRITING", "SPEAKING"];

router.get("/:id/students/:studentId/diagnostic", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR" });

  const { group, membership } = await requireGroupAndStudent(req.user!.id, req.params.id, req.params.studentId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });

  // kind зарезервирован ТЗ под START/PROGRESS/CREDIT — Progress Check и
  // Final (зачётное) тестирование как модули пока не реализованы (см.
  // README «Не реализовано»), поэтому попытки этих kind'ов сейчас
  // никогда не существуют в БД; запрос написан так, чтобы начать их
  // показывать без изменений, как только эти модули появятся.
  const attempts = await prisma.diagnosticAttempt.findMany({
    where: { groupId: group.id, studentId: membership.studentId, kind: { in: ["START", "PROGRESS", "CREDIT"] } },
    orderBy: { createdAt: "desc" },
    include: { result: true },
  });
  const byKind = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) {
    if (!byKind.has(a.kind)) byKind.set(a.kind, a); // первая = самая свежая (desc)
  }

  const history = (["START", "PROGRESS", "CREDIT"] as const)
    .map((kind) => {
      const a = byKind.get(kind);
      if (!a) return null;
      const breakdown: SkillBreakdownEntry[] | null =
        a.status === "COMPLETED" && a.result ? JSON.parse(a.result.skillBreakdownJson) : null;
      return {
        kind,
        label: DIAGNOSTIC_KIND_LABELS[kind],
        status: a.status,
        completedAt: a.completedAt,
        overallPercentage: a.status === "COMPLETED" && a.result ? a.result.overallPercentage : null,
        skillBreakdown: breakdown,
        diagnosticRange: a.status === "COMPLETED" ? a.result?.diagnosticRange ?? null : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  function percentageFor(kind: "START" | "PROGRESS" | "CREDIT", skill: string): number | null {
    const a = byKind.get(kind);
    if (!a || a.status !== "COMPLETED" || !a.result) return null;
    const breakdown: SkillBreakdownEntry[] = JSON.parse(a.result.skillBreakdownJson);
    return breakdown.find((s) => s.skill === skill)?.percentage ?? null;
  }

  const skillTable = ALL_SKILLS.map((skill) => {
    const assessed = DIAGNOSED_SKILLS.includes(skill);
    const start = assessed ? percentageFor("START", skill) : null;
    const progress = assessed ? percentageFor("PROGRESS", skill) : null;
    const final = assessed ? percentageFor("CREDIT", skill) : null;
    const now = final ?? progress;
    return {
      skill,
      label: ALL_SKILLS_RU[skill],
      // Письмо/Говорение не тестируются Start Diagnostic вообще (см.
      // Этап 5) — assessed:false отличает "навык не оценивался" от
      // "оценивался, но результата пока нет" (assessed:true, start:null).
      assessed,
      start,
      progress,
      final,
      changePoints: assessed && start !== null && now !== null ? round1(now - start) : null,
    };
  });

  // «Что изменилось?» — только если есть хотя бы один завершённый
  // Progress/Final результат: без него сравнивать не с чем, а
  // показывать блок с одним Start было бы бессмысленной пустышкой.
  const hasProgressOrFinal = skillTable.some((s) => s.progress !== null || s.final !== null);

  return res.json({ history, skillTable, hasChangeSummary: hasProgressOrFinal });
});

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------
// PUT /:id/students/:studentId/goals/:goalCode — статус цели (только
// одна из целей, реально выбранных студентом в Q37; преподаватель
// меняет статус явно, никогда не выставляется автоматически).
// ---------------------------------------------------------------------
const goalStatusSchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "NOT_ACHIEVED"]),
});

router.put("/:id/students/:studentId/goals/:goalCode", async (req, res) => {
  const paramsCheck = z.object({ studentId: z.string().trim().min(1), goalCode: z.string().trim().min(1) }).safeParse(req.params);
  if (!paramsCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR" });
  const bodyCheck = goalStatusSchema.safeParse(req.body);
  if (!bodyCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: bodyCheck.error.flatten() });

  const { group, membership } = await requireGroupAndStudent(req.user!.id, req.params.id, req.params.studentId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });

  // Статус можно поставить только реально выбранной студентом цели —
  // иначе можно было бы завести статус для цели, которую студент даже
  // не отмечал.
  const attempt = await prisma.questionnaireAttempt.findFirst({
    where: { groupId: group.id, studentId: membership.studentId, kind: "START", status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { answers: { where: { questionCode: "Q37" } } },
  });
  const selectedGoals: string[] = attempt?.answers[0] ? JSON.parse(attempt.answers[0].valueJson) : [];
  if (!selectedGoals.includes(req.params.goalCode)) {
    return res.status(404).json({ error: "GOAL_NOT_FOUND", message: "Эта цель не отмечена студентом." });
  }

  const existing = await prisma.studentGoalStatus.findUnique({
    where: { groupId_studentId_goalCode: { groupId: group.id, studentId: membership.studentId, goalCode: req.params.goalCode } },
  });
  const fromStatus = existing?.status ?? "NOT_STARTED";
  const toStatus = bodyCheck.data.status;

  const updated = await prisma.studentGoalStatus.upsert({
    where: { groupId_studentId_goalCode: { groupId: group.id, studentId: membership.studentId, goalCode: req.params.goalCode } },
    create: { teacherId: req.user!.id, groupId: group.id, studentId: membership.studentId, goalCode: req.params.goalCode, status: toStatus },
    update: { status: toStatus, teacherId: req.user!.id },
  });

  if (fromStatus !== toStatus) {
    await prisma.studentGoalStatusEvent.create({
      data: { teacherId: req.user!.id, groupId: group.id, studentId: membership.studentId, goalCode: req.params.goalCode, fromStatus, toStatus },
    });
  }

  return res.json({ goalCode: updated.goalCode, status: updated.status, updatedAt: updated.updatedAt });
});

// ---------------------------------------------------------------------
// POST /:id/students/:studentId/notes — заметка преподавателя (Этап 6,
// расширено типом заметки на Этапе 7).
// ---------------------------------------------------------------------
const NOTE_TYPES = ["OBSERVATION", "RECOMMENDATION", "AGREEMENT", "IMPORTANT", "EVENT_PREP"] as const;
const noteSchema = z.object({
  text: z.string().trim().min(1, "Введите текст заметки").max(2000),
  noteType: z.enum(NOTE_TYPES).optional(),
});

router.post("/:id/students/:studentId/notes", async (req, res) => {
  const paramsCheck = studentIdParam.safeParse(req.params);
  if (!paramsCheck.success) return res.status(400).json({ error: "VALIDATION_ERROR" });
  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  const { group, membership } = await requireGroupAndStudent(req.user!.id, req.params.id, req.params.studentId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND", message: "Студент не найден в этой группе." });

  const note = await prisma.teacherNote.create({
    data: {
      teacherId: req.user!.id,
      groupId: group.id,
      studentId: membership.studentId,
      text: parsed.data.text,
      noteType: parsed.data.noteType ?? null,
    },
  });

  return res.status(201).json({ id: note.id, text: note.text, noteType: note.noteType, createdAt: note.createdAt });
});

export default router;
