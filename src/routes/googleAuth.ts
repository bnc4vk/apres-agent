import { Router } from "express";
import { buildAuthUrl, exchangeCode } from "../integrations/googleAuth";
import { createSessionCookie, readSessionId } from "../http/sessionCookie";
import { loadConversation } from "../conversations/sessionService";
import { createSignedValue, readSignedValue } from "../security/signing";
import { upsertGoogleTokens } from "../persistence/googleTokens";
import { appConfig } from "../config/appConfig";

export const googleAuthRouter = Router();

googleAuthRouter.get("/start", async (req, res) => {
  try {
    const cookieSessionId = readSessionId(req.headers.cookie);
    const loaded = await loadConversation(cookieSessionId);
    const state = createSignedValue(loaded.sessionId);
    const url = buildAuthUrl(state);
    res.setHeader("Set-Cookie", createSessionCookie(loaded.sessionId));
    res.redirect(url);
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to start Google OAuth.");
  }
});

googleAuthRouter.get("/callback", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const oauthError = typeof req.query.error === "string" ? req.query.error : null;
    if (oauthError) {
      const reason =
        oauthError === "access_denied"
          ? "access_denied"
          : "oauth_error";
      res.redirect(`${appConfig.baseUrl}/?google=blocked&reason=${encodeURIComponent(reason)}`);
      return;
    }
    if (!code) {
      res.status(400).send("Missing OAuth code.");
      return;
    }

    const sessionIdFromState = state ? readSignedValue(state) : null;
    const cookieSessionId = readSessionId(req.headers.cookie);
    const loaded = await loadConversation(sessionIdFromState ?? cookieSessionId);
    const tokens = await exchangeCode(code);

    await upsertGoogleTokens(loaded.session.id, {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token ?? null,
      expiryDate: tokens.expiry_date ?? null,
      scopes: tokens.scope ? tokens.scope.split(" ") : null
    });

    res.setHeader("Set-Cookie", createSessionCookie(loaded.sessionId));
    res.redirect(`${appConfig.baseUrl}/?google=linked`);
  } catch (error) {
    console.error(error);
    res.redirect(`${appConfig.baseUrl}/?google=blocked&reason=oauth_callback_failed`);
  }
});
