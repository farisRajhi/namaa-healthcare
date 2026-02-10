type Lang = 'ar' | 'en'

interface BilingualMessage {
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
