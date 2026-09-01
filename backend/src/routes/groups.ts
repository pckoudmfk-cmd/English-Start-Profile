import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { generateUniqueJoinCode } from "../utils/joinCode";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

function serializeGroup(group: any) {
  const activeCode = group.joinCodes?.find((c: any) => c.active) ?? null;
  return {
    id: group.id,
    name: group.name,
    specialty: group.specialty,
    status: group.status,
    courseId: group.courseId,
    course: group.course
      ? { id: group.course.id, name: group.course.name, academicYear: group.course.academicYear }
      : undefined,
    joinCode: activeCode ? { code: activeCode.code, createdAt: activeCode.createdAt } : null,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

const groupInclude = {
  course: { include: { academicYear: true } },
  joinCodes: { where: { active: true } },
};

// Находит группу и проверяет владение ОДНИМ прямым условием
// (teacherId: req.user.id) — см. комментарий в schema.prisma о защите
// в глубину. Несуществующая группа и чужая группа неотличимы (404) —
// это не даёт перебором URL узнавать, какие id вообще существуют.
async function findOwnedGroup(teacherId: string, groupId: string) {
  return prisma.group.findFirst({
    where: { id: groupId, teacherId },
    include: groupInclude,
  });
}

router.get("/", async (req, res) => {
  const { courseId, status } = req.query;
  const groups = await prisma.group.findMany({
    where: {
      teacherId: req.user!.id,
      ...(typeof courseId === "string" ? { courseId } : {}),
      ...(typeof status === "string" ? { status } : {}),
    },
    include: groupInclude,
    orderBy: { createdAt: "desc" },
  });
  return res.json(groups.map(serializeGroup));
});

router.get("/:id", async (req, res) => {
  const group = await findOwnedGroup(req.user!.id, req.params.id);
  if (!group) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }
  return res.json(serializeGroup(group));
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Укажите название группы").max(100),
  courseId: z.string().trim().min(1, "Укажите курс"),
  specialty: z.string().trim().max(150).optional().nullable(),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { name, courseId, specialty } = parsed.data;

  const course = await prisma.course.findFirst({ where: { id: courseId, teacherId: req.user!.id } });
  if (!course) {
    return res.status(404).json({ error: "COURSE_NOT_FOUND", message: "Курс не найден." });
  }

  const code = await generateUniqueJoinCode();

  const group = await prisma.group.create({
    data: {
      teacherId: req.user!.id,
      courseId,
      name,
      specialty: specialty || null,
      joinCodes: { create: { code, active: true } },
    },
    include: groupInclude,
  });

  return res.status(201).json(serializeGroup(group));
});

const renameSchema = z.object({
  name: z.string().trim().min(1, "Укажите название группы").max(100),
});

router.put("/:id", async (req, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  const existing = await prisma.group.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!existing) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }

  const group = await prisma.group.update({
    where: { id: existing.id },
    data: { name: parsed.data.name },
    include: groupInclude,
  });
  return res.json(serializeGroup(group));
});

router.post("/:id/archive", async (req, res) => {
  const existing = await prisma.group.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!existing) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }
  const group = await prisma.group.update({
    where: { id: existing.id },
    data: { status: "ARCHIVED" },
    include: groupInclude,
  });
  return res.json(serializeGroup(group));
});

router.post("/:id/unarchive", async (req, res) => {
  const existing = await prisma.group.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!existing) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }
  const group = await prisma.group.update({
    where: { id: existing.id },
    data: { status: "ACTIVE" },
    include: groupInclude,
  });
  return res.json(serializeGroup(group));
});

// --- Join code -------------------------------------------------------

router.post("/:id/join-code/regenerate", async (req, res) => {
  const existing = await prisma.group.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!existing) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }

  const code = await generateUniqueJoinCode();

  await prisma.$transaction([
    prisma.groupJoinCode.updateMany({
      where: { groupId: existing.id, active: true },
      data: { active: false, revokedAt: new Date() },
    }),
    prisma.groupJoinCode.create({ data: { groupId: existing.id, code, active: true } }),
  ]);

  const group = await prisma.group.findUnique({ where: { id: existing.id }, include: groupInclude });
  return res.json(serializeGroup(group));
});

router.post("/:id/join-code/deactivate", async (req, res) => {
  const existing = await prisma.group.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!existing) {
    return res.status(404).json({ error: "GROUP_NOT_FOUND", message: "Группа не найдена." });
  }

  await prisma.groupJoinCode.updateMany({
    where: { groupId: existing.id, active: true },
    data: { active: false, revokedAt: new Date() },
  });

  const group = await prisma.group.findUnique({ where: { id: existing.id }, include: groupInclude });
  return res.json(serializeGroup(group));
});

export default router;
