import { appConfig } from "../../config/appConfig";

export type ConversationBootstrapInput = {
  tripName: string;
  participants: Array<{ identity: string; phone?: string }>;
};

export type ConversationBootstrapResult = {
  ok: boolean;
  conversationSid: string | null;
  inviteUrl: string | null;
  mode: "live" | "simulated";
};

function hasConfig(): boolean {
  return Boolean(appConfig.twilioAccountSid && appConfig.twilioAuthToken && appConfig.twilioServiceSid);
}

export async function bootstrapConversation(
  input: ConversationBootstrapInput
): Promise<ConversationBootstrapResult> {
  if (!hasConfig()) {
    const sid = `CHSIM${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    return {
      ok: true,
      conversationSid: sid,
      inviteUrl: `https://example.invalid/invite/${sid}`,
      mode: "simulated"
    };
  }

  const auth = Buffer.from(`${appConfig.twilioAccountSid}:${appConfig.twilioAuthToken}`).toString("base64");
  const base = `https://conversations.twilio.com/v1/Services/${appConfig.twilioServiceSid}/Conversations`;

  try {
    const createResponse = await fetch(base, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ FriendlyName: input.tripName }).toString()
    });
    if (!createResponse.ok) {
      return { ok: false, conversationSid: null, inviteUrl: null, mode: "live" };
    }

    const payload = (await createResponse.json()) as any;
    const sid = String(payload?.sid ?? "");
    if (!sid) return { ok: false, conversationSid: null, inviteUrl: null, mode: "live" };

    for (const participant of input.participants.slice(0, 24)) {
      await fetch(`${base}/${sid}/Participants`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ Identity: participant.identity }).toString()
      }).catch(() => undefined);
    }

    return {
      ok: true,
      conversationSid: sid,
      inviteUrl: `https://conversations.twilio.com/console/${sid}`,
      mode: "live"
    };
  } catch {
    return { ok: false, conversationSid: null, inviteUrl: null, mode: "live" };
  }
}
