import crypto from "crypto";
import { prisma } from "../db";

// Алфавит без визуально неоднозначных символов (0/O, 1/I/L и т.п.),
// чтобы код было легко продиктовать/переписать без ошибок.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SEGMENT_LENGTH = 5;
const PREFIX = "ENG-";
const MAX_ATTEMPTS = 20;

function randomSegment(): string {
  let out = "";
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    const idx = crypto.randomInt(0, ALPHABET.length);
    out += ALPHABET[idx];
  }
  return out;
}

/**
 * Генерирует уникальный join-код вида "ENG-7K4P9".
 *
 * Код НЕ является производным от внутреннего id группы (ни в каком
 * виде — ни как его часть, ни как детерминированная функция от него):
 * это случайная строка, существующая только в таблице GroupJoinCode.
 * По коду нельзя вычислить id группы или наоборот.
 */
export async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = `${PREFIX}${randomSegment()}`;
    const existing = await prisma.groupJoinCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("Не удалось сгенерировать уникальный join-код за разумное число попыток.");
}
