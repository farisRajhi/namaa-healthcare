/**
 * Gemini Client for Patient Intelligence Pipeline
 *
 * Provides a simple JSON-mode chat completion function using the
 * Gemini REST API (generativelanguage.googleapis.com).
 * Replaces the previous OpenAI GPT-4o dependency.
 */

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_TIMEOUT_MS = 60_000;

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

export interface GeminiChatOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GeminiChatResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call Gemini REST API for structured JSON output.
 *
 * Uses response_mime_type: "application/json" to enforce JSON-only responses
 * (equivalent to OpenAI's response_format: { type: 'json_object' }).
 * Returns text + actual token usage from usageMetadata (with a char-based
 * fallback for responses that don't include it).
 */
export async function geminiJsonChat(
  config: GeminiConfig,
  options: GeminiChatOptions,
): Promise<GeminiChatResult> {
  const model = config.model || process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: options.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: options.userPrompt }],
      },
    ],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    const u = data?.usageMetadata;
    const promptTokens = u?.promptTokenCount ?? 0;
    const completionTokens = u?.candidatesTokenCount ?? 0;
    const totalTokens = u?.totalTokenCount ?? (promptTokens + completionTokens);
    // Fallback when Gemini omits usageMetadata (rare — safety blocks, etc.)
    const fallbackTotal = Math.ceil((options.systemPrompt.length + options.userPrompt.length + text.length) / 4);

    return {
      text,
      usage: {
        promptTokens: promptTokens || Math.ceil((options.systemPrompt.length + options.userPrompt.length) / 4),
        completionTokens: completionTokens || Math.ceil(text.length / 4),
        totalTokens: totalTokens || fallbackTotal,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}
