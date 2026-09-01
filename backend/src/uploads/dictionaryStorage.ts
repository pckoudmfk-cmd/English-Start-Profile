// English Start Profile — Этап 9: хранение файлов допуска (активного
// словаря), ТЗ п.6 — "не ограничивать реализацию только одним форматом
// файла". По сравнению с uploads/achievementStorage.ts (Этап 8,
// только изображения/PDF) список форматов сознательно шире: активный
// словарь реалистично приходит и текстовым документом (Word), и
// таблицей, и сканом/фото, и просто текстовым файлом — тот же
// прагматичный уровень инфраструктуры (локальный диск), что и у
// достижений, файлы вне репозитория (backend/uploads/, gitignored).
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads/dictionary");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 МБ — документы объёмнее сертификата

const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const submissionId = req.params.id;
    const dir = path.join(UPLOADS_ROOT, submissionId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${EXTENSION_BY_MIME[file.mimetype] ?? ""}`);
  },
});

export const dictionaryFileUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error("UNSUPPORTED_FILE_TYPE"));
      return;
    }
    cb(null, true);
  },
}).single("file");

export function dictionaryFilePath(submissionId: string, storedName: string): string {
  return path.join(UPLOADS_ROOT, submissionId, storedName);
}

export function deleteDictionaryFile(submissionId: string, storedName: string): void {
  fs.rm(dictionaryFilePath(submissionId, storedName), { force: true }, () => {});
}
