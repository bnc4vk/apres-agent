import crypto from "crypto";
import { appConfig } from "../config/appConfig";

function hmac(value: string): string {
  return crypto.createHmac("sha256", appConfig.sessionSecret).update(value).digest("hex");
}

export function createSignedValue(value: string): string {
  return `${value}.${hmac(value)}`;
}

export function readSignedValue(signed: string): string | null {
  const [value, signature] = signed.split(".");
  if (!value || !signature) return null;
  if (hmac(value) !== signature) return null;
  return value;
}
