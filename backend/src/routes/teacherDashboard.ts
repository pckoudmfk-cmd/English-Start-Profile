// English Start Profile — Этап 6: TEACHER DASHBOARD, агрегирующий
// маршрут группы (GET /:id/dashboard).
//
// Смонтирован под тем же префиксом /api/teacher/groups, что и
// groups.ts и routes/teacherStudentProfile.ts (см. src/index.ts) — их
// пути не пересекаются, поэтому порядок регистрации друг для друга не
// важен.
//
// Производительность (ТЗ Этапа 6, п.19): для Dashboard группы НЕ
// загружается полный набор из 45 ответов анкеты на студента — только
// код вопросов из DASHBOARD_QUESTION_CODES (9 штук), и не сырые
// DiagnosticAnswer, а уже посчитанный на Этапе 5 DiagnosticResult.
// Полные ответы анкеты и полная история диагностики подгружаются
// только на странице профиля студента (routes/teacherStudentProfile.ts),
// и то не одним запросом, а по вкладкам.
import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  computeDevelopmentArea,
  computeGapCategory,
  computePotentialSignals,
  isLargeGap,
  normalizeDiagnosticToFivePointScale,
} from "../analytics/scoring";
import { buildAttentionEntry, buildOpportunityEntry, type StudentMetrics } from "../analytics/insights";
import { average, buildMetricsForRoster, findOwnedGroupHeader, loadRoster } from "../analytics/teacherAccess";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

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

export default router;
