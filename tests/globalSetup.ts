// Una volta per run, nel processo principale di Jest: applica le migration al DB di test e lo svuota.
// Ogni run parte da un DB vuoto, come il container Postgres nuovo di ogni job di CI.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "./helpers/testDatabase";
import { cleanDatabase } from "./helpers/db";

export default async function globalSetup(): Promise<void> {
  // migrate deploy: applica solo le migration esistenti (crea il database se manca), non è interattivo
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });

  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
  try {
    await cleanDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
