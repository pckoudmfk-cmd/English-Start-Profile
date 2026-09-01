import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PrimaryButton, TextInput } from "../../components/ui";
import { homeForRole } from "../../routes/RoleRoute";
import { AuthLayout } from "./AuthLayout";

type RegisterRole = "TEACHER" | "STUDENT";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState<RegisterRole>("STUDENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await register(email, password, role);
      navigate(homeForRole(user.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось зарегистрироваться. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Регистрация" subtitle="English Start Profile">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorAlert>{error}</ErrorAlert>

          <div>
            <FieldLabel>Я регистрируюсь как</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <RoleOption current={role} value="STUDENT" onSelect={setRole} label="Студент" />
              <RoleOption current={role} value="TEACHER" onSelect={setRole} label="Преподаватель" />
            </div>
          </div>

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
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">Не короче 8 символов.</p>
          </div>
          <div>
            <FieldLabel htmlFor="passwordConfirm">Повторите пароль</FieldLabel>
            <TextInput
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          <PrimaryButton type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Регистрируем…" : "Зарегистрироваться"}
          </PrimaryButton>
        </form>
        <div className="mt-4 text-center text-sm">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-brand-600 hover:underline">
            Войти
          </Link>
        </div>
      </Card>
    </AuthLayout>
  );
}

function RoleOption({
  current,
  value,
  label,
  onSelect,
}: {
  current: RegisterRole;
  value: RegisterRole;
  label: string;
  onSelect: (v: RegisterRole) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}
