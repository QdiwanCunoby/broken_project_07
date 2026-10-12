// Feature opzionale — flusso refresh token end-to-end su Postgres reale (refresh_tokens persistiti).
// request.agent(app) conserva i cookie tra una richiesta e l'altra come un browser, rispettando anche il Path:
// il refresh_token (Path=/api/auth/refresh) viaggia solo verso /api/auth/refresh.
import request from "supertest";
import { app, prisma } from "../../src/app";
import { logger } from "../../src/utils/logger";
import { cleanDatabase, seedMinimalBankingData, TestFixtures } from "../helpers/db";
import { generateExpiredToken } from "../helpers/auth";

const setCookies = (res: request.Response): string[] => (res.headers["set-cookie"] as unknown as string[]) ?? [];
const findCookie = (res: request.Response, name: string) => setCookies(res).find(c => c.startsWith(`${name}=`));
// "name=value" senza attributi, pronto per .set("Cookie", ...)
const pair = (setCookie: string | undefined) => setCookie!.split(";")[0];

describe("Flusso refresh token (integration)", () => {
  let fixtures: TestFixtures;

  beforeEach(async () => {
    await cleanDatabase(prisma);
    fixtures = await seedMinimalBankingData(prisma);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const login = (agent: ReturnType<typeof request.agent>) =>
    agent.post("/api/auth/login").send({ email: fixtures.email, password: fixtures.password });

  it("login → access scaduto (401 TOKEN_EXPIRED) → refresh (200 + nuovo access) → accesso di nuovo consentito", async () => {
    const agent = request.agent(app);

    // 1. Login: due cookie
    const loginRes = await login(agent).expect(200);
    expect(findCookie(loginRes, "access_token")).toBeDefined();
    expect(findCookie(loginRes, "refresh_token")).toMatch(/Path=\/api\/auth\/refresh/);
    await agent.get("/api/accounts").expect(200);   // sessione valida

    // 2. Simulazione dei 15 minuti trascorsi: nel cookie jar dell'agent l'access diventa un token scaduto
    const expired = generateExpiredToken({ id: fixtures.userId, email: fixtures.email, role: "USER" });
    agent.jar.setCookie(`access_token=${expired}; Path=/`, "127.0.0.1", "/");

    // 3. Route protetta con access scaduto → 401 con code dedicato (il client sa che deve fare refresh)
    const denied = await agent.get("/api/accounts").expect(401);
    expect(denied.body.error.code).toBe("TOKEN_EXPIRED");

    // 4. Refresh: l'agent invia da solo il refresh_token (Path combacia) → 200 + Set-Cookie con un nuovo access
    const refreshed = await agent.post("/api/auth/refresh").expect(200);
    const newAccess = findCookie(refreshed, "access_token");
    expect(newAccess).toBeDefined();
    expect(pair(newAccess)).not.toBe(`access_token=${expired}`);
    expect(findCookie(refreshed, "refresh_token")).toBeDefined();   // rotation: anche il refresh è nuovo

    // 5. Nuova chiamata con il nuovo access → 200
    const ok = await agent.get("/api/accounts").expect(200);
    expect(ok.body.data).toHaveLength(1);
  });

  it("🏦 token rotation: il vecchio refresh token riusato → 401, log SECURITY e revoca di tutte le sessioni", async () => {
    const warn = jest.spyOn(logger, "warn");

    // Gestione manuale dei cookie: qui serve tenere in mano il VECCHIO refresh token (come farebbe un attaccante)
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: fixtures.email, password: fixtures.password })
      .expect(200);
    const oldRefresh = pair(findCookie(loginRes, "refresh_token"));

    // Refresh legittimo: il vecchio token viene revocato, ne arriva uno nuovo
    const rotated = await request(app).post("/api/auth/refresh").set("Cookie", oldRefresh).expect(200);
    const newRefresh = pair(findCookie(rotated, "refresh_token"));
    expect(newRefresh).not.toBe(oldRefresh);
    expect(warn).not.toHaveBeenCalledWith(expect.anything(), "SECURITY: refresh token reuse detected");

    // Replay del vecchio token → 401 + log di sicurezza con l'utente coinvolto
    const replay = await request(app).post("/api/auth/refresh").set("Cookie", oldRefresh).expect(401);
    expect(replay.body.error.code).toBe("UNAUTHORIZED");
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: fixtures.userId }),
      "SECURITY: refresh token reuse detected",
    );

    // Non si sa chi tra i due sia l'attaccante: nel DB non resta nessun refresh token attivo...
    expect(await prisma.refreshToken.count({ where: { userId: fixtures.userId, revokedAt: null } })).toBe(0);
    // ...quindi anche il token "nuovo" del client legittimo è revocato (deve rifare login)
    await request(app).post("/api/auth/refresh").set("Cookie", newRefresh).expect(401);
  });

  it("refresh token falso (access token al posto del refresh) → 401 SENZA log SECURITY e sessione intatta", async () => {
    const warn = jest.spyOn(logger, "warn");
    const agent = request.agent(app);
    const loginRes = await login(agent).expect(200);
    const accessAsRefresh = `refresh_token=${pair(findCookie(loginRes, "access_token")).split("=")[1]}`;

    // Firmato con l'altro secret: rifiutato dalla verifica JWT, prima ancora di guardare il DB
    await request(app).post("/api/auth/refresh").set("Cookie", accessAsRefresh).expect(401);
    expect(warn).not.toHaveBeenCalledWith(expect.anything(), "SECURITY: refresh token reuse detected");

    // Nessuna revoca a cascata: il refresh token vero dell'utente funziona ancora
    await agent.post("/api/auth/refresh").expect(200);
  });
});
