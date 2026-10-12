// Jest + ts-jest. Le suite di integrazione usano un Postgres reale (database liparibank_test, mai quello di sviluppo).
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  // Le versioni "rotte" dell'esercizio restano nel repo come documentazione: si lanciano solo con `npm run test:broken`
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/tests/broken/"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }] },
  globalSetup: "<rootDir>/tests/globalSetup.ts",   // una volta: migration + DB di test vuoto (come il container fresco della CI)
  setupFiles: ["<rootDir>/tests/setup.ts"],         // in ogni file di test, PRIMA degli import: env di test
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts", "!src/types/**"],
};
