// Eseguito in ogni file di test PRIMA degli import di src/: env.ts e PrismaClient leggono queste variabili
import { TEST_DATABASE_URL } from "./helpers/testDatabase";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret-0123456789";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret-0123456789";
process.env.LOG_LEVEL = "silent";
process.env.DATABASE_URL = TEST_DATABASE_URL;
