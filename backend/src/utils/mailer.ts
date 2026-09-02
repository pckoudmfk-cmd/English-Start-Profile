// English Start Profile — отправка транзакционных писем.
//
// Реализовано через универсальный SMTP (nodemailer), а НЕ через SDK
// конкретного провайдера (SendGrid/Resend/…) — намеренное решение
// (Этап 14, "точечное исправление" единственного пункта, отделявшего
// оценку от безусловного "Ready"): код не завязан ни на один
// коммерческий сервис, переключение провайдера — это смена значений
// SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS в .env, без изменений кода.
// Подходит для любого SMTP-провайдера (Brevo, Gmail/Яндекс через
// "пароль приложения", Mailgun, AWS SES и т.д.).
//
// Безопасно по умолчанию: если SMTP_* не заданы — отправка молча не
// происходит (письмо никуда не уходит), но это НЕ маскируется как
// успех молча — вызывающий код получает явный false и решает сам,
// что делать (см. routes/auth.ts — в dev это не проблема благодаря
// EXPOSE_DEV_PASSWORD_RESET_TOKEN, в проде — это ровно тот пробел,
// который описан в docs/STAGE_14_PRODUCTION_READINESS_REPORT.md до
// того, как SMTP_* будут заполнены).
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

export const mailerConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!mailerConfigured) return null;
  if (!cachedTransport) {
    cachedTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      // 465 — неявный TLS с самого начала соединения; любой другой
      // порт (587, 25, …) — STARTTLS поверх обычного соединения. Это
      // стандартное правило SMTP, не догадка под конкретного провайдера.
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransport;
}

export interface SendResult {
  sent: boolean;
  // eslint-disable-next-line no-console
  reason?: string;
}

/**
 * Отправляет письмо восстановления доступа. Возвращает { sent: false }
 * (не бросает исключение), если SMTP не настроен или отправка не
 * удалась — вызывающий код (routes/auth.ts) не должен из-за сбоя
 * отправки письма показывать пользователю иной ответ, чем при
 * успешной постановке в очередь: это раскрыло бы факт существования
 * email (см. комментарий в routes/auth.ts).
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<SendResult> {
  const transport = getTransport();
  if (!transport) {
    return { sent: false, reason: "SMTP не настроен (SMTP_HOST/PORT/USER/PASS отсутствуют в .env)" };
  }
  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject: "Восстановление доступа — English Start Profile",
      text: `Вы (или кто-то от вашего имени) запросили восстановление доступа к English Start Profile.\n\nЧтобы задать новый пароль, перейдите по ссылке (действительна 1 час):\n${resetUrl}\n\nЕсли вы не запрашивали восстановление доступа — просто проигнорируйте это письмо, пароль останется прежним.`,
      html: `<p>Вы (или кто-то от вашего имени) запросили восстановление доступа к <strong>English Start Profile</strong>.</p><p>Чтобы задать новый пароль, перейдите по ссылке (действительна 1 час):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Если вы не запрашивали восстановление доступа — просто проигнорируйте это письмо, пароль останется прежним.</p>`,
    });
    return { sent: true };
  } catch (err) {
    // Сбой отправки не должен ронять запрос и не должен менять ответ
    // клиенту — только серверный лог для диагностики.
    // eslint-disable-next-line no-console
    console.error("Не удалось отправить письмо восстановления доступа:", err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
