import jwt from "jsonwebtoken";
import type { Role } from "./roles";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set. Copy backend/.env.example to backend/.env and configure it.");
}

export interface AuthTokenPayload {
  sub: string; // userId
  role: Role;
  email: string;
}

const EXPIRES_IN = "7d";

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: EXPIRES_IN });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, JWT_SECRET as string) as AuthTokenPayload;
}
