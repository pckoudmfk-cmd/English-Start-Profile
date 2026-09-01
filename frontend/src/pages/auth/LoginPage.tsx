import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PrimaryButton, TextInput } from "../../components/ui";
import { homeForRole } from "../../routes/RoleRoute";
import { AuthLayout } from "./AuthLayout";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      const target = (location.state?.from as any)?.pathname || homeForRole(user.role);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Вход в систему" subtitle="English Start Profile">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorAlert>{error}</ErrorAlert>
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="password">Пароль</FieldLabel>
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <PrimaryButton type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Входим…" : "Войти"}
          </PrimaryButton>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">
            Забыли пароль?
          </Link>
          <Link to="/register" className="text-brand-600 hover:underline">
            Регистрация
          </Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
