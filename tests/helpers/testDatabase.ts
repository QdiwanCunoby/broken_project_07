// URL del database di test. In CI arriva da TEST_DATABASE_URL (service Postgres del workflow);
// in locale è un database separato sullo stesso Postgres del G0, così i test non toccano mai liparibank_digital.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://liparibank:liparibank_dev_2026@localhost:5432/liparibank_test?schema=public";

// cleanDatabase fa TRUNCATE: rifiuta di girare su un database il cui nome non contiene "test"
export const assertTestDatabase = (url: string): void => {
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) {
    throw new Error(`Rifiuto di svuotare il database "${dbName}": i test girano solo su un database *_test`);
  }
};
