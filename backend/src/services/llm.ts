import OpenAI from 'openai';
import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions.js';
// ─────────────────────────────────────────────────────────
// LLM Service — Multi-Provider Chat + Function Calling
// Supports OpenAI (GPT) and Google Gemini natively.
// Agentic tool loop inspired by claw-code's turn budget.
// ─────────────────────────────────────────────────────────

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

export interface ChatWithToolsResult {
  response: string;
  toolCalls: ToolCallResult[];
  totalIterations: number;
  finishReason: string;
}

type Provider = 'openai' | 'gemini';

export class LLMService {
  private openaiClient: OpenAI | null = null;
  private model: string;
  private provider: Provider;

  constructor() {
    this.model = process.env.LLM_MODEL || 'gpt-4-turbo-preview';

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
  }

  /**
   * Simple chat completion (no tools).
   */
  async chat(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    if (this.provider === 'gemini') {
      return this.chatGemini(messages, systemPrompt);
    }
    return this.chatOpenAI(messages, systemPrompt);
  }

  /**
   * Chat with function calling — agentic tool loop.
   */
  async chatWithTools(
    messages: ChatMessage[],
    systemPrompt: string,
    tools: ChatCompletionTool[],
    executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      maxIterations?: number;
      onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: string) => void;
    },
  ): Promise<ChatWithToolsResult> {
    if (this.provider === 'gemini') {
      return this.chatWithToolsGemini(messages, systemPrompt, tools, executeTool, options);
    }
    return this.chatWithToolsOpenAI(messages, systemPrompt, tools, executeTool, options);
  }

  // ─── OpenAI Implementation ────────────────────────────

  private async chatOpenAI(messages: ChatMessage[], systemPrompt: string): Promise<string> {
    const response = await this.openaiClient!.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    });
    return response.choices[0]?.message?.content || '';
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
  ): Promise<ChatWithToolsResult> {
    const maxIterations = options?.maxIterations ?? 6;
    const allToolCalls: ToolCallResult[] = [];

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
      iteration++;

      const response = await this.openaiClient!.chat.completions.create({
        model: this.model,
        messages: fullMessages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
        temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      });

      const choice = response.choices[0];
      if (!choice) break;

      finishReason = choice.finish_reason ?? 'stop';
      const assistantMessage = choice.message;

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return {
          response: assistantMessage.content || '',
          toolCalls: allToolCalls,
          totalIterations: iteration,
          finishReason,
        };
      }

      fullMessages.push({
        role: 'assistant',
        content: assistantMessage.content ?? null,
        tool_calls: assistantMessage.tool_calls,
      } as unknown as ChatCompletionMessageParam);

      for (const toolCall of assistantMessage.tool_calls) {
        const fn = (toolCall as { function: { name: string; arguments: string } }).function;
        const toolName = fn.name;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(fn.arguments || '{}'); } catch { args = {}; }

        options?.onToolCall?.(toolName, args);
        const { result, durationMs } = await this.executeToolSafe(executeTool, toolName, args);
        allToolCalls.push({ toolName, args, result, durationMs });
        options?.onToolResult?.(toolName, result);

        fullMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        } as ChatCompletionMessageParam);
      }
    }

    const finalResponse = await this.openaiClient!.chat.completions.create({
      model: this.model,
      messages: fullMessages,
      max_tokens: parseInt(process.env.LLM_MAX_TOKENS || '1024'),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
    });

    return {
      response: finalResponse.choices[0]?.message?.content || '',
      toolCalls: allToolCalls,
      totalIterations: iteration,
      finishReason: 'max_iterations_reached',
    };
  }

  // ─── Gemini Implementation (direct REST API) ──────────
  // Uses fetch instead of SDK to avoid event-loop blocking issues

  private geminiApiKey = process.env.GEMINI_API_KEY || '';

  private async geminiRest(
    body: Record<string, unknown>,
    model?: string,
  ): Promise<any> {
    const m = model || this.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${this.geminiApiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async chatGemini(messages: ChatMessage[], systemPrompt: string): Promise<string> {
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
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  ): Promise<ChatWithToolsResult> {
    const maxIterations = options?.maxIterations ?? 6;
    const allToolCalls: ToolCallResult[] = [];

    // Convert OpenAI tool definitions to Gemini format
    const geminiTools = tools.length > 0 ? [{
      functionDeclarations: tools.map(t => {
        const fn = (t as any).function as { name: string; description?: string; parameters?: Record<string, unknown> };
        const params = fn.parameters as Record<string, unknown> | undefined;
        const properties: Record<string, any> = {};
        const rawProps = (params?.properties as Record<string, any>) || {};
        for (const [key, val] of Object.entries(rawProps)) {
          properties[key] = { type: (val.type || 'STRING').toUpperCase(), description: val.description || '' };
        }
        return {
          name: fn.name,
          description: fn.description || '',
          parameters: { type: 'OBJECT', properties, required: (params?.required as string[]) || [] },
        };
      }),
    }] : undefined;

    const contents = this.toGeminiContents(messages);
    let iteration = 0;

    while (iteration < maxIterations) {
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
          return {
            response: text,
            toolCalls: allToolCalls,
            totalIterations: iteration,
            finishReason: candidate.finishReason || 'stop',
          };
        }
      } else {
        // Add model response to conversation
        contents.push({ role: 'model', parts });
      }

      // Execute each function call
      const functionResponses: any[] = [];
      for (const part of functionCalls) {
        const toolName = part.functionCall.name;
        const args = part.functionCall.args || {};

        options?.onToolCall?.(toolName, args);
        const { result: toolResult, durationMs } = await this.executeToolSafe(executeTool, toolName, args);
        allToolCalls.push({ toolName, args, result: toolResult, durationMs });
        options?.onToolResult?.(toolName, toolResult);

        functionResponses.push({
          functionResponse: { name: toolName, response: { result: toolResult } },
        });
      }

      contents.push({ role: 'user', parts: functionResponses });
    }

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

    return {
      response: text,
      toolCalls: allToolCalls,
      totalIterations: iteration,
      finishReason: 'max_iterations_reached',
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
