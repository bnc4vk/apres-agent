import { createSheetForTrip } from "../adapters/integrations/googleSheets";
import { createOAuthClient } from "../adapters/integrations/googleAuth";
import { LoadedConversation } from "../conversations/sessionService";
import { getGoogleRefreshToken } from "../adapters/persistence/googleTokens";
import { getConversationStore } from "../adapters/persistence";

export class HttpRouteError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "Request failed.");
    this.status = status;
    this.body = body;
  }
}

export type SheetsExportPayload = {
  tripId: string;
  sheetUrl: string;
  decisionPackage: LoadedConversation["conversation"]["decisionPackage"];
  googleLinked: true;
};

export async function exportSheetsForLoadedConversation(
  loaded: LoadedConversation
): Promise<SheetsExportPayload> {
  const decisionPackage = loaded.conversation.decisionPackage;
  if (!decisionPackage) {
    throw new HttpRouteError(400, { error: "No itinerary available to export." });
  }

  const refreshToken = await getGoogleRefreshToken(loaded.session.id);
  if (!refreshToken) {
    throw new HttpRouteError(401, { error: "Google not linked.", authRequired: true });
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const sheet = await createSheetForTrip(client, loaded.conversation.tripSpec, decisionPackage);
  await getConversationStore().updateConversation(loaded.conversation.id, { sheetUrl: sheet.sheetUrl });

  return {
    tripId: loaded.conversation.id,
    sheetUrl: sheet.sheetUrl,
    decisionPackage,
    googleLinked: true
  };
}
