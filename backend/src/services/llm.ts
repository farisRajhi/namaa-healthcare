import OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions.js';
import { validateIntermediate } from './ai/guardrails.js';
import { REGISTERED_TOOL_NAMES } from './ai/toolRegistry.js';
// ─────────────────────────────────────────────────────────
// LLM Service — Multi-Provider Chat + Function Calling
// Supports OpenAI (GPT) and Google Gemini natively.
// Agentic tool loop inspired by claw-code's turn budget.
// ─────────────────────────────────────────────────────────

/**
 * Tools that mutate persistent state. If one of these executes successfully
 * in the primary tool loop and the loop later fails, we MUST NOT replay the
 * conversation against the fallback model — the booking has already been
 * persisted. Instead we return a safe "we'll be in touch" message.
 */
const MUTATION_TOOLS: ReadonlySet<string> = new Set([
  'book_appointment',
  'hold_appointment',
  'cancel_appointment',
  'reschedule_appointment',
  'book_appointment_guest',
]);

/** Safe Arabic fallback when the tool loop times out. */
const TIMEOUT_FALLBACK_AR = 'عذراً، يوجد ضغط حالياً. سأتواصل معك قريباً.';

/** Safe Arabic fallback when a mutation completed but the post-mutation reply errored. */
const POST_MUTATION_FALLBACK_AR = 'تم تسجيل طلبك. سيتواصل معك أحد موظفي العيادة قريباً للتأكيد. شكراً لصبرك.';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ToolCallResult {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  durationMs: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatResult {
  text: string;
  usage: TokenUsage;
}

export interface ChatWithToolsResult {
  response: string;
  toolCalls: ToolCallResult[];
  totalIterations: number;
  finishReason: string;
  usage: TokenUsage;
}

function zeroUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addOpenAIUsage(acc: TokenUsage, u: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null | undefined): void {
  if (!u) return;
  acc.promptTokens += u.prompt_tokens ?? 0;
  acc.completionTokens += u.completion_tokens ?? 0;
  acc.totalTokens += u.total_tokens ?? 0;
}

function addGeminiUsage(acc: TokenUsage, u: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } | null | undefined, fallbackText?: string): void {
  if (u && (u.promptTokenCount || u.candidatesTokenCount || u.totalTokenCount)) {
    acc.promptTokens += u.promptTokenCount ?? 0;
    acc.completionTokens += u.candidatesTokenCount ?? 0;
    acc.totalTokens += u.totalTokenCount ?? ((u.promptTokenCount ?? 0) + (u.candidatesTokenCount ?? 0));
    return;
  }
  // Fallback: rough char-based estimate (~4 chars per token)
  if (fallbackText) {
    const est = Math.ceil(fallbackText.length / 4);
    acc.completionTokens += est;
    acc.totalTokens += est;
  }
}

type Provider = 'openai' | 'gemini';

/**
 * Per-call mutable tracker passed to the provider tool-loop implementations.
 * Used by the public wrapper to decide how to handle errors mid-loop.
 */
interface ToolLoopTracker {
  mutationExecuted: boolean;
  mutationName: string | null;
  /** Conversation state to feed into the fallback if no mutation occurred. */
  accumulatedMessages: ChatMessage[];
}

/**
 * Decide whether a tool execution failed. Used to gate the
 * mutation-success tracker so we don't suppress fallbacks after a failed
 * mutation. Treats empty results, "Error" / "error:" prefixes, and the ❌
 * convention as failures. Anything else (including ✅) counts as success.
 */
function isToolFailure(result: string): boolean {
  if (!result || !result.trim()) return true;
  return /^(error|❌)/i.test(result.trim());
}

/**
 * Decide whether an LLM call should be retried on the fallback provider.
 * Covers rate-limiting (429), upstream outages (5xx), and network timeouts.
 */
function isRetryableLLMError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || '';
  // Gemini AI Studio REST errors: "Gemini API 429: ..."
  // Vertex AI REST errors: "Vertex AI 429: ..."
  if (/\b(?:Gemini API|Vertex AI) (?:429|5\d\d)\b/.test(msg)) return true;
  // OpenAI SDK errors include status on the error object
  const status = (err as any)?.status ?? (err as any)?.response?.status;
  if (status === 429 || (status >= 500 && status < 600)) return true;
  // Network layer
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|aborted|fetch failed/i.test(msg)) return true;
  return false;
}

export class LLMService {
  private openaiClient: OpenAI | null = null;
  private model: string;
  private provider: Provider;
  private fallback: LLMService | null = null;

  /**
   * @param modelOverride Internal: used when constructing a fallback instance.
   *   When provided, no further fallback chain is built (single level only).
   */
  constructor(modelOverride?: string) {
    this.model = modelOverride ?? process.env.LLM_MODEL ?? 'gemini-2.5-flash';

    if (this.model.startsWith('gemini')) {
      this.provider = 'gemini';
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is required for Gemini models');
      }
    } else {
      this.provider = 'openai';
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this.openaiClient = new OpenAI({ apiKey });
    }

    // Auto-build a cross-provider fallback when the other key is present.
    // Override / disable with LLM_FALLBACK_MODEL (set to "none" to disable).
    if (!modelOverride) {
      const explicit = process.env.LLM_FALLBACK_MODEL;
      if (explicit && explicit !== 'none') {
        try { this.fallback = new LLMService(explicit); } catch { /* no fallback */ }
      } else if (!explicit) {
        if (this.provider === 'gemini' && process.env.OPENAI_API_KEY) {
          try { this.fallback = new LLMService('gpt-5.4-mini'); } catch { /* no fallback */ }
        } else if (this.provider === 'openai' && process.env.GEMINI_API_KEY) {
          try { this.fallback = new LLMService('gemini-2.5-flash'); } catch { /* no fallback */ }
        }
      }
    }
  }

  /**
   * Simple chat completion (no tools). Returns text + token usage.
   */
  async chat(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult> {
    try {
      return this.provider === 'gemini'
        ? await this.chatGemini(messages, systemPrompt)
        : await this.chatOpenAI(messages, systemPrompt);
    } catch (err) {
      if (this.fallback && isRetryableLLMError(err)) {
        console.warn(`[llm] primary ${this.provider}/${this.model} failed (${(err as Error).message?.slice(0, 120)}), falling back to ${this.fallback.provider}/${this.fallback.model}`);
        return this.fallback.chat(messages, systemPrompt);
      }
      throw err;
    }
  }

  /**
   * Chat with function calling — agentic tool loop.
   *
   * @param options.timeoutMs Wall-clock budget for the entire loop (default 25000ms).
   *   On timeout we abort outstanding work and return a safe Arabic fallback so
   *   we never leak partial tool calls to the patient.
   */
  async chatWithTools(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ChatCompletionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      maxIterations?: number;
      timeoutMs?: number;
      onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: string) => void;
    },
  ): Promise<ChatWithToolsResult> {
    const timeoutMs = options?.timeoutMs ?? 25000;
    const controller = new AbortController();
    // Tracker shared with provider implementations so we can route fallbacks
    // correctly when a mutation has already been persisted.
    const tracker: ToolLoopTracker = {
      mutationExecuted: false,
      mutationName: null,
      accumulatedMessages: [...messages],
    };

    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new Error('CHAT_WITH_TOOLS_TIMEOUT'));
      }, timeoutMs);
    });

    const runPrimary = async (): Promise<ChatWithToolsResult> => {
      return this.provider === 'gemini'
        ? this.chatWithToolsGemini(messages, systemPrompt, tools, executeTool, options, controller.signal, tracker)
        : this.chatWithToolsOpenAI(messages, systemPrompt, tools, executeTool, options, controller.signal, tracker);
    };

    try {
      const result = await Promise.race([runPrimary(), timeoutPromise]);
      return result;
    } catch (err) {
      // Timeout — return safe Arabic fallback. Do not retry: a mutation may be
      // mid-flight and we cannot tell.
      if (err instanceof Error && err.message === 'CHAT_WITH_TOOLS_TIMEOUT') {
        console.warn(`[llm] chatWithTools timed out after ${timeoutMs}ms (provider=${this.provider}, mutation=${tracker.mutationExecuted})`);
        return {
          response: tracker.mutationExecuted ? POST_MUTATION_FALLBACK_AR : TIMEOUT_FALLBACK_AR,
          toolCalls: [],
          totalIterations: 0,
          finishReason: 'timeout',
          usage: zeroUsage(),
        };
      }

      if (this.fallback && isRetryableLLMError(err)) {
        // If a mutation tool already ran successfully, do NOT replay against
        // the fallback — the booking is persisted. Surface a safe message and
        // log so ops can correlate the orphaned reply.
        if (tracker.mutationExecuted) {
          console.warn(`[llm] primary ${this.provider}/${this.model} failed after mutation tool '${tracker.mutationName}' completed — skipping fallback to avoid duplicate booking`);
          return {
            response: POST_MUTATION_FALLBACK_AR,
            toolCalls: [],
            totalIterations: 0,
            finishReason: 'mutation_completed_post_error',
            usage: zeroUsage(),
          };
        }
        console.warn(`[llm] primary ${this.provider}/${this.model} chatWithTools failed (${(err as Error).message?.slice(0, 120)}), falling back to ${this.fallback.provider}/${this.fallback.model}`);
        // Pass the accumulated conversation state so the fallback continues from
        // the right place rather than orphaning intermediate turns.
        return this.fallback.chatWithTools(tracker.accumulatedMessages, systemPrompt, tools, executeTool, options);
      }
      throw err;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  // ─── OpenAI Implementation ────────────────────────────

  private async chatOpenAI(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult> {
    const response = await this.openaiClient!.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    });
    const usage = zeroUsage();
    addOpenAIUsage(usage, response.usage);
    return {
      text: response.choices[0]?.message?.content || '',
      usage,
    };
  }

  private async chatWithToolsOpenAI(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ChatCompletionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      maxIterations?: number;
      onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: string) => void;
    },
    abortSignal?: AbortSignal,
    tracker?: ToolLoopTracker,
  ): Promise<ChatWithToolsResult> {
    const maxIterations = options?.maxIterations ?? 3;
    const allToolCalls: ToolCallResult[] = [];
    const usage = zeroUsage();

    const fullMessages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    let iteration = 0;
    let finishReason = 'stop';

    while (iteration < maxIterations) {
      if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
      iteration++;

      const response = await this.openaiClient!.chat.completions.create({
        model: this.model,
        messages: fullMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      }, { signal: abortSignal });

      addOpenAIUsage(usage, response.usage);

      const choice = response.choices[0];
      if (!choice) break;

      finishReason = choice.finish_reason ?? 'stop';
      const assistantMessage = choice.message;

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const finalText = assistantMessage.content || '';
        if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: finalText });
        return {
          response: finalText,
          toolCalls: allToolCalls,
          totalIterations: iteration,
          finishReason,
          usage,
        };
      }

      // Intermediate-turn guardrails: when the model emits BOTH text content
      // and tool calls, validate the text. If the reasoning crosses scope
      // (medical advice, treatment recs, etc.), bail out with a safe response
      // before the tool fires further mutations.
      const intermediateText = assistantMessage.content ?? '';
      if (intermediateText.trim()) {
        const lang: 'ar' | 'en' = /[\u0600-\u06FF]/.test(intermediateText) ? 'ar' : 'en';
        const check = validateIntermediate(intermediateText, lang);
        if (check.violation) {
          console.warn(`[llm] intermediate guardrail violation (openai): ${check.reason}`);
          return {
            response: check.safeResponse ?? intermediateText,
            toolCalls: allToolCalls,
            totalIterations: iteration,
            finishReason: 'guardrail_block',
            usage,
          };
        }
        if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: intermediateText });
      }

      fullMessages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      } as unknown as ChatCompletionMessageParam);

      for (const toolCall of assistantMessage.tool_calls) {
        if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
        const fn = (toolCall as { function: { name: string; arguments: string } }).function;
        const toolName = fn.name;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }

        options?.onToolCall?.(toolName, args);
        const { result, durationMs } = await this.executeToolSafe(executeTool, toolName, args);
        allToolCalls.push({ toolName, args, result, durationMs });
        // Track any successful mutation so the outer wrapper can avoid
        // double-charging the patient if the LLM call later fails.
        if (tracker && MUTATION_TOOLS.has(toolName) && !isToolFailure(result)) {
          tracker.mutationExecuted = true;
          tracker.mutationName = toolName;
        }
        options?.onToolResult?.(toolName, result);

        fullMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        } as ChatCompletionMessageParam);
      }
    }

    if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
    const finalResponse = await this.openaiClient!.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    }, { signal: abortSignal });

    addOpenAIUsage(usage, finalResponse.usage);

    const finalText = finalResponse.choices[0]?.message?.content || '';
    if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: finalText });
    return {
      response: finalText,
      toolCalls: allToolCalls,
      totalIterations: iteration,
      finishReason: 'max_iterations_reached',
      usage,
    };
  }

  // ─── Gemini Implementation (direct REST API) ──────────
  // Uses fetch instead of SDK to avoid event-loop blocking issues.
  // Supports two back-ends:
  //   1. AI Studio (generativelanguage.googleapis.com) — API key auth.
  //   2. Vertex AI  (aiplatform.googleapis.com)         — service-account auth.
  // Controlled by GEMINI_USE_VERTEX=true. Vertex AI bypasses the AI-Studio
  // free/paid tier system — quota is the GCP project's project-level quota.

  private geminiApiKey = process.env.GEMINI_API_KEY || '';
  private vertexTokenCache: { token: string; expiresAt: number } | null = null;

  private get useVertex(): boolean {
    return process.env.GEMINI_USE_VERTEX === 'true';
  }

  private async getVertexAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.vertexTokenCache && this.vertexTokenCache.expiresAt > now + 60_000) {
      return this.vertexTokenCache.token;
    }
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const res = await client.getAccessToken();
    if (!res.token) throw new Error('Vertex AI: failed to obtain access token');
    // Access tokens are valid for ~1 hour; cache conservatively for 50 minutes.
    this.vertexTokenCache = { token: res.token, expiresAt: now + 50 * 60_000 };
    return res.token;
  }

  private async geminiRest(
    body: Record<string, unknown>,
    model?: string,
  ): Promise<any> {
    const m = model || this.model;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      let url: string;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      let backendLabel: string;

      if (this.useVertex) {
        const project = process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
        if (!project) {
          throw new Error('GOOGLE_CLOUD_PROJECT env var required when GEMINI_USE_VERTEX=true');
        }
        const token = await this.getVertexAccessToken();
        url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${m}:generateContent`;
        headers.Authorization = `Bearer ${token}`;
        backendLabel = 'Vertex AI';
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${this.geminiApiKey}`;
        backendLabel = 'Gemini API';
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`${backendLabel} ${res.status}: ${errText.slice(0, 200)}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async chatGemini(messages: ChatMessage[], systemPrompt: string): Promise<ChatResult> {
    const contents = this.toGeminiContents(messages);
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      },
    };

    const data = await this.geminiRest(body);
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = zeroUsage();
    addGeminiUsage(usage, data?.usageMetadata, text);
    return { text, usage };
  }

  private async chatWithToolsGemini(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ChatCompletionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      maxIterations?: number;
      onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: string) => void;
    },
    abortSignal?: AbortSignal,
    tracker?: ToolLoopTracker,
  ): Promise<ChatWithToolsResult> {
    const maxIterations = options?.maxIterations ?? 3;
    const allToolCalls: ToolCallResult[] = [];
    const usage = zeroUsage();

    // Convert OpenAI tool definitions to Gemini format. Recursively preserves
    // enum / format / nested object & array schemas (the previous flattening
    // dropped these and shipped invalid schemas to Vertex for any tool that
    // declared an enum or nested object).
    const convertProp = (prop: Record<string, any>): Record<string, any> => {
      const out: Record<string, any> = { type: (prop.type || 'STRING').toUpperCase() };
      if (prop.description) out.description = prop.description;
      if (prop.enum) out.enum = prop.enum;
      if (prop.format) out.format = prop.format;
      if (prop.items) out.items = convertProp(prop.items);
      if (prop.properties && typeof prop.properties === 'object') {
        out.properties = {};
        for (const [k, v] of Object.entries(prop.properties as Record<string, any>)) {
          out.properties[k] = convertProp(v);
        }
        if (Array.isArray(prop.required) && prop.required.length > 0) {
          out.required = prop.required;
        }
      }
      return out;
    };
    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => {
        const fn = (t as any).function as { name: string; description?: string; parameters?: Record<string, unknown> };
        const params = fn.parameters as Record<string, unknown> | undefined;
        const rawProps = (params?.properties as Record<string, any>) || {};
        const properties: Record<string, any> = {};
        for (const [key, val] of Object.entries(rawProps)) {
          properties[key] = convertProp(val);
        }
        const required = (params?.required as string[]) || [];
        const decl: Record<string, any> = {
          name: fn.name,
          description: fn.description || '',
          parameters: { type: 'OBJECT', properties },
        };
        if (required.length > 0) decl.parameters.required = required;
        return decl;
      }),
    }] : undefined;

    const contents = this.toGeminiContents(messages);
    let iteration = 0;

    while (iteration < maxIterations) {
      if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
      iteration++;
      const body: Record<string, unknown> = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
          temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
        },
      };
      if (geminiTools) {
        body.tools = geminiTools;
        body.tool_config = { function_calling_config: { mode: 'AUTO' } };
      }

      const data = await this.geminiRest(body);
      const candidate = data?.candidates?.[0];

      // Accumulate usage (even if no candidate, may still charge for prompt tokens)
      const fallbackText: string = (candidate?.content?.parts || []).map((p: any) => p.text || '').join('');
      addGeminiUsage(usage, data?.usageMetadata, fallbackText);

      if (!candidate) break;

      const parts = candidate?.content?.parts || [];
      let functionCalls = parts.filter((p: any) => p.functionCall);

      // Gemini sometimes outputs Python code like print(default_api.func(...)) instead
      // of proper function calls. Detect this and convert to real function calls.
      if (functionCalls.length === 0) {
        const text = parts.map((p: any) => p.text || '').join('');
        const parsed = this.parseGeminiCodeAsFunctionCalls(text);
        if (parsed.length > 0) {
          // Convert parsed code calls to proper function call parts
          const syntheticParts: any[] = [];
          for (const call of parsed) {
            const fcPart = { functionCall: { name: call.name, args: call.args } };
            functionCalls.push(fcPart);
            syntheticParts.push(fcPart);
          }
          // Add synthesized function call parts as model response (not the raw text)
          contents.push({ role: 'model', parts: syntheticParts });
        } else {
          // Pure-text terminal turn — guard intermediate scope before returning.
          if (text.trim()) {
            const lang: 'ar' | 'en' = /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
            const check = validateIntermediate(text, lang);
            if (check.violation) {
              console.warn(`[llm] intermediate guardrail violation (gemini-final): ${check.reason}`);
              return {
                response: check.safeResponse ?? text,
                toolCalls: allToolCalls,
                totalIterations: iteration,
                finishReason: 'guardrail_block',
                usage,
              };
            }
            if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: text });
          }
          return {
            response: text,
            toolCalls: allToolCalls,
            totalIterations: iteration,
            finishReason: candidate.finishReason || 'stop',
            usage,
          };
        }
      } else {
        // Add model response to conversation
        contents.push({ role: 'model', parts });

        // Intermediate-turn guardrails: when the model emits text alongside
        // tool calls, validate the text before any subsequent execution.
        const intermediateText = parts.map((p: any) => p.text || '').filter(Boolean).join('\n');
        if (intermediateText.trim()) {
          const lang: 'ar' | 'en' = /[\u0600-\u06FF]/.test(intermediateText) ? 'ar' : 'en';
          const check = validateIntermediate(intermediateText, lang);
          if (check.violation) {
            console.warn(`[llm] intermediate guardrail violation (gemini): ${check.reason}`);
            return {
              response: check.safeResponse ?? intermediateText,
              toolCalls: allToolCalls,
              totalIterations: iteration,
              finishReason: 'guardrail_block',
              usage,
            };
          }
          if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: intermediateText });
        }
      }

      // Execute each function call
      const functionResponses: any[] = [];
      for (const part of functionCalls) {
        if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
        const toolName = part.functionCall.name;
        const args = part.functionCall.args || {};

        options?.onToolCall?.(toolName, args);
        const { result: toolResult, durationMs } = await this.executeToolSafe(executeTool, toolName, args);
        allToolCalls.push({ toolName, args, result: toolResult, durationMs });
        // Track successful mutations so the outer wrapper can avoid replay.
        if (tracker && MUTATION_TOOLS.has(toolName) && !isToolFailure(toolResult)) {
          tracker.mutationExecuted = true;
          tracker.mutationName = toolName;
        }
        options?.onToolResult?.(toolName, toolResult);

        functionResponses.push({
          functionResponse: { name: toolName, response: { result: toolResult } },
        });
      }

      contents.push({ role: 'user', parts: functionResponses });
    }

    if (abortSignal?.aborted) throw new Error('CHAT_WITH_TOOLS_TIMEOUT');
    // Budget exhausted — final call without tools
    const finalBody = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      },
    };
    const finalData = await this.geminiRest(finalBody);
    const text = finalData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    addGeminiUsage(usage, finalData?.usageMetadata, text);

    if (tracker) tracker.accumulatedMessages.push({ role: 'assistant', content: text });
    return {
      response: text,
      toolCalls: allToolCalls,
      totalIterations: iteration,
      finishReason: 'max_iterations_reached',
      usage,
    };
  }

  // ─── Shared Helpers ───────────────────────────────────

  /** Execute a tool with retry for transient errors */
  private async executeToolSafe(
    executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ result: string; durationMs: number }> {
    const startTime = Date.now();
    let result: string;

    try {
      result = await executeTool(toolName, args);
    } catch (err: unknown) {
      const errCode = (err as any)?.code;
      const isTransient = errCode === 'P2024' || errCode === 'P2028' ||
        (err instanceof Error && /ECONNRESET|ETIMEDOUT|ECONNREFUSED/.test(err.message));

      if (isTransient) {
        await new Promise(r => setTimeout(r, 500));
        try {
          result = await executeTool(toolName, args);
        } catch {
          result = 'عذراً، حدث خطأ تقني مؤقت. يرجى المحاولة مرة أخرى. Sorry, a temporary technical error occurred. Please try again.';
        }
      } else {
        console.error(`Tool execution error [${toolName}]:`, err);
        result = 'عذراً، حدث خطأ تقني. يرجى المحاولة مرة أخرى. Sorry, a technical error occurred. Please try again.';
      }
    }

    return { result, durationMs: Date.now() - startTime };
  }

  /**
   * Parse Gemini text that contains Python-style function calls like:
   *   print(default_api.check_availability(date='2026-04-12', providerId='abc'))
   * Returns parsed function calls or empty array if no match.
   */
  private parseGeminiCodeAsFunctionCalls(text: string): { name: string; args: Record<string, unknown> }[] {
    const results: { name: string; args: Record<string, unknown> }[] = [];

    // Match patterns like: default_api.function_name(arg1='val1', arg2='val2')
    // or: print(default_api.function_name(arg1='val1'))
    const regex = /(?:default_api|api)\.(\w+)\(([^)]*)\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const name = match[1];
      // Allowlist: drop synthesized calls that don't correspond to a registered
      // tool. Without this, Gemini hallucinations like `default_api.send_sms(...)`
      // would silently bubble through to executeTool and fail late.
      if (!REGISTERED_TOOL_NAMES.has(name)) {
        console.warn(`[llm] skipping synthesized Gemini function call for unregistered tool: ${name}`);
        continue;
      }
      const argsStr = match[2];
      const args: Record<string, unknown> = {};

      // Parse keyword arguments: key='value' or key="value" or key=value
      const argRegex = /(\w+)\s*=\s*(?:'([^']*)'|"([^"]*)"|(\S+))/g;
      let argMatch;
      while ((argMatch = argRegex.exec(argsStr)) !== null) {
        const key = argMatch[1];
        const val = argMatch[2] ?? argMatch[3] ?? argMatch[4];
        // Try to parse as number/boolean
        if (val === 'true') args[key] = true;
        else if (val === 'false') args[key] = false;
        else if (/^\d+$/.test(val)) args[key] = parseInt(val, 10);
        else args[key] = val;
      }

      results.push({ name, args });
    }

    return results;
  }

  /** Convert ChatMessage[] to Gemini contents with strict alternating roles */
  private toGeminiContents(messages: ChatMessage[]): { role: string; parts: { text: string }[] }[] {
    const contents: { role: string; parts: { text: string }[] }[] = [];

    for (const m of messages) {
      const role = m.role === 'user' ? 'user' : 'model';
      const last = contents[contents.length - 1];

      if (last && last.role === role) {
        // Gemini requires alternating roles — merge consecutive same-role messages
        last.parts.push({ text: '\n' + m.content });
      } else {
        contents.push({ role, parts: [{ text: m.content }] });
      }
    }

    // Gemini requires the first message to be from 'user'
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.shift();
    }

    return contents;
  }

}

let llmService: LLMService | null = null;

export function getLLMService(): LLMService {
  if (!llmService) {
    llmService = new LLMService();
  }
  return llmService;
}
