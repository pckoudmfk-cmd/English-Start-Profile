import { useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { studentGroupsApi, type GroupPreview } from "../../api/studentGroups";
import { Card, ErrorAlert, FieldLabel, PrimaryButton, SecondaryButton, TextInput } from "../../components/ui";

type Step =
  | { kind: "input" }
  | { kind: "preview"; group: GroupPreview; alreadyMember: boolean }
  | { kind: "joined"; group: GroupPreview; alreadyMember: boolean };

export function JoinGroupCard({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>({ kind: "input" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await studentGroupsApi.previewCode(code);
      setStep({ kind: "preview", group: res.group, alreadyMember: res.alreadyMember });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось проверить код.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setError(null);
    setBusy(true);
    try {
      const res = await studentGroupsApi.joinByCode(code);
      setStep({ kind: "joined", group: res.group, alreadyMember: res.alreadyMember });
      onJoined();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось присоединиться к группе.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCode("");
    setStep({ kind: "input" });
    setError(null);
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Присоединиться к группе</h2>

      {step.kind === "input" && (
        <form onSubmit={handlePreview} className="mt-3 flex items-end gap-3">
          <div className="flex-1">
            <FieldLabel htmlFor="joinCode">Введите код группы</FieldLabel>
            <TextInput
              id="joinCode"
              placeholder="ENG-7K4P9"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono uppercase tracking-widest"
            />
          </div>
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? "Проверяем…" : "Продолжить"}
          </PrimaryButton>
        </form>
      )}

      {step.kind === "preview" && (
        <div className="mt-3">
          <GroupSummary group={step.group} />
          {step.alreadyMember && (
            <p className="mt-3 text-sm font-medium text-brand-700">Вы уже состоите в этой группе.</p>
          )}
          <div className="mt-4 flex gap-2">
            {!step.alreadyMember && (
              <PrimaryButton type="button" onClick={handleConfirm} disabled={busy}>
                {busy ? "Подключаем…" : "Подтвердить присоединение"}
              </PrimaryButton>
            )}
            <SecondaryButton type="button" onClick={reset} disabled={busy}>
              Ввести другой код
            </SecondaryButton>
          </div>
        </div>
      )}

      {step.kind === "joined" && (
        <div className="mt-3">
          <GroupSummary group={step.group} />
          <p className="mt-3 text-sm font-medium text-brand-700">
            {step.alreadyMember ? "Вы уже состоите в этой группе." : "Вы успешно присоединились к группе."}
          </p>
          <SecondaryButton type="button" className="mt-3" onClick={reset}>
            Присоединиться к другой группе
          </SecondaryButton>
        </div>
      )}

      <ErrorAlert>{error}</ErrorAlert>
    </Card>
  );
}

function GroupSummary({ group }: { group: GroupPreview }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <div className="font-medium text-slate-800">
        {group.name}
        {group.specialty ? ` · ${group.specialty}` : ""}
      </div>
      <div className="mt-1 text-slate-500">
        {group.course} · {group.academicYear}
      </div>
      <div className="mt-1 text-slate-500">Преподаватель: {group.teacherName}</div>
    </div>
  );
}
