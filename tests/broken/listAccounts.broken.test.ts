// ❌ BUG 2 — VERSIONE ROTTA (si lancia solo con `npm run test:broken`).
// jest.mock("@prisma/client") SENZA factory → automock: PrismaClient diventa un costruttore finto la cui istanza
// ha solo i metodi del prototype ($connect, $disconnect, ...). I delegate dei modelli (prisma.account) vengono
// creati a runtime dal costruttore vero, che non gira → prisma.account è undefined → crash su .findMany.
jest.mock("@prisma/client");

import { listAccounts } from "../../src/legacy/listAccounts";

test("ritorna account attivi", async () => {
  const result = await listAccounts();
  expect(Array.isArray(result)).toBe(true);
});
