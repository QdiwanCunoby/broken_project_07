// ❌ BUG 3 — VERSIONE ROTTA (si lancia solo con `npm run test:broken`).
// Lo snapshot congela anche id, ownerId e timestamp: ogni seed li rigenera → dal secondo run in poi è sempre rosso.
import request from "supertest";
import { app, prisma } from "../../src/app";
import { cleanDatabase, seedMinimalBankingData, TestFixtures } from "../helpers/db";
import { generateTestCookie } from "../helpers/auth";

let fixtures: TestFixtures;

beforeEach(async () => {
  await cleanDatabase(prisma);
  fixtures = await seedMinimalBankingData(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

it("matches snapshot", async () => {
  const response = await request(app)
    .get(`/api/accounts/${fixtures.accountId}`)
    .set("Cookie", [generateTestCookie()])
    .expect(200);

  expect(response.body).toMatchSnapshot();
});
