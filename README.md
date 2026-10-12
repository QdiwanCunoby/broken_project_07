# broken_project_07

LipariBank — **Broken Project Giorno 7**: tre bug sui test (integrazione, mock, snapshot) e la feature opzionale sul flusso refresh token.
Base: il progetto del G6 (auth JWT con cookie HTTP-only, refresh rotation), passato da Vitest a **Jest + ts-jest** come richiesto dalla traccia.

## Avvio

```bash
# Postgres del G0 (bootcamp/node): docker compose up -d
cp .env.example .env            # valorizza JWT_ACCESS_SECRET e JWT_REFRESH_SECRET (diversi, >= 32 caratteri)
npm install
npx prisma generate

npm test                        # tutta la suite (jest --runInBand)
npm run test:ci                 # come in GitHub Actions: --ci --runInBand --coverage
npm run test:broken             # SOLO le versioni rotte (tests/broken): falliscono di proposito
npm run typecheck               # tsc su src/ e su tests/
```

I test di integrazione usano un database separato, **`liparibank_test`**, sullo stesso Postgres (mai `liparibank_digital`):

- `tests/globalSetup.ts` applica le migration (`prisma migrate deploy`, crea il DB se manca) e lo svuota una volta per run.
- `cleanDatabase` fa `TRUNCATE ... CASCADE` e **rifiuta** di girare se il database connesso non ha `test` nel nome.
- In CI l'URL arriva da `TEST_DATABASE_URL` (service Postgres in `.github/workflows/ci.yml`).

## Struttura dei test

| File | Cosa |
|---|---|
| `tests/integration/accountRoutes.test.ts` | ✅ Bug 1 — CRUD conti su Postgres, cleanup + seed in `beforeEach` |
| `tests/unit/listAccounts.test.ts` | ✅ Bug 2 — `jest.mock("@prisma/client", factory)` sul codice legacy `src/legacy/listAccounts.ts` |
| `tests/unit/accountService.test.ts` | Confronto Bug 2: stesso tipo di test con repository iniettato (pattern G5) |
| `tests/integration/accountSnapshot.test.ts` | ✅ Bug 3 — snapshot con matcher asimmetrici + alternativa con assert esplicite |
| `tests/integration/refreshFlow.test.ts` | Feature opzionale — login → access scaduto → refresh → accesso; token rotation e reuse detection |
| `tests/integration/auth.inMemory.test.ts` | Test del G6 (repository in memoria), portati a Jest |
| `tests/broken/*.broken.test.ts` | ❌ Le tre versioni rotte, per riprodurre i bug |
| `tests/helpers/` | `cleanDatabase`, `seedMinimalBankingData`, `generateTestCookie`, `generateExpiredToken` |

Risultato: `npm run test:ci` → **6 suite, 41 test verdi, 1 snapshot**. `npm run test:broken` → 3 test rossi, uno per bug.

---

## Bug 1 🔴 — Test verdi in locale, rossi in CI

**Riproduzione** (`tests/broken/accountRoutes.broken.test.ts`, seed in `beforeAll`, i POST dichiarati prima del GET):

```
# un test alla volta, come si fa in locale
npx jest --config jest.broken.config.js accountRoutes --testNamePattern="envelope"
Tests:       3 skipped, 1 passed, 4 total

# tutta la suite, come in CI (con --runInBand!)
npx jest --ci --runInBand --config jest.broken.config.js accountRoutes
● Account API (integration) › GET /api/accounts › 200 + envelope { data: [...] } con il solo conto della fixture
    Expected length: 1
    Received length: 4          ← 1 fixture + 3 conti creati dai test POST
```

**Fix**: cleanup e seed in `beforeEach`, cleanup **prima** del seed:

```ts
beforeEach(async () => {
  await cleanDatabase(prisma);
  fixtures = await seedMinimalBankingData(prisma);
});
```

Lo stesso file, con lo stesso ordine dei test, passa con `npm run test:ci` (13 test). Le asserzioni `prisma.account.count()` nei test POST verificano anche che ogni test veda solo la fixture più quello che crea lui.

**Perché `--runInBand` non era già la soluzione.** `--runInBand` dice a Jest di eseguire i **file** di test uno dopo l'altro nello stesso processo invece che in worker paralleli. Serve, e infatti lo usiamo: le suite condividono lo stesso database e, in parallelo, il `TRUNCATE` di una suite cancellerebbe i dati di un'altra a metà test. Quindi isola le **suite tra loro**.
Ma dentro un singolo file i test sono **sempre** sequenziali e condividono lo stato che lasciano: `--runInBand` non cambia nulla lì. Il bug è proprio dentro la stessa suite: il `POST` scrive nel DB, il `GET` successivo legge quei dati. Solo un hook `beforeEach` riporta il DB allo stato noto prima di **ogni** test. In locale non si vedeva perché `--testNamePattern` lancia un test solo, che trova il DB come l'ha lasciato il seed.

## Bug 2 🟡 — Mock parziale di Prisma

**Riproduzione** (`tests/broken/listAccounts.broken.test.ts`):

```
TypeError: Cannot read properties of undefined (reading 'findMany')
    at listAccounts (src/legacy/listAccounts.ts:8:25)
```

> Il messaggio reale è leggermente diverso da quello della traccia (`findMany is not a function`), la causa è la stessa: senza factory Jest genera un **automock** di `PrismaClient` che ha solo i metodi del prototype (`$connect`, `$disconnect`, …). I delegate dei modelli (`prisma.account`, `prisma.customer`, …) li crea a runtime il costruttore vero, che con l'automock non gira. Quindi `prisma.account` è `undefined`.

**Fix**: una factory che ricrea solo la forma usata dal codice (`account.findMany`). Il mock è definito *dentro* la factory perché `jest.mock` viene spostato sopra gli import: la factory gira quando `listAccounts.ts` fa `new PrismaClient()`, e a quel punto una variabile dichiarata fuori sarebbe ancora non inizializzata. Per le asserzioni il mock si recupera dall'istanza creata: `(PrismaClient as jest.Mock).mock.results[0].value`.

**Perché il G5 ha introdotto Service/Repository con dependency injection.** Il codice legacy *sceglie da solo* la propria dipendenza (`new PrismaClient()` a livello di modulo). Per sostituirla il test deve intercettare il sistema dei moduli (`jest.mock`), indovinare quale parte dell'API enorme di Prisma serve e ricostruirla a mano, gestire l'hoisting, e ricominciare ogni volta che il codice usa un metodo in più. Con il pattern del G5 la dipendenza arriva dal **costruttore**: `new AccountService(repo)`. Nel test (`tests/unit/accountService.test.ts`) basta passare un oggetto con i 6 metodi di `IAccountRepository`, e TypeScript verifica che il mock abbia la forma giusta. Niente `jest.mock` e niente conoscenza di Prisma. Il test parla la lingua del dominio (`findByIban` restituisce null) invece di quella dell'ORM.

## Bug 3 🟢 — Snapshot instabile

**Riproduzione** (`tests/broken/accountSnapshot.broken.test.ts`): il primo run scrive lo snapshot, il secondo fallisce:

```
-     "createdAt": "2026-10-12T19:28:13.885Z",
+     "createdAt": "2026-10-12T19:28:22.091Z",
-     "id": "c46077fd-...",
-     "ownerId": "da84c98a-...",
+     "id": "ac1bc046-...",
+     "ownerId": "7da7c15c-...",
-     "updatedAt": "2026-10-12T19:28:13.885Z",
+     "updatedAt": "2026-10-12T19:28:22.091Z",
```

**Fix**: matcher asimmetrici per **tutti** i campi volatili. Sono 4, non 2: oltre a `id` e `createdAt` cambiano anche `ownerId` (UUID del cliente rigenerato dal seed) e `updatedAt` (`@updatedAt`). L'ho verificato: con il solo `{ id, createdAt }` della traccia il secondo run resta rosso su `ownerId` e `updatedAt`.

```ts
expect(response.body).toMatchSnapshot({
  data: {
    id: expect.any(String),
    ownerId: expect.any(String),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  },
});
```

Lo snapshot salvato contiene `Any<String>` per quei campi e i valori reali per `iban`, `type`, `balance`, `status`. Stabile su più run consecutivi con `--ci`.

**Quando lo snapshot ha senso e quando no.**
- **Sì**: risposte di forma complessa e **stabile** (DTO con molti campi, oggetti annidati, messaggi d'errore strutturati), dove l'obiettivo è accorgersi di qualunque cambio di contratto, per esempio un campo aggiunto per sbaglio come `passwordHash`.
- **No (meglio assert esplicite)**: risposte dominate da timestamp, UUID o dati casuali. Lo snapshot finisce pieno di `expect.any(...)`, che verificano solo il tipo, e a ogni cambio si cede alla tentazione di `jest -u`, cioè si approva senza leggere. Le assert esplicite (secondo test di `accountSnapshot.test.ts`) dicono *cosa* ci si aspetta e controllano anche i valori volatili: `id` uguale a quello della fixture, `ownerId` uguale al cliente, date in formato ISO, `balance` stringa e mai number. In ambito bancario questo conta più della comodità.

## Feature opzionale — Flusso refresh token

`tests/integration/refreshFlow.test.ts`, su Postgres reale (tabella `refresh_tokens`):

1. **Login** `POST /api/auth/login` → cookie `access_token` e `refresh_token` (con `Path=/api/auth/refresh`).
2. **Scadenza simulata**: `generateExpiredToken()` firma un access token con `exp` nel passato e lo sostituisce nel cookie jar dell'agent (`agent.jar.setCookie(...)`).
3. `GET /api/accounts` → **401 `TOKEN_EXPIRED`**.
4. `POST /api/auth/refresh` → **200** + `Set-Cookie` con un nuovo `access_token` (e un nuovo `refresh_token`: rotation).
5. `GET /api/accounts` con il nuovo access → **200**.

Si usa `request.agent(app)`, che conserva i cookie come un browser e rispetta il `Path`: il refresh token viene inviato solo a `/api/auth/refresh`. Per il ramo di sicurezza i cookie sono gestiti a mano (`set-cookie` → `.set("Cookie", ...)`), perché serve tenere da parte il **vecchio** refresh token, come farebbe un attaccante.

🏦 **Verifica banking (token rotation)**: dopo un refresh legittimo, il riuso del vecchio refresh token porta a **401**, log `SECURITY: refresh token reuse detected` (verificato con `jest.spyOn(logger, "warn")`, incluso lo `userId`) e revoca di **tutti** i refresh token dell'utente. Anche quello nuovo del client legittimo viene invalidato, perché non si sa chi dei due sia l'attaccante. Un test controlla anche il caso opposto: un token semplicemente falso (access token usato come refresh) dà 401 **senza** log SECURITY e senza revocare la sessione valida.

### Modifiche al codice applicativo (rispetto al G6)

Il G6 rispondeva `UNAUTHORIZED` generico anche per un access scaduto e non loggava il riuso:

- `src/utils/errors.ts`: `UnauthorizedError` accetta un `code` opzionale.
- `src/modules/auth/auth.service.ts`: `jwt.TokenExpiredError` → `401 TOKEN_EXPIRED`, così il client sa che deve chiamare `/refresh` invece di rimandare al login. Quando arriva un refresh token già revocato viene registrato `logger.warn({ userId, jti }, "SECURITY: refresh token reuse detected")`.
- `src/middleware/authenticate.ts`: propaga l'errore del service invece di sostituirlo con un 401 generico.
- `src/legacy/listAccounts.ts`: il modulo legacy del Bug 2.

## CI

`.github/workflows/ci.yml`: Postgres 16 come service, `npm ci`, `prisma generate`, `typecheck`, `npm run test:ci`. Il DB del job è nuovo a ogni run, ed è per questo che in CI il Bug 1 si presentava sempre.
