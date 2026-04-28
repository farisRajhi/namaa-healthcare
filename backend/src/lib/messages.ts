export type Lang = 'ar' | 'en'

export interface BilingualMessage {
  ar: string
  en: string
}

export const messages = {
  auth: {
    invalidCredentials: { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials' } as BilingualMessage,
    emailTaken: { ar: 'البريد الإلكتروني مسجل مسبقاً', en: 'Email already registered' } as BilingualMessage,
    unauthorized: { ar: 'غير مصرح', en: 'Unauthorized' } as BilingualMessage,
    userNotFound: { ar: 'المستخدم غير موجود', en: 'User not found' } as BilingualMessage,
    passwordMinLength: { ar: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', en: 'Password must be at least 8 characters' } as BilingualMessage,
    accountDisabled: { ar: 'الحساب معطل', en: 'Account is disabled' } as BilingualMessage,
  },
  common: {
    notFound: { ar: 'غير موجود', en: 'Not found' } as BilingualMessage,
    serverError: { ar: 'خطأ في الخادم', en: 'Server error' } as BilingualMessage,
    validationError: { ar: 'خطأ في البيانات المدخلة', en: 'Validation error' } as BilingualMessage,
    created: { ar: 'تم الإنشاء بنجاح', en: 'Created successfully' } as BilingualMessage,
    updated: { ar: 'تم التحديث بنجاح', en: 'Updated successfully' } as BilingualMessage,
    deleted: { ar: 'تم الحذف بنجاح', en: 'Deleted successfully' } as BilingualMessage,
    forbidden: { ar: 'غير مسموح', en: 'Forbidden' } as BilingualMessage,
  },
  appointments: {
    notFound: { ar: 'الموعد غير موجود', en: 'Appointment not found' } as BilingualMessage,
    conflict: { ar: 'يوجد تعارض في المواعيد', en: 'Appointment time conflict' } as BilingualMessage,
    cancelled: { ar: 'تم إلغاء الموعد', en: 'Appointment cancelled' } as BilingualMessage,
    booked: { ar: 'تم حجز الموعد بنجاح', en: 'Appointment booked successfully' } as BilingualMessage,
  },
  patients: {
    notFound: { ar: 'المريض غير موجود', en: 'Patient not found' } as BilingualMessage,
    created: { ar: 'تم تسجيل المريض بنجاح', en: 'Patient registered successfully' } as BilingualMessage,
    duplicate: { ar: 'المريض مسجل مسبقاً', en: 'Patient already registered' } as BilingualMessage,
  },
  providers: {
    notFound: { ar: 'الطبيب غير موجود', en: 'Provider not found' } as BilingualMessage,
    noAvailability: { ar: 'لا توجد أوقات متاحة', en: 'No availability found' } as BilingualMessage,
  },
  plan: {
    limitReachedConversations: {
      ar: 'تم بلوغ الحد الشهري للمحادثات في خطتك الحالية. يرجى الترقية للاستمرار.',
      en: 'You have reached your plan\'s monthly conversation limit. Please upgrade to continue.',
    } as BilingualMessage,
    limitReachedTokens: {
      ar: 'تم بلوغ الحد الشهري لاستهلاك الذكاء الاصطناعي. يرجى الترقية للاستمرار.',
      en: 'You have reached your plan\'s monthly AI token limit. Please upgrade to continue.',
    } as BilingualMessage,
    limitReachedProviders: {
      ar: 'تم بلوغ الحد الأقصى للأطباء في خطتك الحالية. يرجى الترقية لإضافة المزيد.',
      en: 'You have reached your plan\'s active provider limit. Please upgrade to add more.',
    } as BilingualMessage,
    approachingLimitConversations: {
      ar: 'اقتربت من الحد الشهري للمحادثات. يُرجى التفكير في ترقية الخطة.',
      en: 'You are approaching your monthly conversation limit. Consider upgrading.',
    } as BilingualMessage,
    approachingLimitTokens: {
      ar: 'اقتربت من الحد الشهري لاستهلاك الذكاء الاصطناعي. يُرجى التفكير في ترقية الخطة.',
      en: 'You are approaching your monthly AI token limit. Consider upgrading.',
    } as BilingualMessage,
  },
  org: {
    notActivated: {
      ar: 'حسابك في انتظار التفعيل من قبل إدارة توافد. يرجى التواصل معنا.',
      en: 'Your account is awaiting activation by Tawafud staff. Please contact support.',
    } as BilingualMessage,
  },
  platform: {
    invalidCredentials: { ar: 'بيانات الاعتماد غير صحيحة', en: 'Invalid credentials' } as BilingualMessage,
    adminNotFound: { ar: 'مدير المنصة غير موجود', en: 'Platform admin not found' } as BilingualMessage,
    tokenInvalidated: { ar: 'تم إبطال الجلسة', en: 'Token has been invalidated' } as BilingualMessage,
    orgNotFound: { ar: 'المؤسسة غير موجودة', en: 'Org not found' } as BilingualMessage,
    subscriptionNotFound: { ar: 'الاشتراك غير موجود', en: 'Subscription not found' } as BilingualMessage,
    noActiveUserInOrg: { ar: 'لا يوجد مستخدم نشط في هذه المؤسسة', en: 'No active user found in this org' } as BilingualMessage,
    cannotImpersonateInactiveOrg: { ar: 'لا يمكن انتحال هوية مستخدم في مؤسسة غير نشطة', en: 'Cannot impersonate user in a non-active org' } as BilingualMessage,
    rateLimitExceeded: { ar: 'تم تجاوز الحد المسموح، حاول مرة أخرى بعد {seconds} ثانية', en: 'Rate limit exceeded, retry in {seconds}s' } as BilingualMessage,
    validationError: { ar: 'فشل التحقق من البيانات', en: 'Validation failed' } as BilingualMessage,
    cancelReasonTooShort: { ar: 'يجب أن يكون السبب 3 أحرف على الأقل', en: 'Reason must be at least 3 characters' } as BilingualMessage,
    subscriptionOverrideRequiresField: { ar: 'يجب تحديد قيمة واحدة على الأقل من: الخطة، تاريخ الانتهاء، أو الحالة', en: 'At least one of plan, endDate, or status must be provided' } as BilingualMessage,
  },
}

/**
 * Extract language preference from Accept-Language header
 */
export function getLang(acceptLanguage?: string): Lang {
  if (!acceptLanguage) return 'ar'
  return acceptLanguage.toLowerCase().includes('en') ? 'en' : 'ar'
}

/**
 * Get a message in the appropriate language
 */
export function msg(bilingualMessage: BilingualMessage, lang: Lang): string {
  return bilingualMessage[lang]
}
