import cookie from "cookie";
import { isSecureCookie } from "../config/appConfig";
import { createSignedValue, readSignedValue } from "../security/signing";

export const SESSION_COOKIE_NAME = "apres_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function createSessionCookie(sessionId: string): string {
  const signed = createSignedValue(sessionId);
  return cookie.serialize(SESSION_COOKIE_NAME, signed, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
}

export function clearSessionCookie(): string {
  return cookie.serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie,
    path: "/",
    maxAge: 0
  });
}

export function readSessionId(rawCookie?: string): string | null {
  if (!rawCookie) return null;
  const parsed = cookie.parse(rawCookie);
  const value = parsed[SESSION_COOKIE_NAME];
  if (!value) return null;
  return readSignedValue(value);
}
