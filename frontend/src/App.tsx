import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { RoleRoute, FullscreenLoader, homeForRole } from "./routes/RoleRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { TeacherLayout } from "./layouts/TeacherLayout";
import { StudentLayout } from "./layouts/StudentLayout";
import { TeacherHome } from "./pages/teacher/TeacherHome";
import { TeacherProfilePage } from "./pages/teacher/TeacherProfilePage";
import { AcademicYearsPage } from "./pages/teacher/AcademicYearsPage";
import { CoursesPage } from "./pages/teacher/CoursesPage";
import { GroupsPage } from "./pages/teacher/GroupsPage";
import { GroupDetailPage } from "./pages/teacher/GroupDetailPage";
import { TeacherStudentProfilePage } from "./pages/teacher/TeacherStudentProfilePage";
import { StudentHome } from "./pages/student/StudentHome";
import { StudentProfilePage } from "./pages/student/StudentProfilePage";
import { DiagnosticsHubPage } from "./pages/student/diagnostics/DiagnosticsHubPage";
import { QuestionnaireWizardPage } from "./pages/student/diagnostics/QuestionnaireWizardPage";
import { DiagnosticWizardPage } from "./pages/student/diagnostics/DiagnosticWizardPage";
import { StudentAchievementsPage } from "./pages/student/achievements/StudentAchievementsPage";
import { AchievementFormPage } from "./pages/student/achievements/AchievementFormPage";
import { AchievementDetailPage } from "./pages/student/achievements/AchievementDetailPage";
import { TeacherAchievementsReviewPage } from "./pages/teacher/achievements/TeacherAchievementsReviewPage";
import { TeacherAchievementDetailPage } from "./pages/teacher/achievements/TeacherAchievementDetailPage";
import { InDevelopment } from "./components/InDevelopment";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RoleRoute allow={["TEACHER"]} />}>
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route index element={<TeacherHome />} />
            <Route path="profile" element={<TeacherProfilePage />} />
            <Route path="academic-years" element={<AcademicYearsPage />} />
            <Route path="courses" element={<CoursesPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="groups/:id" element={<GroupDetailPage />} />
            <Route path="groups/:groupId/students/:studentId" element={<TeacherStudentProfilePage />} />
            <Route path="students" element={<InDevelopment title="Студенты" />} />
            <Route path="diagnostics" element={<InDevelopment title="Диагностика" />} />
            <Route path="achievements" element={<TeacherAchievementsReviewPage />} />
            <Route path="achievements/:id" element={<TeacherAchievementDetailPage />} />
            <Route path="credit" element={<InDevelopment title="Зачёт" />} />
            <Route path="analytics" element={<InDevelopment title="Аналитика" />} />
            <Route path="settings" element={<InDevelopment title="Настройки" />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allow={["STUDENT"]} />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentHome />} />
            <Route path="profile" element={<StudentProfilePage />} />
            <Route path="diagnostics" element={<DiagnosticsHubPage />} />
            <Route path="diagnostics/:groupId" element={<QuestionnaireWizardPage />} />
            <Route path="diagnostics/:groupId/test" element={<DiagnosticWizardPage />} />
            <Route path="goals" element={<InDevelopment title="Мои цели" />} />
            <Route path="achievements" element={<StudentAchievementsPage />} />
            <Route path="achievements/new" element={<AchievementFormPage />} />
            <Route path="achievements/:id/edit" element={<AchievementFormPage />} />
            <Route path="achievements/:id" element={<AchievementDetailPage />} />
            <Route path="credit" element={<InDevelopment title="Мой зачёт" />} />
            <Route path="progress" element={<InDevelopment title="Мой прогресс" />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundRedirect />} />
      </Routes>
    </AuthProvider>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(user.role)} replace />;
}

function NotFoundRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullscreenLoader />;
  return <Navigate to={user ? homeForRole(user.role) : "/login"} replace />;
}
