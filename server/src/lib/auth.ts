import jwt from "jsonwebtoken";
import { config } from "./config.js";

interface TokenPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  return config.jwtSecret;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getSecret(), {
    expiresIn: "7d",
    issuer: "fuck-cancer",
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, getSecret(), {
    issuer: "fuck-cancer",
  }) as jwt.JwtPayload & TokenPayload;
  return {
    userId: decoded.userId,
    email: decoded.email,
  };
}
