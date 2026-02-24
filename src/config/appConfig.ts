import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

function envFlag(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
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
  serpApiKey: process.env.SERPAPI_KEY ?? "",
  bookingApiKey: process.env.BOOKING_API_KEY ?? "",
  bookingApiBaseUrl: process.env.BOOKING_API_BASE_URL ?? "https://demandapi.booking.com/3.1",
  splitwiseApiBaseUrl: process.env.SPLITWISE_API_BASE_URL ?? "https://secure.splitwise.com/api/v3.0",
  splitwiseAccessToken: process.env.SPLITWISE_ACCESS_TOKEN ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioServiceSid: process.env.TWILIO_CONVERSATIONS_SERVICE_SID ?? "",
  persistenceDriver: process.env.PERSISTENCE_DRIVER ?? "supabase",
  chatPersistenceEnabled: envFlag("CHAT_PERSISTENCE_ENABLED", true)
};

export const isSecureCookie = appConfig.baseUrl.startsWith("https://");

export function assertGoogleOAuthConfig(): void {
  if (!appConfig.googleClientId || !appConfig.googleClientSecret || !appConfig.googleRedirectUri) {
    throw new Error("Missing Google OAuth config. Set GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI.");
  }
}
