import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

export const appConfig = {
  baseUrl: process.env.BASE_URL ?? "http://localhost:5001",
  sessionSecret: requireEnv("SESSION_SECRET"),
  tokenEncKey: requireEnv("TOKEN_ENC_KEY"),
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseServiceKey: requireEnv("SUPABASE_API_KEY"),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? "",
  persistenceDriver: process.env.PERSISTENCE_DRIVER ?? "supabase"
};

export const isSecureCookie = appConfig.baseUrl.startsWith("https://");

export function assertGoogleOAuthConfig(): void {
  if (!appConfig.googleClientId || !appConfig.googleClientSecret || !appConfig.googleRedirectUri) {
    throw new Error("Missing Google OAuth config. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.");
  }
}

export function assertGooglePlacesConfig(): void {
  if (!appConfig.googlePlacesApiKey) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY.");
  }
}
