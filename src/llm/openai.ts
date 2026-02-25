import { z } from "zod";
import { CandidateReviewInput, CandidateReviewResult, LLMClient } from "./client";
import { openaiApiKey, openaiModelName } from "./config";
import {
  buildCandidateReviewPrompt,
  CANDIDATE_REVIEW_SYSTEM_PROMPT,
  sanitizeCandidateReview
} from "./candidateReview";

const OPENAI_HTTP_TIMEOUT_MS = Number(process.env.OPENAI_HTTP_TIMEOUT_MS ?? 45000);
const OPENAI_REVIEW_HTTP_TIMEOUT_MS = Number(process.env.OPENAI_REVIEW_HTTP_TIMEOUT_MS ?? 120000);
const OPENAI_REVIEW_MAX_COMPLETION_TOKENS = Number(process.env.OPENAI_REVIEW_MAX_COMPLETION_TOKENS ?? 700);
const OPENAI_REASONING_EFFORT = (process.env.OPENAI_REASONING_EFFORT ?? "low").trim();

type OpenAIMessage = { role: "system" | "user" | "assistant"; content: string };

export class OpenAILLMClient implements LLMClient {
  constructor(
    private readonly apiKey: string = openaiApiKey,
    private readonly model: string = openaiModelName
  ) {}

  async reviewItineraryCandidates(input: CandidateReviewInput): Promise<CandidateReviewResult | null> {
    try {
      const data = await this.chatJson(
        [
          { role: "system", content: CANDIDATE_REVIEW_SYSTEM_PROMPT },
          { role: "user", content: buildCandidateReviewPrompt(input) }
        ],
        z.unknown(),
        0.15,
        "candidate_review",
        OPENAI_REVIEW_HTTP_TIMEOUT_MS,
        OPENAI_REVIEW_MAX_COMPLETION_TOKENS
      );
      if (!data) return null;
      const review = sanitizeCandidateReview(data, input.payload.candidates.map((candidate) => candidate.itineraryId));
      if (!review && process.env.LLM_DEBUG_REVIEW === "1") {
        console.warn("[openai candidate_review] sanitize failed payload:", JSON.stringify(data, null, 2).slice(0, 6000));
      }
      return review;
    } catch (error) {
      if (process.env.LLM_DEBUG_REVIEW === "1") {
        console.warn("[openai candidate_review] exception:", error);
      }
      return null;
    }
  }

  private async chatJson<T>(
    messages: OpenAIMessage[],
    schema: z.ZodSchema<T>,
    temperature: number,
    debugLabel?: string,
    timeoutMs: number = OPENAI_HTTP_TIMEOUT_MS,
    maxCompletionTokens?: number
  ): Promise<T | null> {
    let response: Response;
    try {
      response = await this.postChatCompletion(messages, {
        temperature,
        timeoutMs,
        maxCompletionTokens,
        reasoningEffort: OPENAI_REASONING_EFFORT
      });
    } catch (error) {
      if (debugLabel && openAIDebugEnabled()) {
        console.warn(`[openai ${debugLabel}] request exception:`, error);
      }
      return null;
    }
    if (!response.ok) {
      const errorText = await safeReadText(response);
      const shouldRetryWithoutTemperature =
        response.status === 400 &&
        /temperature/i.test(errorText) &&
        /unsupported/i.test(errorText);
      const shouldRetryWithoutReasoningEffort =
        response.status === 400 &&
        /reasoning_effort/i.test(errorText) &&
        /unsupported/i.test(errorText);
      if (shouldRetryWithoutTemperature) {
        try {
          response = await this.postChatCompletion(messages, {
            timeoutMs,
            maxCompletionTokens,
            reasoningEffort: OPENAI_REASONING_EFFORT
          });
        } catch (error) {
          if (debugLabel && openAIDebugEnabled()) {
            console.warn(`[openai ${debugLabel}] retry exception:`, error);
          }
          return null;
        }
      } else if (shouldRetryWithoutReasoningEffort) {
        try {
          response = await this.postChatCompletion(messages, { timeoutMs, maxCompletionTokens, temperature });
        } catch (error) {
          if (debugLabel && openAIDebugEnabled()) {
            console.warn(`[openai ${debugLabel}] retry(exception, no reasoning_effort):`, error);
          }
          return null;
        }
      } else {
        if (debugLabel && openAIDebugEnabled()) {
          console.warn(`[openai ${debugLabel}] HTTP ${response.status}: ${errorText.slice(0, 4000)}`);
        }
        return null;
      }
    }

    if (!response.ok) {
      if (debugLabel && openAIDebugEnabled()) {
        const body = await safeReadText(response);
        console.warn(`[openai ${debugLabel}] HTTP ${response.status}: ${body.slice(0, 4000)}`);
      }
      return null;
    }
    const payload = (await response.json()) as any;
    const content = payload?.choices?.[0]?.message?.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join("")
          : "";
    if (!text.trim()) {
      if (debugLabel && openAIDebugEnabled()) {
        console.warn(`[openai ${debugLabel}] empty text`, JSON.stringify(payload?.choices?.[0] ?? payload, null, 2).slice(0, 3000));
      }
      return null;
    }
    const json = safeParseJson(text);
    if (json === null) {
      if (debugLabel && openAIDebugEnabled()) {
        console.warn(`[openai ${debugLabel}] invalid json text:`, text.slice(0, 4000));
      }
      return null;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success && debugLabel && openAIDebugEnabled()) {
      console.warn(`[openai ${debugLabel}] schema parse failed`, parsed.error.issues.slice(0, 5));
      console.warn(`[openai ${debugLabel}] parsed json:`, JSON.stringify(json, null, 2).slice(0, 4000));
    }
    return parsed.success ? parsed.data : null;
  }

  private postChatCompletion(
    messages: OpenAIMessage[],
    options?: { temperature?: number; timeoutMs?: number; maxCompletionTokens?: number; reasoningEffort?: string }
  ) {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      response_format: { type: "json_object" }
    };
    if (typeof options?.temperature === "number" && supportsCustomTemperature(this.model)) {
      body.temperature = options.temperature;
    }
    if (typeof options?.maxCompletionTokens === "number" && Number.isFinite(options.maxCompletionTokens)) {
      body.max_completion_tokens = Math.max(64, Math.floor(options.maxCompletionTokens));
    }
    if (options?.reasoningEffort && /^gpt-5/i.test(this.model.trim())) {
      body.reasoning_effort = options.reasoningEffort;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? OPENAI_HTTP_TIMEOUT_MS);
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
  }
}

function openAIDebugEnabled(): boolean {
  return process.env.LLM_DEBUG_OPENAI === "1" || process.env.LLM_DEBUG_REVIEW === "1";
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<failed to read body>";
  }
}

function supportsCustomTemperature(model: string): boolean {
  // Some reasoning-oriented OpenAI models (e.g. gpt-5) only accept the default temperature.
  return !/^gpt-5/i.test(model.trim());
}

function safeParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]+?)```/i) ?? text.match(/```\s*([\s\S]+?)```/i);
    if (!fenced?.[1]) return null;
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }
}
