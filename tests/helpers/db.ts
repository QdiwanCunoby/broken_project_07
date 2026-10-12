// Helper per le integration test: pulizia del DB e seed minimo, deterministico (stessi IBAN/email a ogni run)
import bcrypt from "bcrypt";
import { AccountStatus, AccountType, PrismaClient, Role } from "@prisma/client";
import { assertTestDatabase } from "./testDatabase";

export const FIXTURE_PASSWORD = "Password123!";

export interface TestFixtures {
  customerId: string;
  accountId: string;
  iban: string;
  userId: string;
  email: string;
  password: string;
}

// Svuota tutte le tabelle applicative. TRUNCATE ... CASCADE ignora l'ordine delle FK ed è più veloce di N deleteMany.
// La guardia controlla il database a cui il client è DAVVERO connesso, non solo la variabile d'ambiente.
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  const [{ current_database: dbName }] = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
  assertTestDatabase(`postgresql://x/${dbName}`);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "transfers", "refresh_tokens", "users", "accounts", "customers" RESTART IDENTITY CASCADE',
  );
}

// 1 cliente + 1 conto attivo + 1 utente USER collegato al cliente
export async function seedMinimalBankingData(prisma: PrismaClient): Promise<TestFixtures> {
  const email = "mario.rossi@example.com";
  const iban = "IT60X0542811101000000123456";

  const customer = await prisma.customer.create({
    data: {
      fiscalCode: "RSSMRA80A01H501U",
      firstName: "Mario",
      lastName: "Rossi",
      email,
      phone: "+39 333 1234567",
    },
  });

  const account = await prisma.account.create({
    data: { iban, balance: "1000.00", type: AccountType.CHECKING, status: AccountStatus.ACTIVE, ownerId: customer.id },
  });

  // Cost 4 invece di 12: bcrypt.compare legge il cost dall'hash, il login funziona uguale ma il seed è ~100x più veloce
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(FIXTURE_PASSWORD, 4), role: Role.USER, customerId: customer.id },
  });

  return { customerId: customer.id, accountId: account.id, iban, userId: user.id, email, password: FIXTURE_PASSWORD };
}
