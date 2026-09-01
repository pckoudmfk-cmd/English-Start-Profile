import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Все маршруты этого файла требуют аутентификации и роли STUDENT.
router.use(requireAuth, requireRole("STUDENT"));

// См. комментарий в routes/teacher.ts — тот же принцип: поиск только
// по req.user.id, без :id в маршруте.
router.get("/profile", async (req, res) => {
  const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user!.id } });
  return res.json(profile);
});

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО"),
  email: z.string().trim().email("Некорректный email"),
  specialty: z.string().trim().optional().nullable(),
  course: z.string().trim().optional().nullable(),
  academicYear: z.string().trim().optional().nullable(),
});

router.put("/profile", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const profile = await prisma.studentProfile.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      fullName: data.fullName,
      email: data.email,
      specialty: data.specialty || null,
      course: data.course || null,
      academicYear: data.academicYear || null,
    },
    update: {
      fullName: data.fullName,
      email: data.email,
      specialty: data.specialty || null,
      course: data.course || null,
      academicYear: data.academicYear || null,
    },
  });

  return res.json(profile);
});

export default router;
