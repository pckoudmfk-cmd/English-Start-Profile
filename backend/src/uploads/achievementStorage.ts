// English Start Profile — Этап 8: хранение подтверждающих документов
// достижений (ТЗ п.5, 16 — "загрузка файла").
//
// Локальный диск, а не облачное хранилище — тот же прагматичный
// уровень инфраструктуры, что и у Listening на Этапе 5 (Web Speech API
// вместо аудио-пайплайна): для текущего масштаба проекта этого
// достаточно, а модель данных (AchievementEvidence — id/fileName/
// storedName/mimeType/size) не привязана к конкретному способу
// хранения и переживёт переезд на S3-совместимое хранилище без
// изменения схемы.
//
// storedName — случайное имя (uuid + расширение), НЕ оригинальное имя
// файла: это и защита от path traversal во входном имени, и защита от
// коллизий при одинаковых оригинальных именах у разных студентов.
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const UPLOADS_ROOT = path.resolve(__dirname, "../../uploads/achievements");

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 МБ

function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const achievementId = req.params.id;
    const dir = path.join(UPLOADS_ROOT, achievementId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${extensionFor(file.mimetype)}`);
  },
});

export const achievementEvidenceUpload = multer({
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

export function evidenceFilePath(achievementId: string, storedName: string): string {
  return path.join(UPLOADS_ROOT, achievementId, storedName);
}

export function deleteEvidenceFile(achievementId: string, storedName: string): void {
  const filePath = evidenceFilePath(achievementId, storedName);
  fs.rm(filePath, { force: true }, () => {
    // Лучшее из возможного — если удаление файла с диска не удалось
    // (например, он уже был удалён вручную), запись метаданных в БД всё
    // равно должна быть убрана вызывающим кодом; осиротевший файл на
    // диске не блокирует работу приложения.
  });
}
