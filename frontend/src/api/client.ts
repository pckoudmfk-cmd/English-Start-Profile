// Тонкая обёртка над fetch. credentials: "include" обязателен — иначе
// httpOnly-cookie с JWT не будет отправляться/приниматься браузером
// при кросс-доменных запросах (фронтенд и backend на разных портах).

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, message, body);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// Multipart-загрузка файла (Этап 8: подтверждающие документы
// достижений) — НЕ через api.post: Content-Type с boundary браузер
// должен выставить сам, явный "application/json" из request() выше
// сломал бы multipart-запрос.
export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}${path}`, { method: "POST", credentials: "include", body: form });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

// Ссылка для скачивания/просмотра подтверждающего документа — сам файл
// отдаётся защищённым маршрутом (не публичным static), поэтому браузер
// должен идти туда напрямую с cookie, а не через fetch()+blob.
export function fileUrl(path: string): string {
  return `${API_URL}${path}`;
}
