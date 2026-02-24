import { google } from "googleapis";
import { appConfig, assertGoogleOAuthConfig } from "../../config/appConfig";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file"
];

export function createOAuthClient() {
  assertGoogleOAuthConfig();
  return new google.auth.OAuth2(
    appConfig.googleClientId,
    appConfig.googleClientSecret,
    appConfig.googleRedirectUri
  );
}

export function buildAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state
  });
}

export async function exchangeCode(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}
