// ─────────────────────────────────────────────────────────
// Agent Builder — Built-in Flow Templates
// Pre-built templates for common medical clinic scenarios
// ─────────────────────────────────────────────────────────

import { NodeType, FlowNode, FlowEdge } from './nodeTypes.js'

export interface FlowTemplate {
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  templateCategory: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  variables: Record<string, any>
  settings: Record<string, any>
}

// ─────────────────────────────────────────────────────────
// 1. General Clinic — عيادة عامة
// ─────────────────────────────────────────────────────────
export const generalClinicTemplate: FlowTemplate = {
  name: 'General Clinic',
  nameAr: 'عيادة عامة',
  description: 'Full-featured general clinic flow: greeting → intent detection → book appointment / FAQ / transfer',
  descriptionAr: 'تدفق عيادة عامة شامل: ترحيب → تحديد الطلب → حجز موعد / أسئلة شائعة / تحويل',
  templateCategory: 'general',
  nodes: [
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'Welcome',
        labelAr: 'ترحيب',
        message: 'Welcome to our clinic! How can I help you today?',
        messageAr: 'أهلاً وسهلاً بك في عيادتنا! كيف يمكنني مساعدتك اليوم؟',
      },
    },
    {
      id: 'msg-intent',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 180 },
      data: {
        label: 'Select Service',
        labelAr: 'اختيار الخدمة',
        message: 'Please choose one of the following services:',
        messageAr: 'يرجى اختيار إحدى الخدمات التالية:',
        buttons: [
          { label: 'Book Appointment', labelAr: 'حجز موعد', value: 'book_appointment' },
          { label: 'General Inquiry', labelAr: 'استفسار عام', value: 'faq' },
          { label: 'Speak to Agent', labelAr: 'التحدث مع موظف', value: 'transfer' },
        ],
      },
    },
    {
      id: 'cond-intent',
      type: NodeType.CONDITION,
      position: { x: 400, y: 340 },
      data: {
        label: 'Route by Intent',
        labelAr: 'توجيه حسب الطلب',
        condition: {
          type: 'intent',
          value: 'book_appointment,faq,transfer',
        },
        branches: [
          { label: 'Book Appointment', value: 'book_appointment' },
          { label: 'FAQ', value: 'faq' },
          { label: 'Transfer', value: 'transfer' },
        ],
      },
    },
    // ── Book Appointment Branch ──
    {
      id: 'q-dept',
      type: NodeType.QUESTION,
      position: { x: 100, y: 500 },
      data: {
        label: 'Ask Department',
        labelAr: 'اسأل عن القسم',
        question: 'Which department would you like to visit? (General Medicine, Dental, Dermatology, Pediatrics)',
        questionAr: 'أي قسم ترغب بزيارته؟ (طب عام، أسنان، جلدية، أطفال)',
        variableName: 'department',
      },
    },
    {
      id: 'q-date',
      type: NodeType.QUESTION,
      position: { x: 100, y: 650 },
      data: {
        label: 'Ask Preferred Date',
        labelAr: 'اسأل عن التاريخ',
        question: 'When would you like your appointment? (e.g., tomorrow, next Sunday)',
        questionAr: 'متى تفضل الموعد؟ (مثال: غداً، الأحد القادم)',
        variableName: 'preferredDate',
      },
    },
    {
      id: 'api-check',
      type: NodeType.API_CALL,
      position: { x: 100, y: 800 },
      data: {
        label: 'Check Availability',
        labelAr: 'فحص التوفر',
        apiAction: 'check_availability',
        apiParams: { departmentId: '{{department}}' },
        variableKey: 'availability',
      },
    },
    {
      id: 'msg-avail',
      type: NodeType.MESSAGE,
      position: { x: 100, y: 950 },
      data: {
        label: 'Show Availability',
        labelAr: 'عرض المواعيد المتاحة',
        message: 'We have available appointments for you. Shall I proceed with booking?',
        messageAr: 'لدينا مواعيد متاحة لك. هل أتابع عملية الحجز؟',
        buttons: [
          { label: 'Yes, book', labelAr: 'نعم، احجز', value: 'confirm' },
          { label: 'No, cancel', labelAr: 'لا، إلغاء', value: 'cancel' },
        ],
      },
    },
    {
      id: 'end-booked',
      type: NodeType.END,
      position: { x: 100, y: 1100 },
      data: {
        label: 'Booking Confirmed',
        labelAr: 'تم تأكيد الحجز',
        endMessage: 'Your appointment has been booked successfully! You will receive a confirmation SMS shortly. Thank you for choosing our clinic. 🏥',
        endMessageAr: 'تم حجز موعدك بنجاح! ستصلك رسالة تأكيد قريباً. شكراً لاختيارك عيادتنا. 🏥',
      },
    },
    // ── FAQ Branch ──
    {
      id: 'q-faq',
      type: NodeType.QUESTION,
      position: { x: 600, y: 500 },
      data: {
        label: 'Ask Question',
        labelAr: 'اطرح سؤالك',
        question: 'What would you like to know? You can ask about operating hours, insurance, services, or anything else.',
        questionAr: 'ما الذي تود معرفته؟ يمكنك السؤال عن ساعات العمل، التأمين، الخدمات، أو أي شيء آخر.',
        variableName: 'faqQuery',
      },
    },
    {
      id: 'ai-faq',
      type: NodeType.AI_RESPONSE,
      position: { x: 600, y: 650 },
      data: {
        label: 'AI Answer',
        labelAr: 'إجابة ذكية',
        aiPrompt: 'Answer the patient\'s question about our clinic. Be helpful, concise, and professional. The patient asked: {{faqQuery}}',
      },
    },
    {
      id: 'end-faq',
      type: NodeType.END,
      position: { x: 600, y: 800 },
      data: {
        label: 'End - FAQ',
        labelAr: 'نهاية - استفسار',
        endMessage: 'I hope that answered your question! Feel free to contact us anytime. 👋',
        endMessageAr: 'أتمنى أن تكون الإجابة كافية! لا تتردد في التواصل معنا في أي وقت. 👋',
      },
    },
    // ── Transfer Branch ──
    {
      id: 'transfer-1',
      type: NodeType.TRANSFER,
      position: { x: 850, y: 500 },
      data: {
        label: 'Transfer to Agent',
        labelAr: 'تحويل لموظف',
        department: 'الاستقبال',
        transferReason: 'Patient requested to speak with a human agent',
      },
    },
  ],
  edges: [
    { id: 'e-start-intent', source: 'start-1', target: 'msg-intent' },
    { id: 'e-intent-cond', source: 'msg-intent', target: 'cond-intent' },
    // Book Appointment
    { id: 'e-cond-book', source: 'cond-intent', target: 'q-dept', sourceHandle: 'book_appointment', label: 'حجز موعد' },
    { id: 'e-dept-date', source: 'q-dept', target: 'q-date' },
    { id: 'e-date-check', source: 'q-date', target: 'api-check' },
    { id: 'e-check-avail', source: 'api-check', target: 'msg-avail' },
    { id: 'e-avail-booked', source: 'msg-avail', target: 'end-booked' },
    // FAQ
    { id: 'e-cond-faq', source: 'cond-intent', target: 'q-faq', sourceHandle: 'faq', label: 'استفسار' },
    { id: 'e-faq-ai', source: 'q-faq', target: 'ai-faq' },
    { id: 'e-ai-endfaq', source: 'ai-faq', target: 'end-faq' },
    // Transfer
    { id: 'e-cond-transfer', source: 'cond-intent', target: 'transfer-1', sourceHandle: 'transfer', label: 'تحويل' },
    // Default fallback to FAQ
    { id: 'e-cond-default', source: 'cond-intent', target: 'q-faq', sourceHandle: 'default', label: 'افتراضي' },
  ],
  variables: {
    department: '',
    preferredDate: '',
    faqQuery: '',
  },
  settings: {
    language: 'ar',
    fallbackMessage: 'عذراً، لم أفهم طلبك. هل يمكنك إعادة صياغته؟',
    fallbackMessageEn: 'Sorry, I didn\'t understand. Could you rephrase?',
    maxInactivityMinutes: 30,
  },
}

// ─────────────────────────────────────────────────────────
// 2. Dental Clinic — عيادة أسنان
// ─────────────────────────────────────────────────────────
export const dentalClinicTemplate: FlowTemplate = {
  name: 'Dental Clinic',
  nameAr: 'عيادة أسنان',
  description: 'Dental clinic flow: greeting → service selection (cleaning, filling, whitening, etc.) → booking',
  descriptionAr: 'تدفق عيادة أسنان: ترحيب → اختيار الخدمة (تنظيف، حشو، تبييض، إلخ) → حجز',
  templateCategory: 'dental',
  nodes: [
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'Welcome',
        labelAr: 'ترحيب',
        message: 'Welcome to our Dental Clinic! 🦷',
        messageAr: 'أهلاً بك في عيادة الأسنان! 🦷',
      },
    },
    {
      id: 'msg-services',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 180 },
      data: {
        label: 'Dental Services',
        labelAr: 'خدمات الأسنان',
        message: 'What dental service are you looking for?',
        messageAr: 'ما خدمة الأسنان التي تبحث عنها؟',
        buttons: [
          { label: 'Cleaning', labelAr: 'تنظيف أسنان', value: 'cleaning' },
          { label: 'Filling', labelAr: 'حشو أسنان', value: 'filling' },
          { label: 'Whitening', labelAr: 'تبييض أسنان', value: 'whitening' },
          { label: 'Extraction', labelAr: 'خلع ضرس', value: 'extraction' },
          { label: 'Braces Consultation', labelAr: 'استشارة تقويم', value: 'braces' },
          { label: 'Other', labelAr: 'أخرى', value: 'other' },
        ],
      },
    },
    {
      id: 'set-service',
      type: NodeType.SET_VARIABLE,
      position: { x: 400, y: 340 },
      data: {
        label: 'Save Service',
        labelAr: 'حفظ الخدمة',
        variableKey: 'selectedService',
        variableValue: '{{_lastInput}}',
      },
    },
    {
      id: 'q-pain',
      type: NodeType.QUESTION,
      position: { x: 400, y: 470 },
      data: {
        label: 'Pain Level',
        labelAr: 'مستوى الألم',
        question: 'Are you currently experiencing any pain or discomfort? (Yes/No)',
        questionAr: 'هل تعاني حالياً من أي ألم أو انزعاج؟ (نعم/لا)',
        variableName: 'hasPain',
      },
    },
    {
      id: 'cond-pain',
      type: NodeType.CONDITION,
      position: { x: 400, y: 620 },
      data: {
        label: 'Check Pain',
        labelAr: 'فحص الألم',
        condition: {
          type: 'keyword',
          value: 'نعم,yes,أيوا,ايوا,اه,آه',
        },
        branches: [
          { label: 'Has Pain', value: 'urgent' },
          { label: 'No Pain', value: 'normal' },
        ],
      },
    },
    // Urgent path
    {
      id: 'msg-urgent',
      type: NodeType.MESSAGE,
      position: { x: 150, y: 780 },
      data: {
        label: 'Urgent Notice',
        labelAr: 'إشعار عاجل',
        message: '⚠️ We understand you\'re in pain. We will prioritize your appointment. Let me find you the earliest available slot.',
        messageAr: '⚠️ نتفهم أنك تعاني من ألم. سنعطي أولوية لموعدك. دعني أبحث لك عن أقرب موعد متاح.',
      },
    },
    // Normal path
    {
      id: 'q-preferred-time',
      type: NodeType.QUESTION,
      position: { x: 600, y: 780 },
      data: {
        label: 'Preferred Time',
        labelAr: 'الوقت المفضل',
        question: 'When would you prefer your appointment? (Morning / Afternoon / Evening)',
        questionAr: 'متى تفضل موعدك؟ (صباحاً / ظهراً / مساءً)',
        variableName: 'preferredTime',
      },
    },
    // Shared booking
    {
      id: 'q-name',
      type: NodeType.QUESTION,
      position: { x: 400, y: 940 },
      data: {
        label: 'Patient Name',
        labelAr: 'اسم المريض',
        question: 'Please provide your full name:',
        questionAr: 'يرجى ذكر اسمك الكامل:',
        variableName: 'patientName',
      },
    },
    {
      id: 'q-phone',
      type: NodeType.QUESTION,
      position: { x: 400, y: 1080 },
      data: {
        label: 'Phone Number',
        labelAr: 'رقم الجوال',
        question: 'And your phone number:',
        questionAr: 'ورقم جوالك:',
        variableName: 'phone',
      },
    },
    {
      id: 'msg-summary',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 1220 },
      data: {
        label: 'Booking Summary',
        labelAr: 'ملخص الحجز',
        message: '📋 Booking Summary:\n• Service: {{selectedService}}\n• Name: {{patientName}}\n• Phone: {{phone}}\n\nShall I confirm this appointment?',
        messageAr: '📋 ملخص الحجز:\n• الخدمة: {{selectedService}}\n• الاسم: {{patientName}}\n• الجوال: {{phone}}\n\nهل أؤكد هذا الموعد؟',
        buttons: [
          { label: 'Confirm', labelAr: 'تأكيد', value: 'confirm' },
          { label: 'Cancel', labelAr: 'إلغاء', value: 'cancel' },
        ],
      },
    },
    {
      id: 'end-confirmed',
      type: NodeType.END,
      position: { x: 400, y: 1380 },
      data: {
        label: 'Booking Confirmed',
        labelAr: 'تم تأكيد الحجز',
        endMessage: '✅ Your dental appointment has been confirmed! You will receive an SMS with the details. Please arrive 10 minutes early. See you soon! 🦷',
        endMessageAr: '✅ تم تأكيد موعد الأسنان! ستصلك رسالة بالتفاصيل. يرجى الحضور قبل الموعد بـ10 دقائق. نراك قريباً! 🦷',
      },
    },
  ],
  edges: [
    { id: 'e-start-services', source: 'start-1', target: 'msg-services' },
    { id: 'e-services-set', source: 'msg-services', target: 'set-service' },
    { id: 'e-set-pain', source: 'set-service', target: 'q-pain' },
    { id: 'e-pain-cond', source: 'q-pain', target: 'cond-pain' },
    // Urgent
    { id: 'e-cond-urgent', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'نعم', label: 'ألم' },
    { id: 'e-cond-urgent2', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'yes', label: 'pain' },
    { id: 'e-cond-urgent3', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'أيوا', label: 'ألم' },
    { id: 'e-cond-urgent4', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'ايوا' },
    { id: 'e-cond-urgent5', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'اه' },
    { id: 'e-cond-urgent6', source: 'cond-pain', target: 'msg-urgent', sourceHandle: 'آه' },
    { id: 'e-urgent-name', source: 'msg-urgent', target: 'q-name' },
    // Normal
    { id: 'e-cond-normal', source: 'cond-pain', target: 'q-preferred-time', sourceHandle: 'default', label: 'عادي' },
    { id: 'e-time-name', source: 'q-preferred-time', target: 'q-name' },
    // Shared
    { id: 'e-name-phone', source: 'q-name', target: 'q-phone' },
    { id: 'e-phone-summary', source: 'q-phone', target: 'msg-summary' },
    { id: 'e-summary-end', source: 'msg-summary', target: 'end-confirmed' },
  ],
  variables: {
    selectedService: '',
    hasPain: '',
    preferredTime: '',
    patientName: '',
    phone: '',
  },
  settings: {
    language: 'ar',
    fallbackMessage: 'عذراً، لم أفهم. يرجى اختيار أحد الخيارات المتاحة.',
    maxInactivityMinutes: 15,
  },
}

// ─────────────────────────────────────────────────────────
// 3. Dermatology Clinic — عيادة جلدية
// ─────────────────────────────────────────────────────────
export const dermatologyClinicTemplate: FlowTemplate = {
  name: 'Dermatology Clinic',
  nameAr: 'عيادة جلدية',
  description: 'Dermatology clinic flow: greeting → concern type → urgency check → book / transfer',
  descriptionAr: 'تدفق عيادة جلدية: ترحيب → نوع المشكلة → فحص الحالة → حجز / تحويل',
  templateCategory: 'dermatology',
  nodes: [
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'Welcome',
        labelAr: 'ترحيب',
        message: 'Welcome to the Dermatology Clinic! 🩺',
        messageAr: 'أهلاً بك في عيادة الجلدية! 🩺',
      },
    },
    {
      id: 'msg-concern',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 180 },
      data: {
        label: 'Select Concern',
        labelAr: 'اختر المشكلة',
        message: 'What brings you to us today?',
        messageAr: 'ما سبب زيارتك اليوم؟',
        buttons: [
          { label: 'Acne / Pimples', labelAr: 'حب شباب / بثور', value: 'acne' },
          { label: 'Eczema / Rash', labelAr: 'أكزيما / طفح جلدي', value: 'eczema' },
          { label: 'Skin Allergy', labelAr: 'حساسية جلدية', value: 'allergy' },
          { label: 'Hair Loss', labelAr: 'تساقط الشعر', value: 'hair_loss' },
          { label: 'Mole / Skin Check', labelAr: 'فحص شامات / جلد', value: 'skin_check' },
          { label: 'Cosmetic Procedure', labelAr: 'إجراء تجميلي', value: 'cosmetic' },
        ],
      },
    },
    {
      id: 'set-concern',
      type: NodeType.SET_VARIABLE,
      position: { x: 400, y: 340 },
      data: {
        label: 'Save Concern',
        labelAr: 'حفظ المشكلة',
        variableKey: 'concern',
        variableValue: '{{_lastInput}}',
      },
    },
    {
      id: 'q-duration',
      type: NodeType.QUESTION,
      position: { x: 400, y: 470 },
      data: {
        label: 'Symptom Duration',
        labelAr: 'مدة الأعراض',
        question: 'How long have you been experiencing this issue?',
        questionAr: 'منذ متى وأنت تعاني من هذه المشكلة؟',
        variableName: 'duration',
      },
    },
    {
      id: 'q-urgency',
      type: NodeType.QUESTION,
      position: { x: 400, y: 620 },
      data: {
        label: 'Urgency Check',
        labelAr: 'فحص الاستعجال',
        question: 'Is the condition getting worse or spreading? (Yes / No / Not Sure)',
        questionAr: 'هل الحالة تزداد سوءاً أو تنتشر؟ (نعم / لا / غير متأكد)',
        variableName: 'isWorsening',
      },
    },
    {
      id: 'cond-urgency',
      type: NodeType.CONDITION,
      position: { x: 400, y: 780 },
      data: {
        label: 'Route by Urgency',
        labelAr: 'توجيه حسب الاستعجال',
        condition: {
          type: 'keyword',
          value: 'نعم,yes,أيوا,اه',
        },
        branches: [
          { label: 'Urgent', value: 'urgent' },
          { label: 'Normal', value: 'normal' },
        ],
      },
    },
    // Urgent path
    {
      id: 'msg-urgent',
      type: NodeType.MESSAGE,
      position: { x: 150, y: 940 },
      data: {
        label: 'Urgent Advice',
        labelAr: 'نصيحة عاجلة',
        message: '⚠️ Since your condition is worsening, we recommend seeing a dermatologist as soon as possible. Let me connect you with our team.',
        messageAr: '⚠️ بما أن حالتك تزداد سوءاً، ننصح بزيارة طبيب جلدية بأسرع وقت. دعني أوصلك بفريقنا.',
      },
    },
    {
      id: 'transfer-urgent',
      type: NodeType.TRANSFER,
      position: { x: 150, y: 1100 },
      data: {
        label: 'Transfer - Urgent',
        labelAr: 'تحويل - عاجل',
        department: 'الجلدية',
        transferReason: 'Urgent dermatology case — condition worsening. Concern: {{concern}}, Duration: {{duration}}',
      },
    },
    // Normal path
    {
      id: 'q-name',
      type: NodeType.QUESTION,
      position: { x: 600, y: 940 },
      data: {
        label: 'Patient Name',
        labelAr: 'اسم المريض',
        question: 'Great, let\'s schedule a consultation. What is your full name?',
        questionAr: 'ممتاز، لنحجز لك استشارة. ما اسمك الكامل؟',
        variableName: 'patientName',
      },
    },
    {
      id: 'q-phone',
      type: NodeType.QUESTION,
      position: { x: 600, y: 1080 },
      data: {
        label: 'Phone',
        labelAr: 'رقم الجوال',
        question: 'And your phone number:',
        questionAr: 'ورقم جوالك:',
        variableName: 'phone',
      },
    },
    {
      id: 'end-booked',
      type: NodeType.END,
      position: { x: 600, y: 1220 },
      data: {
        label: 'Consultation Booked',
        labelAr: 'تم حجز الاستشارة',
        endMessage: '✅ Your dermatology consultation has been booked! Our team will call you to confirm the exact time. In the meantime, avoid sun exposure and irritants. Take care! 🌿',
        endMessageAr: '✅ تم حجز استشارتك الجلدية! سيتصل بك فريقنا لتأكيد الوقت المحدد. في هذه الأثناء، تجنب التعرض للشمس والمهيجات. اعتنِ بنفسك! 🌿',
      },
    },
  ],
  edges: [
    { id: 'e-start-concern', source: 'start-1', target: 'msg-concern' },
    { id: 'e-concern-set', source: 'msg-concern', target: 'set-concern' },
    { id: 'e-set-duration', source: 'set-concern', target: 'q-duration' },
    { id: 'e-duration-urgency', source: 'q-duration', target: 'q-urgency' },
    { id: 'e-urgency-cond', source: 'q-urgency', target: 'cond-urgency' },
    // Urgent
    { id: 'e-cond-urgent', source: 'cond-urgency', target: 'msg-urgent', sourceHandle: 'نعم', label: 'عاجل' },
    { id: 'e-cond-urgent2', source: 'cond-urgency', target: 'msg-urgent', sourceHandle: 'yes' },
    { id: 'e-cond-urgent3', source: 'cond-urgency', target: 'msg-urgent', sourceHandle: 'أيوا' },
    { id: 'e-cond-urgent4', source: 'cond-urgency', target: 'msg-urgent', sourceHandle: 'اه' },
    { id: 'e-urgent-transfer', source: 'msg-urgent', target: 'transfer-urgent' },
    // Normal
    { id: 'e-cond-normal', source: 'cond-urgency', target: 'q-name', sourceHandle: 'default', label: 'عادي' },
    { id: 'e-name-phone', source: 'q-name', target: 'q-phone' },
    { id: 'e-phone-end', source: 'q-phone', target: 'end-booked' },
  ],
  variables: {
    concern: '',
    duration: '',
    isWorsening: '',
    patientName: '',
    phone: '',
  },
  settings: {
    language: 'ar',
    fallbackMessage: 'عذراً، لم أفهم. يرجى اختيار أحد الخيارات المتاحة.',
    maxInactivityMinutes: 20,
  },
}

// ─────────────────────────────────────────────────────────
// Export all templates
// ─────────────────────────────────────────────────────────
// 5. Default Template — قالب افتراضي
// Minimal starting flow any clinic can customize
// ─────────────────────────────────────────────────────────
export const defaultTemplate: FlowTemplate = {
  name: 'Default Receptionist',
  nameAr: 'استقبال افتراضي',
  description: 'Simple receptionist flow: greeting → main menu → book appointment / operating hours / FAQ / transfer to agent',
  descriptionAr: 'تدفق استقبال بسيط: ترحيب → القائمة الرئيسية → حجز موعد / ساعات العمل / أسئلة شائعة / تحويل لموظف',
  templateCategory: 'default',
  nodes: [
    // ── Start ──
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'Welcome',
        labelAr: 'ترحيب',
        message: 'Welcome! I am your virtual assistant. How can I help you today?',
        messageAr: 'أهلاً وسهلاً! أنا مساعدك الافتراضي. كيف يمكنني مساعدتك اليوم؟',
      },
    },
    // ── Main Menu ──
    {
      id: 'msg-menu',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 200 },
      data: {
        label: 'Main Menu',
        labelAr: 'القائمة الرئيسية',
        message: 'Please select from the options below:',
        messageAr: 'يرجى الاختيار من الخيارات أدناه:',
        buttons: [
          { label: 'Book Appointment', labelAr: 'حجز موعد', value: 'book' },
          { label: 'Operating Hours', labelAr: 'ساعات العمل', value: 'hours' },
          { label: 'General Question', labelAr: 'سؤال عام', value: 'faq' },
          { label: 'Talk to Staff', labelAr: 'التحدث مع موظف', value: 'transfer' },
        ],
      },
    },
    // ── Router ──
    {
      id: 'cond-menu',
      type: NodeType.CONDITION,
      position: { x: 400, y: 370 },
      data: {
        label: 'Route Selection',
        labelAr: 'توجيه الاختيار',
        condition: {
          type: 'intent',
          value: 'book,hours,faq,transfer',
        },
        branches: [
          { label: 'Book', value: 'book' },
          { label: 'Hours', value: 'hours' },
          { label: 'FAQ', value: 'faq' },
          { label: 'Transfer', value: 'transfer' },
        ],
      },
    },

    // ── Book Appointment Branch ──
    {
      id: 'q-name',
      type: NodeType.QUESTION,
      position: { x: 50, y: 540 },
      data: {
        label: 'Ask Name',
        labelAr: 'اسأل الاسم',
        question: 'Please provide your full name:',
        questionAr: 'يرجى ذكر اسمك الكامل:',
        variableName: 'patientName',
      },
    },
    {
      id: 'q-phone',
      type: NodeType.QUESTION,
      position: { x: 50, y: 690 },
      data: {
        label: 'Ask Phone',
        labelAr: 'اسأل رقم الجوال',
        question: 'What is your phone number?',
        questionAr: 'ما هو رقم جوالك؟',
        variableName: 'phoneNumber',
      },
    },
    {
      id: 'q-date',
      type: NodeType.QUESTION,
      position: { x: 50, y: 840 },
      data: {
        label: 'Ask Date',
        labelAr: 'اسأل التاريخ',
        question: 'When would you like your appointment? (e.g., tomorrow, next Sunday)',
        questionAr: 'متى تفضل الموعد؟ (مثال: غداً، الأحد القادم)',
        variableName: 'preferredDate',
      },
    },
    {
      id: 'msg-confirm',
      type: NodeType.MESSAGE,
      position: { x: 50, y: 990 },
      data: {
        label: 'Confirm Details',
        labelAr: 'تأكيد البيانات',
        message: 'Thank you {{patientName}}! We will contact you at {{phoneNumber}} to confirm your appointment for {{preferredDate}}.',
        messageAr: 'شكراً {{patientName}}! سنتواصل معك على {{phoneNumber}} لتأكيد موعدك في {{preferredDate}}.',
      },
    },
    {
      id: 'end-booked',
      type: NodeType.END,
      position: { x: 50, y: 1130 },
      data: {
        label: 'Booking Done',
        labelAr: 'تم الحجز',
        endMessage: 'Your request has been submitted. We look forward to seeing you!',
        endMessageAr: 'تم تسجيل طلبك. نتطلع لرؤيتك!',
      },
    },

    // ── Operating Hours Branch ──
    {
      id: 'api-hours',
      type: NodeType.API_CALL,
      position: { x: 300, y: 540 },
      data: {
        label: 'Get Hours',
        labelAr: 'جلب ساعات العمل',
        apiAction: 'get_operating_hours',
        apiParams: {},
        variableKey: 'operatingHours',
      },
    },
    {
      id: 'msg-hours',
      type: NodeType.MESSAGE,
      position: { x: 300, y: 690 },
      data: {
        label: 'Show Hours',
        labelAr: 'عرض الساعات',
        message: 'Our operating hours:\n{{operatingHours}}\n\nIs there anything else I can help with?',
        messageAr: 'ساعات العمل:\n{{operatingHours}}\n\nهل هناك شيء آخر أستطيع مساعدتك به؟',
        buttons: [
          { label: 'Back to Menu', labelAr: 'العودة للقائمة', value: 'menu' },
          { label: 'No, thank you', labelAr: 'لا، شكراً', value: 'done' },
        ],
      },
    },
    {
      id: 'cond-hours-next',
      type: NodeType.CONDITION,
      position: { x: 300, y: 850 },
      data: {
        label: 'After Hours',
        labelAr: 'بعد الساعات',
        condition: { type: 'keyword', value: 'menu' },
        branches: [
          { label: 'Menu', value: 'menu' },
          { label: 'Done', value: 'done' },
        ],
      },
    },
    {
      id: 'end-hours',
      type: NodeType.END,
      position: { x: 300, y: 1000 },
      data: {
        label: 'End After Hours',
        labelAr: 'إنهاء بعد الساعات',
        endMessage: 'Thank you for contacting us. Have a great day!',
        endMessageAr: 'شكراً لتواصلك معنا. أتمنى لك يوماً سعيداً!',
      },
    },

    // ── FAQ Branch ──
    {
      id: 'q-faq',
      type: NodeType.QUESTION,
      position: { x: 550, y: 540 },
      data: {
        label: 'Ask Question',
        labelAr: 'اسأل سؤالك',
        question: 'What would you like to know? Type your question:',
        questionAr: 'ما الذي تود معرفته؟ اكتب سؤالك:',
        variableName: 'faqQuery',
      },
    },
    {
      id: 'ai-faq',
      type: NodeType.AI_RESPONSE,
      position: { x: 550, y: 690 },
      data: {
        label: 'AI Answer',
        labelAr: 'إجابة ذكية',
        aiPrompt: 'Answer the patient question based on the clinic FAQ and general medical reception knowledge. Be concise and helpful. Do not provide medical diagnoses or treatment advice. Question: {{faqQuery}}',
      },
    },
    {
      id: 'end-faq',
      type: NodeType.END,
      position: { x: 550, y: 840 },
      data: {
        label: 'End FAQ',
        labelAr: 'إنهاء الأسئلة',
        endMessage: 'I hope that helped! Feel free to reach out anytime.',
        endMessageAr: 'أتمنى أن تكون الإجابة مفيدة! لا تتردد في التواصل في أي وقت.',
      },
    },

    // ── Transfer Branch ──
    {
      id: 'transfer-1',
      type: NodeType.TRANSFER,
      position: { x: 780, y: 540 },
      data: {
        label: 'Transfer to Staff',
        labelAr: 'تحويل لموظف',
        department: 'reception',
        transferReason: 'Patient requested to speak with a staff member',
      },
    },
  ],
  edges: [
    // Start → Menu
    { id: 'e-start', source: 'start-1', target: 'msg-menu' },
    // Menu → Router
    { id: 'e-menu', source: 'msg-menu', target: 'cond-menu' },

    // Router → Branches
    { id: 'e-book', source: 'cond-menu', target: 'q-name', sourceHandle: 'book', label: 'Book' },
    { id: 'e-hours', source: 'cond-menu', target: 'api-hours', sourceHandle: 'hours', label: 'Hours' },
    { id: 'e-faq', source: 'cond-menu', target: 'q-faq', sourceHandle: 'faq', label: 'FAQ' },
    { id: 'e-transfer', source: 'cond-menu', target: 'transfer-1', sourceHandle: 'transfer', label: 'Transfer' },

    // Book branch
    { id: 'e-name-phone', source: 'q-name', target: 'q-phone' },
    { id: 'e-phone-date', source: 'q-phone', target: 'q-date' },
    { id: 'e-date-confirm', source: 'q-date', target: 'msg-confirm' },
    { id: 'e-confirm-end', source: 'msg-confirm', target: 'end-booked' },

    // Hours branch
    { id: 'e-api-hours', source: 'api-hours', target: 'msg-hours' },
    { id: 'e-hours-cond', source: 'msg-hours', target: 'cond-hours-next' },
    { id: 'e-hours-menu', source: 'cond-hours-next', target: 'msg-menu', sourceHandle: 'menu', label: 'Menu' },
    { id: 'e-hours-done', source: 'cond-hours-next', target: 'end-hours', sourceHandle: 'done', label: 'Done' },

    // FAQ branch
    { id: 'e-faq-ai', source: 'q-faq', target: 'ai-faq' },
    { id: 'e-ai-end', source: 'ai-faq', target: 'end-faq' },
  ],
  variables: {
    patientName: '',
    phoneNumber: '',
    preferredDate: '',
    operatingHours: '',
    faqQuery: '',
  },
  settings: {
    language: 'ar',
    maxInactivityMinutes: 30,
  },
}

// ─────────────────────────────────────────────────────────
// 6. AI Customization — تخصيص الذكاء الاصطناعي
// This template uses INSTRUCTION nodes to customize LLM behavior.
// It does NOT replace the LLM — it gives it rules to follow.
// ─────────────────────────────────────────────────────────
export const aiCustomizationTemplate: FlowTemplate = {
  name: 'AI Behavior Customization',
  nameAr: 'تخصيص سلوك الذكاء الاصطناعي',
  description: 'Customize how the AI responds to patients: greeting, tone, business rules, escalation triggers, booking flow, FAQ overrides',
  descriptionAr: 'خصّص طريقة تعامل الذكاء الاصطناعي مع المرضى: الترحيب، الأسلوب، قواعد العمل، حالات التحويل، تدفق الحجز، الأسئلة الشائعة',
  templateCategory: 'ai_customization',
  nodes: [
    // ── Central hub node ──
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'AI Customization',
        labelAr: 'تخصيص الذكاء الاصطناعي',
        message: 'This flow customizes how the AI responds to patients. Edit the instruction nodes below.',
        messageAr: 'هذا التدفق يخصص طريقة استجابة الذكاء الاصطناعي للمرضى. عدّل عقد التعليمات أدناه.',
      },
    },

    // ── Greeting instruction ──
    // Guidance, not a verbatim phrase: the LLM weaves the clinic name into a
    // single natural reply rather than emitting a canned greeting before answering.
    {
      id: 'inst-greeting',
      type: NodeType.INSTRUCTION,
      position: { x: 100, y: 220 },
      data: {
        label: 'Greeting',
        labelAr: 'الترحيب',
        instructionCategory: 'greeting',
        instructionText: 'On the first reply of a new conversation, greet the patient warmly and mention the clinic name (available in the system context). Keep the greeting to one short, natural sentence inside the same reply — do not send it as a separate message before answering the patient.',
        instructionTextAr: 'في أول رد بالمحادثة، رحّب بالمريض بشكل ودود واذكر اسم العيادة (متاح في سياق النظام). اجعل الترحيب جملة واحدة قصيرة ضمن نفس الردّ، لا تفصله في رسالة منفصلة قبل الإجابة على سؤال المريض.',
        instructionPriority: 8,
      },
    },

    // ── Tone instruction ──
    {
      id: 'inst-tone',
      type: NodeType.INSTRUCTION,
      position: { x: 400, y: 220 },
      data: {
        label: 'Tone & Style',
        labelAr: 'الأسلوب والنبرة',
        instructionCategory: 'tone',
        instructionText: 'Be professional yet warm and friendly. Use Gulf Arabic dialect by default. Keep responses concise for WhatsApp. Use appropriate emojis sparingly.',
        instructionTextAr: 'كن محترفاً ودوداً في نفس الوقت. استخدم اللهجة الخليجية بشكل افتراضي. اجعل الردود مختصرة ومناسبة للواتساب. استخدم الإيموجي باعتدال.',
        instructionPriority: 7,
      },
    },

    // ── Business Rules ──
    // No hardcoded clinic-specific rules. Real schedule + departments + facilities
    // are already injected into the system prompt from live data (see
    // systemPrompt.ts → getClinicSchedule). Add custom rules via the UI.

    // ── Escalation triggers ──
    {
      id: 'inst-escalation-1',
      type: NodeType.INSTRUCTION,
      position: { x: 100, y: 380 },
      data: {
        label: 'Escalation: Emergency',
        labelAr: 'تحويل: حالة طوارئ',
        instructionCategory: 'escalation',
        instructionText: 'If patient mentions chest pain, difficulty breathing, severe bleeding, or loss of consciousness — immediately direct them to call 997 (Saudi emergency) and offer to transfer to a human agent.',
        instructionTextAr: 'إذا ذكر المريض ألم في الصدر، صعوبة في التنفس، نزيف شديد، أو فقدان الوعي — وجّهه فوراً للاتصال بـ 997 (طوارئ السعودية) واعرض تحويله لموظف.',
        instructionPriority: 10,
      },
    },
    {
      id: 'inst-escalation-2',
      type: NodeType.INSTRUCTION,
      position: { x: 100, y: 540 },
      data: {
        label: 'Escalation: Complaint',
        labelAr: 'تحويل: شكوى',
        instructionCategory: 'escalation',
        instructionText: 'If patient expresses a complaint or dissatisfaction about service, apologize and transfer to a human agent immediately.',
        instructionTextAr: 'إذا عبّر المريض عن شكوى أو عدم رضا عن الخدمة، اعتذر وحوّل المحادثة فوراً لموظف.',
        instructionPriority: 9,
      },
    },

    // ── Booking flow instructions ──
    {
      id: 'inst-booking',
      type: NodeType.INSTRUCTION,
      position: { x: 400, y: 380 },
      data: {
        label: 'Booking Flow',
        labelAr: 'تدفق الحجز',
        instructionCategory: 'booking_flow',
        instructionText: 'When booking: 1) Ask which service/department, 2) Ask for preferred doctor (optional), 3) Ask for preferred date and time, 4) Confirm the appointment details before booking. Always show available options.',
        instructionTextAr: 'عند الحجز: 1) اسأل عن الخدمة/القسم، 2) اسأل عن الطبيب المفضل (اختياري)، 3) اسأل عن التاريخ والوقت المفضل، 4) أكّد تفاصيل الموعد قبل الحجز. دائماً اعرض الخيارات المتاحة.',
        instructionPriority: 7,
      },
    },

    // ── FAQ override ──
    {
      id: 'inst-faq-1',
      type: NodeType.INSTRUCTION,
      position: { x: 400, y: 540 },
      data: {
        label: 'FAQ: Parking',
        labelAr: 'سؤال شائع: المواقف',
        instructionCategory: 'faq_override',
        instructionText: 'Q: Where is the parking? A: Free parking is available in the basement. Enter from the main gate on King Fahd Road.',
        instructionTextAr: 'س: أين المواقف؟ ج: مواقف مجانية متاحة في البدروم. الدخول من البوابة الرئيسية على طريق الملك فهد.',
        instructionPriority: 5,
      },
    },

    // ── Custom instruction ──
    {
      id: 'inst-custom-1',
      type: NodeType.INSTRUCTION,
      position: { x: 700, y: 540 },
      data: {
        label: 'Custom: Promotion',
        labelAr: 'مخصص: عرض ترويجي',
        instructionCategory: 'custom',
        instructionText: 'We currently have a 20% discount on dental cleaning until the end of the month. Mention this to patients asking about dental services.',
        instructionTextAr: 'لدينا حالياً خصم 20% على تنظيف الأسنان حتى نهاية الشهر. اذكر هذا للمرضى الذين يسألون عن خدمات الأسنان.',
        instructionPriority: 4,
      },
    },
  ],
  edges: [
    // Connect start to all instruction nodes (visual only — shows they all stem from the main config)
    { id: 'e-s-greeting', source: 'start-1', target: 'inst-greeting', label: 'ترحيب' },
    { id: 'e-s-tone', source: 'start-1', target: 'inst-tone', label: 'أسلوب' },
    { id: 'e-s-rule1', source: 'start-1', target: 'inst-rule-1', label: 'قواعد' },
    { id: 'e-s-escalation1', source: 'start-1', target: 'inst-escalation-1', label: 'تحويل' },
    { id: 'e-s-booking', source: 'start-1', target: 'inst-booking', label: 'حجز' },
    // Additional edges for visual grouping
    { id: 'e-rule1-rule2', source: 'inst-rule-1', target: 'inst-rule-2' },
    { id: 'e-esc1-esc2', source: 'inst-escalation-1', target: 'inst-escalation-2' },
    { id: 'e-booking-faq', source: 'inst-booking', target: 'inst-faq-1' },
    { id: 'e-tone-custom', source: 'inst-tone', target: 'inst-custom-1' },
  ],
  variables: {},
  settings: {
    language: 'ar',
    flowType: 'ai_customization',
  },
}

export const ALL_TEMPLATES: FlowTemplate[] = [
  aiCustomizationTemplate,
  defaultTemplate,
  generalClinicTemplate,
  dentalClinicTemplate,
  dermatologyClinicTemplate,
]
