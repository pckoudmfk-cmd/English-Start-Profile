// English Start Profile — Этап 8: «Проверка достижений» (роль
// преподавателя). Виден только достижения студентов СВОИХ групп
// (Achievement -> Group.teacherId) — тот же принцип защиты в глубину,
// что и everywhere else в проекте.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { ACHIEVEMENT_STATUSES, CLAIMED_RESULTS, EVENT_TYPES } from "../achievements/constants";
import { applyTeacherDecision, DecisionError, findPossibleDuplicates, type DecisionAction } from "../achievements/service";
import { evidenceFilePath } from "../uploads/achievementStorage";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

function studentDisplayName(student: { email: string; studentProfile: { fullName: string | null } | null }) {
  return student.studentProfile?.fullName || student.email;
}

function serializeListRow(a: any) {
  return {
    id: a.id,
    studentId: a.studentId,
    studentName: studentDisplayName(a.student),
    groupId: a.groupId,
    groupName: a.group.name,
    eventName: a.eventName,
    eventDate: a.eventDate,
    eventType: a.eventType,
    claimedResult: a.claimedResult,
    status: a.status,
    qualificationPoint: a.qualificationPoint,
    hasEvidence: a.evidence.length > 0,
  };
}

router.get("/", async (req, res) => {
  const { groupId, studentId, eventType, status, claimedResult, dateFrom, dateTo, hasPoint, pendingOnly, sort } = req.query;

  const where: any = { group: { teacherId: req.user!.id } };
  if (typeof groupId === "string" && groupId) where.groupId = groupId;
  if (typeof studentId === "string" && studentId) where.studentId = studentId;
  if (typeof eventType === "string" && (EVENT_TYPES as readonly string[]).includes(eventType)) where.eventType = eventType;
  if (typeof claimedResult === "string" && (CLAIMED_RESULTS as readonly string[]).includes(claimedResult)) where.claimedResult = claimedResult;
  if (pendingOnly === "true") {
    where.status = "PENDING";
  } else if (typeof status === "string" && (ACHIEVEMENT_STATUSES as readonly string[]).includes(status)) {
    where.status = status;
  } else {
    // По умолчанию преподаватель не видит чужие черновики — они ещё не
    // "его" по смыслу ТЗ (студент "начал заполнение, но ещё не
    // отправил"), но остальные статусы, включая NEEDS_CLARIFICATION и
    // финальные решения, видны, чтобы список был полной историей, а не
    // только очередью.
    where.status = { not: "DRAFT" };
  }
  if (typeof dateFrom === "string" && dateFrom) where.eventDate = { ...(where.eventDate ?? {}), gte: new Date(dateFrom) };
  if (typeof dateTo === "string" && dateTo) where.eventDate = { ...(where.eventDate ?? {}), lte: new Date(dateTo) };
  if (hasPoint === "true") where.qualificationPoint = 1;
  if (hasPoint === "false") where.qualificationPoint = 0;

  const orderBy =
    sort === "student"
      ? [{ studentId: "asc" as const }]
      : sort === "status"
      ? [{ status: "asc" as const }]
      : sort === "type"
      ? [{ eventType: "asc" as const }]
      : [{ eventDate: "desc" as const }];

  const achievements = await prisma.achievement.findMany({
    where,
    include: { student: { include: { studentProfile: true } }, group: true, evidence: true },
    orderBy,
  });

  return res.json(achievements.map(serializeListRow));
});

async function findReviewableAchievement(teacherId: string, achievementId: string) {
  return prisma.achievement.findFirst({
    where: { id: achievementId, group: { teacherId } },
    include: {
      student: { include: { studentProfile: true } },
      group: { include: { course: { include: { academicYear: true } } } },
      evidence: true,
      auditLog: { orderBy: { createdAt: "desc" } },
    },
  });
}

router.get("/:id", async (req, res) => {
  const achievement = await findReviewableAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  const duplicates = await findPossibleDuplicates(achievement.groupId, achievement.studentId, achievement.eventName, achievement.eventDate, achievement.id);

  return res.json({
    id: achievement.id,
    student: { id: achievement.studentId, fullName: studentDisplayName(achievement.student) },
    group: { id: achievement.group.id, name: achievement.group.name, course: achievement.group.course.name, academicYear: achievement.group.course.academicYear.name },
    eventName: achievement.eventName,
    eventDate: achievement.eventDate,
    organizer: achievement.organizer,
    eventType: achievement.eventType,
    claimedResult: achievement.claimedResult,
    claimedResultOther: achievement.claimedResultOther,
    resultPlace: achievement.resultPlace,
    resultNomination: achievement.resultNomination,
    description: achievement.description,
    status: achievement.status,
    qualificationPoint: achievement.qualificationPoint,
    teacherComment: achievement.teacherComment,
    createdAt: achievement.createdAt,
    submittedAt: achievement.submittedAt,
    verifiedAt: achievement.verifiedAt,
    evidence: achievement.evidence.map((e) => ({ id: e.id, fileName: e.fileName, mimeType: e.mimeType, size: e.size, uploadedAt: e.uploadedAt })),
    possibleDuplicates: duplicates,
    auditLog: achievement.auditLog.map((l) => ({ id: l.id, actorId: l.actorId, action: l.action, fromValue: l.fromValue, toValue: l.toValue, reason: l.reason, createdAt: l.createdAt })),
  });
});

router.get("/:id/evidence/:evidenceId", async (req, res) => {
  const achievement = await prisma.achievement.findFirst({
    where: { id: req.params.id, group: { teacherId: req.user!.id } },
    include: { evidence: true },
  });
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND" });
  }
  const evidence = achievement.evidence.find((e) => e.id === req.params.evidenceId);
  if (!evidence) {
    return res.status(404).json({ error: "EVIDENCE_NOT_FOUND" });
  }
  return res.sendFile(evidenceFilePath(achievement.id, evidence.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "FILE_NOT_FOUND" });
  });
});

const decisionSchema = z.object({
  action: z.enum(["CONFIRM", "CONFIRM_NO_POINT", "REQUEST_CLARIFICATION", "REJECT", "CHANGE_STATUS"]),
  targetStatus: z.enum(ACHIEVEMENT_STATUSES).optional(),
  comment: z.string().trim().max(2000).optional(),
});

router.patch("/:id/decision", async (req, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const achievement = await prisma.achievement.findFirst({ where: { id: req.params.id, group: { teacherId: req.user!.id } } });
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }

  try {
    const updated = await applyTeacherDecision({
      achievementId: achievement.id,
      teacherId: req.user!.id,
      groupId: achievement.groupId,
      action: parsed.data.action as DecisionAction,
      targetStatus: parsed.data.targetStatus,
      comment: parsed.data.comment,
    });
    return res.json({ id: updated.id, status: updated.status, qualificationPoint: updated.qualificationPoint, teacherComment: updated.teacherComment, verifiedAt: updated.verifiedAt });
  } catch (err) {
    if (err instanceof DecisionError) {
      const statusCode = err.code === "NOT_FOUND" ? 404 : err.code === "DUPLICATE_POINT_BLOCKED" ? 409 : 400;
      return res.status(statusCode).json({ error: err.code, message: err.message });
    }
    throw err;
  }
});

export default router;
