// English Start Profile — Этап 10: ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА
// (роль преподавателя). ТЗ: "Запустить диагностику может только
// преподаватель" — весь этот файл виден только преподавателю,
// владеющему группой (тот же принцип защиты в глубину, что и everywhere
// else в проекте — 404, не 403, на чужую группу).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { findOwnedGroupHeader, loadRoster } from "../analytics/teacherAccess";
import { assignProgressCheck } from "../progressCheck/service";
import { getStudentProgressComparison } from "../analytics/progressCheck";

const router = Router();
router.use(requireAuth, requireRole("TEACHER"));

// --- Ростер группы со статусом Промежуточной диагностики ------------------

router.get("/groups/:groupId/roster", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });

  const roster = await loadRoster(group.id);
  const attempts = await prisma.diagnosticAttempt.findMany({ where: { groupId: group.id, kind: "PROGRESS" } });
  const byStudent = new Map(attempts.map((a) => [a.studentId, a]));
  // Условие для "Старт пройден" — без завершённого Start Diagnostic
  // сравнивать "Старт → Сейчас" не с чем (ТЗ: "СТАРТ → СЕЙЧАС").
  const startAttempts = await prisma.diagnosticAttempt.findMany({ where: { groupId: group.id, kind: "START", status: "COMPLETED" } });
  const startedStudentIds = new Set(startAttempts.map((a) => a.studentId));

  return res.json(
    roster.map((r) => {
      const a = byStudent.get(r.studentId);
      return {
        studentId: r.studentId,
        fullName: r.fullName,
        startDiagnosticCompleted: startedStudentIds.has(r.studentId),
        status: a?.status ?? "NOT_ASSIGNED",
        periodStartAt: a?.periodStartAt ?? null,
        periodEndAt: a?.periodEndAt ?? null,
        assignedAt: a?.assignedAt ?? null,
        completedAt: a?.completedAt ?? null,
      };
    })
  );
});

// --- Назначение (ТЗ: группа → студенты → период → назначить) -------------

const assignSchema = z.object({
  studentIds: z.array(z.string().trim().min(1)).min(1, "Выберите хотя бы одного студента"),
  periodStartAt: z.coerce.date({ errorMap: () => ({ message: "Укажите начало периода" }) }),
  periodEndAt: z.coerce.date().optional().nullable(),
});

router.post("/groups/:groupId/assign", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });

  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  if (parsed.data.periodEndAt && parsed.data.periodEndAt < parsed.data.periodStartAt) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Окончание периода не может быть раньше начала." });
  }

  // Только реально состоящие в группе студенты — назначение по id из
  // формы, но владение проверяется тем же прямым запросом, что и
  // everywhere else, чтобы нельзя было назначить диагностику студенту
  // чужой/несуществующей группы, подставив id в тело запроса.
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: group.id, status: "ACTIVE", studentId: { in: parsed.data.studentIds } },
  });
  const validStudentIds = memberships.map((m) => m.studentId);
  if (validStudentIds.length === 0) {
    return res.status(400).json({ error: "NO_VALID_STUDENTS", message: "Ни один из выбранных студентов не состоит в этой группе." });
  }

  const results = await assignProgressCheck({
    teacherId: req.user!.id,
    groupId: group.id,
    courseId: group.courseId,
    academicYearId: group.course.academicYearId,
    studentIds: validStudentIds,
    periodStartAt: parsed.data.periodStartAt,
    periodEndAt: parsed.data.periodEndAt ?? null,
  });

  return res.status(201).json({ results });
});

// --- Результат "Старт → Сейчас → Что изменилось" --------------------------

router.get("/groups/:groupId/students/:studentId/summary", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const membership = await prisma.groupMembership.findFirst({ where: { groupId: group.id, studentId: req.params.studentId, status: "ACTIVE" } });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND" });

  const summary = await getStudentProgressComparison(group.id, req.params.studentId);
  return res.json(summary);
});

export default router;
