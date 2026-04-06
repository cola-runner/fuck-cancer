import jwt from "jsonwebtoken";

interface TokenPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required");
  }
  return secret;
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
