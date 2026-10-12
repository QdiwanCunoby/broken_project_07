// ✅ BUG 2 — VERSIONE CORRETTA: la factory ricrea la forma MINIMA di PrismaClient usata dal codice legacy.
// jest.mock viene "hoistato" sopra gli import: la factory gira quando listAccounts.ts fa `new PrismaClient()`.
// Per questo mockFindMany è definita DENTRO la factory (fuori sarebbe ancora in TDZ al momento della chiamata).
jest.mock("@prisma/client", () => {
  const mockFindMany = jest.fn().mockResolvedValue([{ id: "1", status: "ACTIVE" }]);
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      account: { findMany: mockFindMany },
    })),
  };
});

import { PrismaClient } from "@prisma/client";
import { listAccounts } from "../../src/legacy/listAccounts";

// L'istanza creata a livello di modulo da listAccounts.ts: da lì recuperiamo il mock per le asserzioni
const prismaInstance = () => (PrismaClient as unknown as jest.Mock).mock.results[0].value;

test("ritorna account attivi", async () => {
  const result = await listAccounts();
  expect(Array.isArray(result)).toBe(true);
  expect(result).toEqual([{ id: "1", status: "ACTIVE" }]);
});

test("filtra per status ACTIVE (la query è quella giusta)", async () => {
  await listAccounts();
  expect(prismaInstance().account.findMany).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
});

test("un solo PrismaClient creato all'import del modulo", () => {
  expect(PrismaClient).toHaveBeenCalledTimes(1);
});
