// Helper JWT per i test: firmano con lo stesso secret dell'app (impostato in tests/setup.ts)
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";

export interface TestUser { id: string; email: string; role: Role }

const defaultUser = (): TestUser => ({ id: randomUUID(), email: "test@liparibank.it", role: Role.USER });

// authenticate è stateless (verifica solo la firma): per le route protette non serve un utente nel DB
export function generateTestToken(user: Partial<TestUser> = {}, expiresInSeconds = 15 * 60): string {
  const { id, email, role } = { ...defaultUser(), ...user };
  return jwt.sign({ sub: id, email, role }, process.env.JWT_ACCESS_SECRET!, {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
  });
}

// "access_token=<jwt>" pronto per .set("Cookie", [...])
export function generateTestCookie(user: Partial<TestUser> = {}): string {
  return `access_token=${generateTestToken(user)}`;
}

// Access token firmato correttamente ma con exp nel passato: simula i 15 minuti trascorsi senza aspettarli
export function generateExpiredToken(user: Partial<TestUser> = {}): string {
  const { id, email, role } = { ...defaultUser(), ...user };
  return jwt.sign(
    { sub: id, email, role, exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_ACCESS_SECRET!,
    { algorithm: "HS256" },
  );
}
