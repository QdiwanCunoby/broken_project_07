// ✅ BUG 1 — VERSIONE CORRETTA: ogni test parte da un DB pulito con la stessa fixture.
// Stesso ordine della versione rotta (POST prima del GET): l'ordine non conta più.
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app, prisma } from "../../src/app";
import { cleanDatabase, seedMinimalBankingData, TestFixtures } from "../helpers/db";
import { generateTestCookie } from "../helpers/auth";

const ibanFor = (n: number) => `IT00X${String(n).padStart(22, "0")}`;

describe("Account API (integration)", () => {
  // Un solo PrismaClient (quello dell'app): un pool di connessioni, un $disconnect
  let fixtures: TestFixtures;

  beforeEach(async () => {
    // Pulizia PRIMA del seed: ogni test vede solo la fixture, qualunque cosa abbiano fatto i test precedenti
    await cleanDatabase(prisma);
    fixtures = await seedMinimalBankingData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("401 senza cookie di sessione", async () => {
    const res = await request(app).get("/api/accounts").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  describe("POST /api/accounts", () => {
    it.each(["CHECKING", "SAVINGS", "BUSINESS"])("201 crea un conto %s", async type => {
      const iban = ibanFor(["CHECKING", "SAVINGS", "BUSINESS"].indexOf(type) + 1);
      const res = await request(app)
        .post("/api/accounts")
        .set("Cookie", [generateTestCookie()])
        .send({ ownerId: fixtures.customerId, iban, type, initialBalance: 250 })
        .expect(201);
      expect(res.body.data).toMatchObject({ iban, type, balance: "250.00", status: "ACTIVE" });
      expect(await prisma.account.count()).toBe(2);   // fixture + quello appena creato, mai di più
    });

    it("409 se l'IBAN è già registrato", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .set("Cookie", [generateTestCookie()])
        .send({ ownerId: fixtures.customerId, iban: fixtures.iban, type: "CHECKING" })
        .expect(409);
      expect(res.body.error.code).toBe("CONFLICT");
    });

    it("409 se ownerId non corrisponde a nessun cliente (FK)", async () => {
      await request(app)
        .post("/api/accounts")
        .set("Cookie", [generateTestCookie()])
        .send({ ownerId: randomUUID(), iban: ibanFor(9), type: "CHECKING" })
        .expect(409);
    });

    it("422 con IBAN non valido, nessuna scrittura", async () => {
      const res = await request(app)
        .post("/api/accounts")
        .set("Cookie", [generateTestCookie()])
        .send({ ownerId: fixtures.customerId, iban: "IT00", type: "CHECKING" })
        .expect(422);
      expect(res.body.error.details[0].field).toBe("iban");
      expect(await prisma.account.count()).toBe(1);
    });
  });

  describe("GET /api/accounts", () => {
    it("200 + envelope { data: [...] } con il solo conto della fixture", async () => {
      const res = await request(app).get("/api/accounts").set("Cookie", [generateTestCookie()]).expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ id: fixtures.accountId, iban: fixtures.iban, balance: "1000.00" });
    });

    it("GET /:id → 200 con il conto", async () => {
      const res = await request(app)
        .get(`/api/accounts/${fixtures.accountId}`)
        .set("Cookie", [generateTestCookie()])
        .expect(200);
      expect(res.body.data).toMatchObject({ id: fixtures.accountId, ownerId: fixtures.customerId, type: "CHECKING" });
    });

    it("GET /:id inesistente → 404", async () => {
      const res = await request(app)
        .get(`/api/accounts/${randomUUID()}`)
        .set("Cookie", [generateTestCookie()])
        .expect(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT / DELETE /api/accounts/:id", () => {
    it("PUT → 200 e lo stato è persistito", async () => {
      await request(app)
        .put(`/api/accounts/${fixtures.accountId}`)
        .set("Cookie", [generateTestCookie()])
        .send({ status: "BLOCKED" })
        .expect(200);
      expect((await prisma.account.findUnique({ where: { id: fixtures.accountId } }))!.status).toBe("BLOCKED");
    });

    it("DELETE come USER → 403, il conto resta", async () => {
      await request(app).delete(`/api/accounts/${fixtures.accountId}`).set("Cookie", [generateTestCookie()]).expect(403);
      expect(await prisma.account.count()).toBe(1);
    });

    it("DELETE come ADMIN → 204, poi GET → 404", async () => {
      const admin = [generateTestCookie({ role: "ADMIN" })];
      await request(app).delete(`/api/accounts/${fixtures.accountId}`).set("Cookie", admin).expect(204);
      await request(app).get(`/api/accounts/${fixtures.accountId}`).set("Cookie", admin).expect(404);
    });
  });
});
