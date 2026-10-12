// ❌ BUG 1 — VERSIONE ROTTA (si lancia solo con `npm run test:broken`).
// Seed UNA volta per file: i test della suite condividono lo stesso stato del DB.
// Con --testNamePattern (un test alla volta) passa; lanciando tutta la suite il GET conta anche i conti creati dai POST.
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { app, prisma as appPrisma } from "../../src/app";
import { cleanDatabase, seedMinimalBankingData, TestFixtures } from "../helpers/db";
import { generateTestCookie } from "../helpers/auth";

const ibanFor = (n: number) => `IT00X${String(n).padStart(22, "0")}`;

describe("Account API (integration)", () => {
  const prisma = new PrismaClient();
  let fixtures: TestFixtures;

  beforeAll(async () => {
    // Pulizia + seed UNA volta prima di tutti i test del file (isola il file dagli ALTRI file, non i test tra loro)
    await cleanDatabase(prisma);
    fixtures = await seedMinimalBankingData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await appPrisma.$disconnect();
  });

  // ❌ Manca `beforeEach(() => cleanDatabase(prisma))` e il re-seed.
  //    Ogni test che crea un Account (POST) lascia residui che il test successivo conta.

  describe("POST /api/accounts", () => {
    it.each(["CHECKING", "SAVINGS", "BUSINESS"])("201 crea un conto %s", async type => {
      const iban = ibanFor(["CHECKING", "SAVINGS", "BUSINESS"].indexOf(type) + 1);
      const res = await request(app)
        .post("/api/accounts")
        .set("Cookie", [generateTestCookie()])
        .send({ ownerId: fixtures.customerId, iban, type, initialBalance: 250 })
        .expect(201);
      expect(res.body.data).toMatchObject({ iban, type, balance: "250.00", status: "ACTIVE" });
    });
  });

  describe("GET /api/accounts", () => {
    it("200 + envelope { data: [...] } con il solo conto della fixture", async () => {
      const res = await request(app).get("/api/accounts").set("Cookie", [generateTestCookie()]).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: fixtures.accountId, iban: fixtures.iban, balance: "1000.00" });
    });
  });
});
