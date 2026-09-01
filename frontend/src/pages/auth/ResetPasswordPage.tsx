import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PrimaryButton, SuccessAlert, TextInput } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Отсутствует токен восстановления. Запросите новую ссылку.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Пароли не совпадают.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/api/auth/reset-password", { token, newPassword });
      setMessage(res.message);
      setTimeout(() => navigate("/login", { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сбросить пароль.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Новый пароль" subtitle="English Start Profile">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorAlert>{error}</ErrorAlert>
          <SuccessAlert>{message}</SuccessAlert>
          <div>
            <FieldLabel htmlFor="newPassword">Новый пароль</FieldLabel>
            <TextInput
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="confirm">Повторите пароль</FieldLabel>
            <TextInput
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <PrimaryButton type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Сохраняем…" : "Сохранить новый пароль"}
          </PrimaryButton>
        </form>
        <div className="mt-4 text-center text-sm">
          <Link to="/login" className="text-brand-600 hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </Card>
    </AuthLayout>
  );
}
