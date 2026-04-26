/**
 * LLM Router for Patient Intelligence Pipeline
 *
 * Routes each of the three AI pipeline steps to either Gemini or Anthropic
 * based on environment variables. Lets us run a hybrid (cheap model for
 * high-volume scoring, premium model for creative campaign copy) without
 * code changes.
 *
 * Env vars:
 *   PATIENT_INTEL_DATA_PROVIDER       = 'gemini' | 'anthropic'   (default: gemini)
 *   PATIENT_INTEL_ANALYZER_PROVIDER   = 'gemini' | 'anthropic'   (default: gemini)
 *   PATIENT_INTEL_CAMPAIGN_PROVIDER   = 'gemini' | 'anthropic'   (default: gemini)
 *   GEMINI_API_KEY / GEMINI_MODEL
 *   ANTHROPIC_API_KEY / ANTHROPIC_MODEL
 */
import { geminiJsonChat } from './geminiClient.js';
import { anthropicJsonChat } from './anthropicClient.js';

export type PipelineStep = 'data-understanding' | 'patient-analysis' | 'campaign-generation';
export type LLMProvider = 'gemini' | 'anthropic';

export interface LLMChatOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

const STEP_ENV_VAR: Record<PipelineStep, string> = {
  'data-understanding': 'PATIENT_INTEL_DATA_PROVIDER',
  'patient-analysis': 'PATIENT_INTEL_ANALYZER_PROVIDER',
  'campaign-generation': 'PATIENT_INTEL_CAMPAIGN_PROVIDER',
};

const DEFAULT_PROVIDER: Record<PipelineStep, LLMProvider> = {
  'data-understanding': 'gemini',
  'patient-analysis': 'gemini',
  'campaign-generation': 'gemini',
};

/**
 * Resolve which provider to use for a given pipeline step.
 */
export function resolveProvider(step: PipelineStep): LLMProvider {
  const raw = process.env[STEP_ENV_VAR[step]]?.toLowerCase();
  if (raw === 'gemini' || raw === 'anthropic') {
    return raw;
  }
  return DEFAULT_PROVIDER[step];
}

export interface LLMChatResult {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Call the configured LLM provider for a pipeline step. Returns JSON text
 * + token usage (caller must JSON.parse the text).
 */
export async function llmJsonChat(
  step: PipelineStep,
  options: LLMChatOptions,
): Promise<LLMChatResult> {
  const provider = resolveProvider(step);

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        `ANTHROPIC_API_KEY not set but ${STEP_ENV_VAR[step]}=anthropic`,
      );
    }
    return anthropicJsonChat({ apiKey }, options);
  }

  // Gemini (default)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      `GEMINI_API_KEY not set but ${STEP_ENV_VAR[step]}=gemini`,
    );
  }
  return geminiJsonChat({ apiKey }, options);
}
