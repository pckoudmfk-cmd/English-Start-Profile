import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { workspaceApi, type Group } from "../../api/workspace";
import {
  Badge,
  Card,
  ErrorAlert,
  FieldLabel,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  SuccessAlert,
  TextInput,
} from "../../components/ui";

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    workspaceApi
      .getGroup(id)
      .then((g) => {
        setGroup(g);
        setName(g.name);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof ApiError ? err.message : "Не удалось загрузить группу.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError(null);
    setSavingName(true);
    try {
      const g = await workspaceApi.renameGroup(id, name);
      setGroup(g);
      setMessage("Название группы обновлено.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось переименовать группу.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleArchiveToggle() {
    if (!id || !group) return;
    setBusy(true);
    setError(null);
    try {
      const g = group.status === "ACTIVE" ? await workspaceApi.archiveGroup(id) : await workspaceApi.unarchiveGroup(id);
      setGroup(g);
      setMessage(g.status === "ARCHIVED" ? "Группа архивирована." : "Группа восстановлена из архива.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось изменить статус группы.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const g = await workspaceApi.regenerateJoinCode(id);
      setGroup(g);
      setMessage("Создан новый код подключения. Старый код больше не действует.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось обновить код.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const g = await workspaceApi.deactivateJoinCode(id);
      setGroup(g);
      setMessage("Код подключения деактивирован. Присоединиться по нему больше нельзя.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось деактивировать код.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!group?.joinCode) return;
    try {
      await navigator.clipboard.writeText(group.joinCode.code);
      setMessage("Код скопирован в буфер обмена.");
    } catch {
      setError("Не удалось скопировать код — скопируйте его вручную.");
    }
  }

  if (notFound) {
    return (
      <div>
        <PageTitle>Группа не найдена</PageTitle>
        <Card>
          <p className="text-sm text-slate-600">
            Группа не существует или принадлежит другому преподавателю.
          </p>
          <Link to="/teacher/groups" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            ← Вернуться к списку групп
          </Link>
        </Card>
      </div>
    );
  }

  if (loading || !group) {
    return (
      <div>
        <PageTitle>Группа</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">Загрузка…</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/teacher/groups" className="text-xs text-slate-400 hover:text-slate-600">
            ← Все группы
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {group.name} {group.status === "ARCHIVED" && <Badge>Архив</Badge>}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {group.course?.name} · {group.course?.academicYear.name}
            {group.specialty ? ` · ${group.specialty}` : ""}
          </p>
        </div>
        <SecondaryButton onClick={handleArchiveToggle} disabled={busy}>
          {group.status === "ACTIVE" ? "Архивировать" : "Восстановить из архива"}
        </SecondaryButton>
      </div>

      <ErrorAlert>{error}</ErrorAlert>
      <SuccessAlert>{message}</SuccessAlert>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Название группы</h2>
          <form onSubmit={handleRename} className="flex items-end gap-3">
            <div className="flex-1">
              <FieldLabel htmlFor="groupNameEdit">Название</FieldLabel>
              <TextInput id="groupNameEdit" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <PrimaryButton type="submit" disabled={savingName}>
              {savingName ? "Сохраняем…" : "Сохранить"}
            </PrimaryButton>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Код подключения</h2>
          {group.joinCode ? (
            <>
              <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-center font-mono text-2xl tracking-widest text-brand-800">
                {group.joinCode.code}
              </div>
              <div className="flex flex-wrap gap-2">
                <SecondaryButton type="button" onClick={handleCopy}>
                  Скопировать
                </SecondaryButton>
                <SecondaryButton type="button" onClick={handleRegenerate} disabled={busy}>
                  Регенерировать
                </SecondaryButton>
                <SecondaryButton type="button" onClick={handleDeactivate} disabled={busy}>
                  Деактивировать
                </SecondaryButton>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                Код подключения деактивирован. Студенты не могут присоединиться к группе.
              </div>
              <SecondaryButton type="button" onClick={handleRegenerate} disabled={busy}>
                Создать новый код
              </SecondaryButton>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
