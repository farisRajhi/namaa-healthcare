// ─────────────────────────────────────────────────────────
// Agent Builder — LLM Instruction Extractor
// Reads an Agent Builder flow and extracts LLM instructions
// that customize how the AI responds to patients.
// The flow is a GUIDE for the LLM, not a replacement.
// ─────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import { NodeType, InstructionCategory } from './nodeTypes.js';

export interface LLMInstructions {
  greeting: { ar: string; en: string } | null;
  tone: string | null;
  businessRules: string[];
  escalationTriggers: string[];
  bookingInstructions: string | null;
  faqOverrides: string[];
  customInstructions: string[];
}

/**
 * Extract LLM instructions from an Agent Builder flow's nodes.
 * Instruction nodes (NodeType.INSTRUCTION) are parsed by category.
 * Also extracts instructions from settings.llmInstructions if present.
 */
export function extractInstructions(nodes: any[], settings?: any): LLMInstructions {
  const instructions: LLMInstructions = {
    greeting: null,
    tone: null,
    businessRules: [],
    escalationTriggers: [],
    bookingInstructions: null,
    faqOverrides: [],
    customInstructions: [],
  };

  if (!nodes || !Array.isArray(nodes)) return instructions;

  // Sort by priority (higher first)
  const instructionNodes = nodes
    .filter((n: any) => n.type === NodeType.INSTRUCTION || n.type === 'instruction')
    .sort((a: any, b: any) => (b.data?.instructionPriority ?? 5) - (a.data?.instructionPriority ?? 5));

  for (const node of instructionNodes) {
    const data = node.data;
    if (!data) continue;

    const category: InstructionCategory = data.instructionCategory;
    const textAr = data.instructionTextAr || data.instructionText || '';
    const textEn = data.instructionText || '';

    switch (category) {
      case 'greeting':
        instructions.greeting = {
          ar: textAr,
          en: textEn,
        };
        break;

      case 'tone':
        instructions.tone = textAr || textEn;
        break;

      case 'business_rule':
        if (textAr) instructions.businessRules.push(textAr);
        if (textEn && textEn !== textAr) instructions.businessRules.push(textEn);
        break;

      case 'escalation':
        if (textAr) instructions.escalationTriggers.push(textAr);
        if (textEn && textEn !== textAr) instructions.escalationTriggers.push(textEn);
        break;

      case 'booking_flow':
        instructions.bookingInstructions = textAr || textEn;
        break;

      case 'faq_override':
        if (textAr) instructions.faqOverrides.push(textAr);
        if (textEn && textEn !== textAr) instructions.faqOverrides.push(textEn);
        break;

      case 'custom':
        if (textAr) instructions.customInstructions.push(textAr);
        if (textEn && textEn !== textAr) instructions.customInstructions.push(textEn);
        break;
    }
  }

  // Also read from settings.llmInstructions if present (for simple settings-based config)
  if (settings?.llmInstructions) {
    const llm = settings.llmInstructions;
    if (llm.greeting && !instructions.greeting) {
      instructions.greeting = llm.greeting;
    }
    if (llm.tone && !instructions.tone) {
      instructions.tone = llm.tone;
    }
    if (Array.isArray(llm.businessRules)) {
      instructions.businessRules.push(...llm.businessRules);
    }
    if (Array.isArray(llm.escalationTriggers)) {
      instructions.escalationTriggers.push(...llm.escalationTriggers);
    }
    if (llm.bookingInstructions && !instructions.bookingInstructions) {
      instructions.bookingInstructions = llm.bookingInstructions;
    }
    if (Array.isArray(llm.faqOverrides)) {
      instructions.faqOverrides.push(...llm.faqOverrides);
    }
    if (Array.isArray(llm.customInstructions)) {
      instructions.customInstructions.push(...llm.customInstructions);
    }
  }

  return instructions;
}

/**
 * Build a system prompt section from extracted LLM instructions.
 * Returns a string to be appended to the system prompt.
 */
export function buildInstructionPrompt(instructions: LLMInstructions): string {
  const sections: string[] = [];

  // Greeting style guidance. We deliberately frame this as guidance instead of
  // "emit this exact phrase" — otherwise the LLM splits the greeting and the
  // real reply into two messages glued together.
  if (instructions.greeting) {
    const greet = instructions.greeting.ar || instructions.greeting.en;
    if (greet) {
      sections.push(`## أسلوب الترحيب (Greeting Style)
${greet}`);
    }
  }

  // Tone instructions
  if (instructions.tone) {
    sections.push(`## أسلوب الرد (Tone & Style)
${instructions.tone}`);
  }

  // Business rules
  if (instructions.businessRules.length > 0) {
    sections.push(`## قواعد العمل (Business Rules) — يجب اتباعها دائماً
${instructions.businessRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
  }

  // Escalation triggers
  if (instructions.escalationTriggers.length > 0) {
    sections.push(`## حالات التحويل لموظف (Escalation Triggers)
عند حدوث أي من الحالات التالية، قم بتحويل المحادثة فوراً لموظف بشري:
${instructions.escalationTriggers.map(t => `- ${t}`).join('\n')}`);
  }

  // Booking instructions
  if (instructions.bookingInstructions) {
    sections.push(`## تعليمات الحجز (Booking Flow)
${instructions.bookingInstructions}`);
  }

  // FAQ overrides
  if (instructions.faqOverrides.length > 0) {
    sections.push(`## إجابات مخصصة (Custom FAQ Answers)
عند سؤال المريض عن أي من المواضيع التالية، استخدم هذه الإجابات:
${instructions.faqOverrides.map(f => `- ${f}`).join('\n')}`);
  }

  // Custom instructions
  if (instructions.customInstructions.length > 0) {
    sections.push(`## تعليمات إضافية (Custom Instructions)
${instructions.customInstructions.map(c => `- ${c}`).join('\n')}`);
  }

  if (sections.length === 0) return '';

  return '\n\n# ═══ تخصيصات العيادة (Clinic Customizations) ═══\n' +
    'التعليمات التالية محددة من إدارة العيادة ويجب اتباعها:\n\n' +
    sections.join('\n\n');
}

/**
 * Load the active Agent Builder flow for an org and return LLM instructions.
 * Returns null if no active flow exists.
 */
export async function loadOrgInstructions(
  prisma: PrismaClient,
  orgId: string,
): Promise<LLMInstructions | null> {
  const activeFlow = await prisma.agentFlow.findFirst({
    where: {
      orgId,
      isActive: true,
      isTemplate: false,
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      nodes: true,
      settings: true,
    },
  });

  if (!activeFlow) return null;

  return extractInstructions(
    activeFlow.nodes as any[],
    activeFlow.settings as any,
  );
}
