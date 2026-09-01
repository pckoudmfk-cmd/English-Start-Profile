import { PrismaClient } from "@prisma/client";

// Единый инстанс Prisma Client на весь процесс.
export const prisma = new PrismaClient();
