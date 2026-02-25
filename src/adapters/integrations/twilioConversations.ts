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

export type ConversationMessageSendResult = {
  ok: boolean;
  mode: "live" | "simulated";
  sentCount: number;
  errors: string[];
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

export async function sendConversationMessages(
  conversationSid: string | null | undefined,
  messages: Array<{ author: string; body: string }>
): Promise<ConversationMessageSendResult> {
  if (!conversationSid || messages.length === 0) {
    return { ok: false, mode: "simulated", sentCount: 0, errors: ["Missing conversation SID or messages."] };
  }
  if (!hasConfig()) {
    return { ok: true, mode: "simulated", sentCount: messages.length, errors: [] };
  }

  const auth = Buffer.from(`${appConfig.twilioAccountSid}:${appConfig.twilioAuthToken}`).toString("base64");
  const base = `https://conversations.twilio.com/v1/Services/${appConfig.twilioServiceSid}/Conversations/${conversationSid}/Messages`;
  let sentCount = 0;
  const errors: string[] = [];

  for (const message of messages.slice(0, 20)) {
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          Author: message.author,
          Body: message.body.slice(0, 1600)
        }).toString()
      });
      if (response.ok) {
        sentCount += 1;
      } else {
        errors.push(`HTTP ${response.status}`);
      }
    } catch (error: any) {
      errors.push(String(error?.message ?? error));
    }
  }

  return {
    ok: sentCount > 0 && errors.length === 0,
    mode: "live",
    sentCount,
    errors
  };
}
