/**
 * Общие утилиты для скриптов критической проверки (verify-*.ts).
 *
 * Вынесены в отдельный модуль, а не продублированы в каждом скрипте,
 * по двум причинам: (1) избежать расхождения в поведении между
 * скриптами и (2) каждый verify-*.ts файл ДОЛЖЕН быть ES-модулем (то
 * есть иметь хотя бы один import/export) — иначе TypeScript считает его
 * "script"-файлом в глобальной области видимости, и одноимённые
 * top-level объявления в разных verify-*.ts файлах конфликтуют между
 * собой при полной проверке `tsc -p .` (что и произошло здесь).
 */

export const BASE_URL = process.env.API_URL || "http://localhost:4000";

export type CookieJar = { cookie?: string };

function extractCookie(setCookieHeader: string | null): string | undefined {
  if (!setCookieHeader) return undefined;
  return setCookieHeader.split(";")[0];
}

export async function request(
  path: string,
  opts: { method?: string; body?: unknown; jar?: CookieJar } = {}
) {
  const { method = "GET", body, jar } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jar?.cookie) headers.Cookie = jar.cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (jar) {
    const c = extractCookie(res.headers.get("set-cookie"));
    if (c) jar.cookie = c;
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json };
}

/**
 * Multipart-загрузка файла (Этап 8: подтверждающие документы
 * достижений) — отдельно от request(), которая всегда шлёт JSON.
 * fileContent — сырые байты; в Node 18+ глобальный FormData/Blob
 * достаточно для реального multipart-запроса к multer на сервере.
 */
export async function uploadFile(
  path: string,
  opts: { jar?: CookieJar; fileName: string; mimeType: string; fileContent: Buffer | string }
) {
  const { jar, fileName, mimeType, fileContent } = opts;
  const form = new FormData();
  form.append("file", new Blob([fileContent], { type: mimeType }), fileName);

  const headers: Record<string, string> = {};
  if (jar?.cookie) headers.Cookie = jar.cookie;

  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: form });

  if (jar) {
    const c = extractCookie(res.headers.get("set-cookie"));
    if (c) jar.cookie = c;
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json };
}

/**
 * Создаёт независимый счётчик проверок (свой на каждый скрипт — без
 * общего мутируемого состояния между verify-*.ts).
 */
export function createChecker() {
  let passCount = 0;
  let failCount = 0;

  function check(label: string, condition: boolean, details?: unknown) {
    if (condition) {
      passCount++;
      console.log(`  ✅ ${label}`);
    } else {
      failCount++;
      console.log(`  ❌ ${label}`);
      if (details !== undefined) console.log("     ", JSON.stringify(details));
    }
  }

  function summarize() {
    console.log(`\nИтог: ${passCount} пройдено, ${failCount} провалено.\n`);
    if (failCount > 0) process.exitCode = 1;
  }

  return { check, summarize };
}

export async function registerUser(
  jar: CookieJar,
  email: string,
  password: string,
  role: "TEACHER" | "STUDENT"
) {
  const res = await request("/api/auth/register", { method: "POST", body: { email, password, role }, jar });
  if (res.status !== 201) {
    throw new Error(`Не удалось зарегистрировать ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { id: string; email: string; role: string };
}
