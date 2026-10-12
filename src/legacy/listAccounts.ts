// Codice legacy pre-G5: crea il proprio PrismaClient a livello di modulo, nessuna dependency injection.
// Per testarlo bisogna intercettare l'import di @prisma/client (vedi tests/unit/listAccounts.test.ts).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function listAccounts() {
  return prisma.account.findMany({ where: { status: "ACTIVE" } });
}
