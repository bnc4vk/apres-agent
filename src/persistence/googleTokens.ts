import { supabaseAdmin } from "./supabaseClient";
import { encryptToken, decryptToken } from "../security/tokenEncryption";

export type GoogleTokenPayload = {
  refreshToken?: string | null;
  accessToken?: string | null;
  expiryDate?: number | null;
  scopes?: string[] | null;
};

export async function upsertGoogleTokens(sessionPk: string, tokens: GoogleTokenPayload): Promise<void> {
  const existing = await supabaseAdmin
    .from("app_google_tokens")
    .select("refresh_token_enc")
    .eq("session_pk", sessionPk)
    .maybeSingle();

  const refreshToken = tokens.refreshToken ?? null;
  const refreshTokenEnc = refreshToken
    ? encryptToken(refreshToken)
    : existing.data?.refresh_token_enc ?? null;

  if (!refreshTokenEnc) {
    throw new Error("No refresh token available to store.");
  }

  const payload = {
    session_pk: sessionPk,
    refresh_token_enc: refreshTokenEnc,
    access_token: tokens.accessToken ?? null,
    expiry_at: tokens.expiryDate ? new Date(tokens.expiryDate).toISOString() : null,
    scopes: tokens.scopes ?? null
  };

  const response = await supabaseAdmin.from("app_google_tokens").upsert(payload);
  if (response.error) {
    throw new Error(response.error.message);
  }
}

export async function getGoogleRefreshToken(sessionPk: string): Promise<string | null> {
  const response = await supabaseAdmin
    .from("app_google_tokens")
    .select("refresh_token_enc")
    .eq("session_pk", sessionPk)
    .maybeSingle();
  if (!response.data?.refresh_token_enc) return null;
  return decryptToken(response.data.refresh_token_enc);
}
