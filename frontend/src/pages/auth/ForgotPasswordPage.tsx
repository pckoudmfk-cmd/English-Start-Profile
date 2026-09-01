import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PrimaryButton, SuccessAlert, TextInput } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevToken(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string; devToken?: string }>("/api/auth/forgot-password", { email });
      setMessage(res.message);
      if (res.devToken) setDevToken(res.devToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить запрос.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Восстановление доступа" subtitle="English Start Profile">
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ErrorAlert>{error}</ErrorAlert>
          <SuccessAlert>{message}</SuccessAlert>
          {devToken && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="mb-1 font-medium">Режим разработки: почтовый сервис ещё не подключён.</p>
              <p>
                Ссылка для сброса пароля:{" "}
                <Link className="underline" to={`/reset-password?token=${devToken}`}>
                  перейти к сбросу пароля
                </Link>
              </p>
            </div>
          )}
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
          <PrimaryButton type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Отправляем…" : "Отправить ссылку для восстановления"}
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
