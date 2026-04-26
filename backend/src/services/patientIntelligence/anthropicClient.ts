/**
 * Anthropic (Claude) Client for Patient Intelligence Pipeline
 *
 * Mirrors the geminiClient.ts interface (systemPrompt + userPrompt → JSON string)
 * so the LLM router can swap between providers transparently.
 *
 * Claude doesn't have a native JSON-mode flag; we strengthen the system prompt
 * and strip accidental markdown fences from the response as a safety net.
 */
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 90_000;

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
}

export interface AnthropicChatOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AnthropicChatResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const JSON_ONLY_SUFFIX = `

CRITICAL OUTPUT RULE: Respond with ONLY a single valid JSON object. Do not wrap in markdown code fences. Do not add any explanation, preface, or trailing text. Your entire response must parse as JSON.`;

/**
 * Call Anthropic Claude for structured JSON output.
 * Returns JSON text (markdown fences stripped) plus token usage.
 */
export async function anthropicJsonChat(
  config: AnthropicConfig,
  options: AnthropicChatOptions,
): Promise<AnthropicChatResult> {
  const model = config.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: DEFAULT_TIMEOUT_MS,
  });

  const response = await client.messages.create({
    model,
    max_tokens: options.maxOutputTokens ?? 4096,
    temperature: options.temperature ?? 0.2,
    system: options.systemPrompt + JSON_ONLY_SUFFIX,
    messages: [{ role: 'user', content: options.userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Empty response from Anthropic');
  }

  const promptTokens = response.usage?.input_tokens ?? 0;
  const completionTokens = response.usage?.output_tokens ?? 0;

  return {
    text: stripJsonFences(textBlock.text),
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    },
  };
}

/**
 * Claude sometimes wraps JSON in ```json ... ``` fences even when told not to.
 * Strip them defensively so downstream JSON.parse succeeds.
 */
function stripJsonFences(text: string): string {
  let out = text.trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  return out;
}
