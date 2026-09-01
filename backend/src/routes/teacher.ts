import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Все маршруты этого файла требуют аутентификации и роли TEACHER.
router.use(requireAuth, requireRole("TEACHER"));

// ВАЖНО: маршрут НЕ принимает :id. Профиль всегда ищется по
// req.user.id — идентификатору из проверенного JWT. Это архитектурно
// исключает доступ к чужому профилю через подмену параметра в URL,
// а не просто скрывает его в интерфейсе.
router.get("/profile", async (req, res) => {
  const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.id } });
  return res.json(profile);
});

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Укажите ФИО"),
  organization: z.string().trim().optional().nullable(),
  department: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  workEmail: z.string().trim().email("Некорректный email").optional().nullable().or(z.literal("")),
});

router.put("/profile", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const profile = await prisma.teacherProfile.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      fullName: data.fullName,
      organization: data.organization || null,
      department: data.department || null,
      position: data.position || null,
      workEmail: data.workEmail || null,
    },
    update: {
      fullName: data.fullName,
      organization: data.organization || null,
      department: data.department || null,
      position: data.position || null,
      workEmail: data.workEmail || null,
    },
  });

  return res.json(profile);
});

export default router;
