// ─────────────────────────────────────────────────────────
// Error Classifier — Context-Aware Recovery Messages
// Categorizes errors and provides specific bilingual
// (Arabic + English) recovery messages for WhatsApp users.
// ─────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'llm_timeout'
  | 'rate_limit'
  | 'validation'
  | 'tool_failure'
  | 'permission'
  | 'system';

export interface ClassifiedError {
  category: ErrorCategory;
  messageAr: string;
  messageEn: string;
  recoverable: boolean;
  shouldPreserveFlowState: boolean;
}

/** Classify an error and return a context-aware recovery message */
export function classifyError(err: unknown, context?: { toolName?: string; field?: string }): ClassifiedError {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';

  // LLM / API timeout
  if (
    message.includes('timeout') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNRESET') ||
    message.includes('socket hang up') ||
    name === 'AbortError'
  ) {
    return {
      category: 'llm_timeout',
      messageAr: '⏳ النظام مشغول حالياً. يرجى إعادة إرسال رسالتك بعد لحظات.',
      messageEn: 'The system is busy. Please resend your message in a moment.',
      recoverable: true,
      shouldPreserveFlowState: true,
    };
  }

  // Rate limiting (from OpenAI or our own rate limiter)
  if (
    message.includes('rate limit') ||
    message.includes('Rate limit') ||
    message.includes('429') ||
    message.includes('Too Many Requests') ||
    message.includes('AI_LIMIT')
  ) {
    return {
      category: 'rate_limit',
      messageAr: '⏳ أرسلت رسائل كثيرة. انتظر دقيقة من فضلك ثم حاول مرة أخرى.',
      messageEn: 'Too many messages sent. Please wait a minute and try again.',
      recoverable: true,
      shouldPreserveFlowState: true,
    };
  }

  // Permission / identity errors
  if (
    message.includes('Patient not identified') ||
    message.includes('المريض غير محدد') ||
    message.includes('Identity verification required') ||
    message.includes('permission')
  ) {
    return {
      category: 'permission',
      messageAr: '🔐 يجب التحقق من هويتك أولاً. هل أنت مسجل لدينا؟ إذا كنت مريض جديد، أخبرني باسمك ورقم جوالك.',
      messageEn: 'Identity verification required. Are you registered? If you are a new patient, provide your name and phone number.',
      recoverable: true,
      shouldPreserveFlowState: true,
    };
  }

  // Validation errors (invalid date, bad format, etc.)
  if (
    message.includes('Invalid') ||
    message.includes('invalid') ||
    message.includes('غير صحيح') ||
    message.includes('required') ||
    message.includes('مطلوب') ||
    message.includes('format')
  ) {
    const fieldHint = context?.field ? ` (${context.field})` : '';
    return {
      category: 'validation',
      messageAr: `❌ المعلومات غير صحيحة${fieldHint}. ممكن تعيد المحاولة؟`,
      messageEn: `Invalid input${fieldHint}. Could you try again?`,
      recoverable: true,
      shouldPreserveFlowState: true,
    };
  }

  // Tool execution failure (SLOT_CONFLICT, not found, etc.)
  if (
    message.includes('SLOT_CONFLICT') ||
    message.includes('غير موجود') ||
    message.includes('not found') ||
    message.includes('محجوز بالفعل') ||
    message.includes('already booked') ||
    context?.toolName
  ) {
    const toolHint = context?.toolName ? ` (${context.toolName})` : '';
    return {
      category: 'tool_failure',
      messageAr: `⚠️ ما قدرت أكمل الطلب${toolHint}. تبي تجرب خيار ثاني؟`,
      messageEn: `Could not complete the action${toolHint}. Would you like to try a different option?`,
      recoverable: true,
      shouldPreserveFlowState: true,
    };
  }

  // System / unknown errors
  return {
    category: 'system',
    messageAr: '🏥 عذراً، حدث خطأ تقني. يرجى المحاولة مرة أخرى أو الاتصال بالعيادة مباشرة.',
    messageEn: 'A technical error occurred. Please try again or contact the clinic directly.',
    recoverable: false,
    shouldPreserveFlowState: false,
  };
}

/** Format the classified error as a single WhatsApp-friendly message */
export function formatErrorMessage(classified: ClassifiedError): string {
  return `${classified.messageAr}\n\n${classified.messageEn}`;
}
