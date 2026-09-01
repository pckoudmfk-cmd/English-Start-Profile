import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./routes/auth";
import teacherRouter from "./routes/teacher";
import studentRouter from "./routes/student";
import academicYearsRouter from "./routes/academicYears";
import coursesRouter from "./routes/courses";
import groupsRouter from "./routes/groups";
import teacherDashboardRouter from "./routes/teacherDashboard";
import studentGroupsRouter from "./routes/studentGroups";
import studentQuestionnaireRouter from "./routes/studentQuestionnaire";
import studentDiagnosticRouter from "./routes/studentDiagnostic";

const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
// Более специфичные подпути /api/teacher/* регистрируются ДО общего
// teacherRouter (у которого есть "перехватывающий" router.use(requireAuth,
// requireRole(...)) на "/profile"), чтобы запросы к ним не проходили через
// проверки teacherRouter вхолостую и обрабатывались напрямую своим роутером.
app.use("/api/teacher/academic-years", academicYearsRouter);
app.use("/api/teacher/courses", coursesRouter);
app.use("/api/teacher/groups", groupsRouter);
// Этап 6: Dashboard/профиль студента/заметки — отдельный роутер на том
// же префиксе /api/teacher/groups, что и groupsRouter выше (его пути —
// "/:id/dashboard", "/:id/students/:studentId(/notes)" — не пересекаются
// с путями groupsRouter, поэтому порядок между ними друг для друга не
// важен; важно лишь то, что оба смонтированы ДО общего teacherRouter).
app.use("/api/teacher/groups", teacherDashboardRouter);
app.use("/api/teacher", teacherRouter);
// Аналогично /api/teacher/* выше: /api/student/groups регистрируется до
// общего studentRouter (у которого есть перехватывающий router.use на
// "/profile"), чтобы не проходить через его middleware вхолостую.
app.use("/api/student/groups", studentGroupsRouter);
app.use("/api/student/questionnaire", studentQuestionnaireRouter);
app.use("/api/student/diagnostic", studentDiagnosticRouter);
app.use("/api/student", studentRouter);

// Единый обработчик 404 для несуществующих API-маршрутов.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера." });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`English Start Profile API listening on http://localhost:${PORT}`);
});
