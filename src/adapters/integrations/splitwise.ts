import { appConfig } from "../../config/appConfig";

export type SplitwiseGroupBootstrapInput = {
  tripName: string;
  currencyCode: string;
  members: Array<{ name: string; email?: string }>;
  seededExpenses: Array<{ description: string; cost: number }>;
};

export type SplitwiseGroupBootstrapResult = {
  ok: boolean;
  groupId: string | null;
  seededExpenseCount: number;
  mode: "live" | "simulated";
};

function hasConfig(): boolean {
  return Boolean(appConfig.splitwiseAccessToken && appConfig.splitwiseApiBaseUrl);
}

export async function bootstrapSplitwiseGroup(
  input: SplitwiseGroupBootstrapInput
): Promise<SplitwiseGroupBootstrapResult> {
  if (!hasConfig()) {
    return {
      ok: true,
      groupId: `sim-${slug(input.tripName)}`,
      seededExpenseCount: input.seededExpenses.length,
      mode: "simulated"
    };
  }

  const createGroupUrl = new URL(`${appConfig.splitwiseApiBaseUrl}/create_group`);
  try {
    const groupResponse = await fetch(createGroupUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appConfig.splitwiseAccessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: input.tripName,
        group_type: "trip",
        simplify_by_default: true
      })
    });
    if (!groupResponse.ok) {
      return { ok: false, groupId: null, seededExpenseCount: 0, mode: "live" };
    }

    const groupPayload = (await groupResponse.json()) as any;
    const groupId = String(groupPayload?.group?.id ?? "");
    if (!groupId) {
      return { ok: false, groupId: null, seededExpenseCount: 0, mode: "live" };
    }

    let seeded = 0;
    for (const expense of input.seededExpenses.slice(0, 8)) {
      const expenseUrl = new URL(`${appConfig.splitwiseApiBaseUrl}/create_expense`);
      const expenseResponse = await fetch(expenseUrl.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${appConfig.splitwiseAccessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          group_id: groupId,
          description: expense.description,
          cost: expense.cost.toFixed(2),
          currency_code: input.currencyCode
        })
      });
      if (expenseResponse.ok) seeded += 1;
    }

    return { ok: true, groupId, seededExpenseCount: seeded, mode: "live" };
  } catch {
    return { ok: false, groupId: null, seededExpenseCount: 0, mode: "live" };
  }
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
