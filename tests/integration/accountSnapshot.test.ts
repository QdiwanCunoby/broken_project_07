// ✅ BUG 3 — VERSIONE CORRETTA: matcher asimmetrici sui campi volatili.
// Lo snapshot salva `Any<String>` al posto del valore: il campo deve esserci ed essere una stringa, il valore è libero.
// Volatili sono 4, non 2: anche ownerId (UUID del cliente rigenerato dal seed) e updatedAt (@updatedAt = now()).
// Con il solo { id, createdAt } suggerito dalla traccia il diff resta rosso su ownerId e updatedAt.
import request from "supertest";
import { app, prisma } from "../../src/app";
import { cleanDatabase, seedMinimalBankingData, TestFixtures } from "../helpers/db";
import { generateTestCookie } from "../helpers/auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("GET /api/accounts/:id — forma della risposta", () => {
  let fixtures: TestFixtures;

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fixtures = await seedMinimalBankingData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const getFixtureAccount = () =>
    request(app).get(`/api/accounts/${fixtures.accountId}`).set("Cookie", [generateTestCookie()]).expect(200);

  it("matches snapshot (campi volatili esclusi con matcher asimmetrici)", async () => {
    const response = await getFixtureAccount();

    expect(response.body).toMatchSnapshot({
      data: {
        id: expect.any(String),
        ownerId: expect.any(String),
        createdAt: expect.any(String),   // qualunque stringa va bene
        updatedAt: expect.any(String),
        // iban, type, balance, status restano "fissi" nello snapshot
      },
    });
  });

  // L'alternativa con assert esplicite: più verbosa, ma dice COSA ci si aspetta e controlla anche i valori volatili
  it("assert esplicite: valori stabili uguali, volatili con il formato giusto e coerenti con la fixture", async () => {
    const { data } = (await getFixtureAccount()).body;

    expect(Object.keys(data).sort()).toEqual(["balance", "createdAt", "iban", "id", "ownerId", "status", "type", "updatedAt"]);
    expect(data).toMatchObject({ iban: fixtures.iban, type: "CHECKING", balance: "1000.00", status: "ACTIVE" });
    expect(data.id).toBe(fixtures.accountId);
    expect(data.ownerId).toBe(fixtures.customerId);
    expect(data.id).toMatch(UUID);
    expect(data.createdAt).toMatch(ISO_DATE);
    expect(data.updatedAt).toMatch(ISO_DATE);
    expect(typeof data.balance).toBe("string");   // mai number per i soldi
  });
});
