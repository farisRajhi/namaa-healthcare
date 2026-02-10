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
  description: 'Full-featured general clinic flow: greeting → intent detection → book appointment / FAQ / prescription refill / transfer',
  descriptionAr: 'تدفق عيادة عامة شامل: ترحيب → تحديد الطلب → حجز موعد / أسئلة شائعة / إعادة تعبئة وصفة / تحويل',
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
          { label: 'Prescription Refill', labelAr: 'إعادة تعبئة وصفة', value: 'prescription' },
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
          value: 'book_appointment,prescription,faq,transfer',
        },
        branches: [
          { label: 'Book Appointment', value: 'book_appointment' },
          { label: 'Prescription', value: 'prescription' },
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
    // ── Prescription Branch ──
    {
      id: 'q-rx-name',
      type: NodeType.QUESTION,
      position: { x: 350, y: 500 },
      data: {
        label: 'Ask Patient Name',
        labelAr: 'اسأل عن اسم المريض',
        question: 'Please provide your full name or medical record number (MRN):',
        questionAr: 'يرجى ذكر اسمك الكامل أو رقم الملف الطبي:',
        variableName: 'patientName',
      },
    },
    {
      id: 'q-rx-med',
      type: NodeType.QUESTION,
      position: { x: 350, y: 650 },
      data: {
        label: 'Ask Medication',
        labelAr: 'اسأل عن الدواء',
        question: 'Which medication do you need to refill?',
        questionAr: 'أي دواء ترغب بإعادة تعبئته؟',
        variableName: 'medication',
      },
    },
    {
      id: 'msg-rx-confirm',
      type: NodeType.MESSAGE,
      position: { x: 350, y: 800 },
      data: {
        label: 'Refill Submitted',
        labelAr: 'تم تقديم الطلب',
        message: 'Your prescription refill request for {{medication}} has been submitted. Our pharmacy team will contact you within 24 hours.',
        messageAr: 'تم تقديم طلب إعادة تعبئة {{medication}}. سيتواصل معك فريق الصيدلية خلال 24 ساعة.',
      },
    },
    {
      id: 'end-rx',
      type: NodeType.END,
      position: { x: 350, y: 950 },
      data: {
        label: 'End - Prescription',
        labelAr: 'نهاية - وصفة',
        endMessage: 'Thank you! Is there anything else I can help you with? Have a great day! 😊',
        endMessageAr: 'شكراً لك! هل تحتاج مساعدة بشيء آخر؟ أتمنى لك يوماً سعيداً! 😊',
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
    // Prescription
    { id: 'e-cond-rx', source: 'cond-intent', target: 'q-rx-name', sourceHandle: 'prescription', label: 'وصفة طبية' },
    { id: 'e-rxname-med', source: 'q-rx-name', target: 'q-rx-med' },
    { id: 'e-rxmed-confirm', source: 'q-rx-med', target: 'msg-rx-confirm' },
    { id: 'e-rxconfirm-end', source: 'msg-rx-confirm', target: 'end-rx' },
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
    patientName: '',
    medication: '',
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
// 4. Pharmacy — صيدلية
// ─────────────────────────────────────────────────────────
export const pharmacyTemplate: FlowTemplate = {
  name: 'Pharmacy',
  nameAr: 'صيدلية',
  description: 'Pharmacy flow: greeting → refill request / drug availability / operating hours',
  descriptionAr: 'تدفق صيدلية: ترحيب → طلب إعادة تعبئة / توفر أدوية / ساعات العمل',
  templateCategory: 'pharmacy',
  nodes: [
    {
      id: 'start-1',
      type: NodeType.START,
      position: { x: 400, y: 50 },
      data: {
        label: 'Welcome',
        labelAr: 'ترحيب',
        message: 'Welcome to Namaa Pharmacy! 💊',
        messageAr: 'أهلاً بك في صيدلية نماء! 💊',
      },
    },
    {
      id: 'msg-services',
      type: NodeType.MESSAGE,
      position: { x: 400, y: 180 },
      data: {
        label: 'Pharmacy Services',
        labelAr: 'خدمات الصيدلية',
        message: 'How can we help you today?',
        messageAr: 'كيف يمكننا مساعدتك اليوم؟',
        buttons: [
          { label: 'Prescription Refill', labelAr: 'إعادة تعبئة وصفة', value: 'refill' },
          { label: 'Drug Availability', labelAr: 'توفر دواء', value: 'availability' },
          { label: 'Operating Hours', labelAr: 'ساعات العمل', value: 'hours' },
          { label: 'Speak to Pharmacist', labelAr: 'التحدث مع صيدلي', value: 'pharmacist' },
        ],
      },
    },
    {
      id: 'cond-service',
      type: NodeType.CONDITION,
      position: { x: 400, y: 340 },
      data: {
        label: 'Route Service',
        labelAr: 'توجيه الخدمة',
        condition: {
          type: 'intent',
          value: 'prescription,faq,hours,transfer',
        },
        branches: [
          { label: 'Refill', value: 'refill' },
          { label: 'Availability', value: 'availability' },
          { label: 'Hours', value: 'hours' },
          { label: 'Pharmacist', value: 'pharmacist' },
        ],
      },
    },
    // ── Refill Branch ──
    {
      id: 'q-rx-id',
      type: NodeType.QUESTION,
      position: { x: 50, y: 500 },
      data: {
        label: 'Prescription Number',
        labelAr: 'رقم الوصفة',
        question: 'Please provide your prescription number or the medication name:',
        questionAr: 'يرجى ذكر رقم الوصفة أو اسم الدواء:',
        variableName: 'rxInfo',
      },
    },
    {
      id: 'q-rx-patient',
      type: NodeType.QUESTION,
      position: { x: 50, y: 650 },
      data: {
        label: 'Patient Name',
        labelAr: 'اسم المريض',
        question: 'And your full name:',
        questionAr: 'واسمك الكامل:',
        variableName: 'patientName',
      },
    },
    {
      id: 'q-rx-phone',
      type: NodeType.QUESTION,
      position: { x: 50, y: 800 },
      data: {
        label: 'Phone Number',
        labelAr: 'رقم الجوال',
        question: 'Your phone number for notification:',
        questionAr: 'رقم جوالك للإشعار:',
        variableName: 'phone',
      },
    },
    {
      id: 'msg-rx-submitted',
      type: NodeType.MESSAGE,
      position: { x: 50, y: 950 },
      data: {
        label: 'Refill Submitted',
        labelAr: 'تم تقديم الطلب',
        message: '✅ Your refill request for "{{rxInfo}}" has been submitted.\n\nName: {{patientName}}\nPhone: {{phone}}\n\nWe\'ll SMS you when it\'s ready (usually within 2-4 hours).',
        messageAr: '✅ تم تقديم طلب إعادة تعبئة "{{rxInfo}}".\n\nالاسم: {{patientName}}\nالجوال: {{phone}}\n\nسنرسل لك رسالة عندما يكون جاهزاً (عادة خلال 2-4 ساعات).',
      },
    },
    {
      id: 'end-refill',
      type: NodeType.END,
      position: { x: 50, y: 1100 },
      data: {
        label: 'End - Refill',
        labelAr: 'نهاية - إعادة تعبئة',
        endMessage: 'Thank you for using Namaa Pharmacy! Stay healthy! 💚',
        endMessageAr: 'شكراً لاستخدام صيدلية نماء! دمت بصحة! 💚',
      },
    },
    // ── Availability Branch ──
    {
      id: 'q-drug-name',
      type: NodeType.QUESTION,
      position: { x: 300, y: 500 },
      data: {
        label: 'Drug Name',
        labelAr: 'اسم الدواء',
        question: 'What medication are you looking for?',
        questionAr: 'ما الدواء الذي تبحث عنه؟',
        variableName: 'drugName',
      },
    },
    {
      id: 'ai-drug-check',
      type: NodeType.AI_RESPONSE,
      position: { x: 300, y: 650 },
      data: {
        label: 'Check Availability',
        labelAr: 'فحص التوفر',
        aiPrompt: 'The patient is asking about the availability of "{{drugName}}" at our pharmacy. Provide a helpful response. If you don\'t know the exact availability, suggest they call or visit.',
      },
    },
    {
      id: 'end-avail',
      type: NodeType.END,
      position: { x: 300, y: 800 },
      data: {
        label: 'End - Availability',
        labelAr: 'نهاية - توفر',
        endMessage: 'Hope that helps! You can also call us at 0XX-XXXXXXX for immediate assistance. 📞',
        endMessageAr: 'أتمنى أن يكون ذلك مفيداً! يمكنك أيضاً الاتصال بنا على 0XX-XXXXXXX للمساعدة الفورية. 📞',
      },
    },
    // ── Hours Branch ──
    {
      id: 'api-hours',
      type: NodeType.API_CALL,
      position: { x: 550, y: 500 },
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
      position: { x: 550, y: 650 },
      data: {
        label: 'Show Hours',
        labelAr: 'عرض ساعات العمل',
        message: '🕐 Pharmacy Hours:\n• Sunday – Thursday: 8:00 AM – 10:00 PM\n• Friday: 4:00 PM – 10:00 PM\n• Saturday: 9:00 AM – 10:00 PM',
        messageAr: '🕐 ساعات عمل الصيدلية:\n• الأحد – الخميس: 8:00 صباحاً – 10:00 مساءً\n• الجمعة: 4:00 مساءً – 10:00 مساءً\n• السبت: 9:00 صباحاً – 10:00 مساءً',
      },
    },
    {
      id: 'end-hours',
      type: NodeType.END,
      position: { x: 550, y: 800 },
      data: {
        label: 'End - Hours',
        labelAr: 'نهاية - ساعات',
        endMessage: 'Feel free to visit us anytime during working hours. Stay well! 😊',
        endMessageAr: 'لا تتردد في زيارتنا خلال ساعات العمل. دمت بخير! 😊',
      },
    },
    // ── Pharmacist Transfer ──
    {
      id: 'transfer-pharm',
      type: NodeType.TRANSFER,
      position: { x: 800, y: 500 },
      data: {
        label: 'Transfer to Pharmacist',
        labelAr: 'تحويل لصيدلي',
        department: 'الصيدلية',
        transferReason: 'Patient requested to speak with a pharmacist directly',
      },
    },
  ],
  edges: [
    { id: 'e-start-services', source: 'start-1', target: 'msg-services' },
    { id: 'e-services-cond', source: 'msg-services', target: 'cond-service' },
    // Refill
    { id: 'e-cond-refill', source: 'cond-service', target: 'q-rx-id', sourceHandle: 'prescription', label: 'إعادة تعبئة' },
    { id: 'e-cond-refill2', source: 'cond-service', target: 'q-rx-id', sourceHandle: 'refill' },
    { id: 'e-rxid-patient', source: 'q-rx-id', target: 'q-rx-patient' },
    { id: 'e-patient-phone', source: 'q-rx-patient', target: 'q-rx-phone' },
    { id: 'e-phone-submitted', source: 'q-rx-phone', target: 'msg-rx-submitted' },
    { id: 'e-submitted-end', source: 'msg-rx-submitted', target: 'end-refill' },
    // Availability
    { id: 'e-cond-avail', source: 'cond-service', target: 'q-drug-name', sourceHandle: 'faq', label: 'توفر دواء' },
    { id: 'e-cond-avail2', source: 'cond-service', target: 'q-drug-name', sourceHandle: 'availability' },
    { id: 'e-drug-check', source: 'q-drug-name', target: 'ai-drug-check' },
    { id: 'e-check-endavail', source: 'ai-drug-check', target: 'end-avail' },
    // Hours
    { id: 'e-cond-hours', source: 'cond-service', target: 'api-hours', sourceHandle: 'hours', label: 'ساعات العمل' },
    { id: 'e-hours-msg', source: 'api-hours', target: 'msg-hours' },
    { id: 'e-msg-endhours', source: 'msg-hours', target: 'end-hours' },
    // Pharmacist
    { id: 'e-cond-pharm', source: 'cond-service', target: 'transfer-pharm', sourceHandle: 'transfer', label: 'صيدلي' },
    { id: 'e-cond-pharm2', source: 'cond-service', target: 'transfer-pharm', sourceHandle: 'pharmacist' },
    // Default → Availability
    { id: 'e-cond-default', source: 'cond-service', target: 'q-drug-name', sourceHandle: 'default', label: 'افتراضي' },
  ],
  variables: {
    rxInfo: '',
    patientName: '',
    phone: '',
    drugName: '',
    operatingHours: null,
  },
  settings: {
    language: 'ar',
    fallbackMessage: 'عذراً، لم أفهم. يرجى اختيار أحد الخيارات.',
    maxInactivityMinutes: 15,
  },
}

// ─────────────────────────────────────────────────────────
// Export all templates
// ─────────────────────────────────────────────────────────
export const ALL_TEMPLATES: FlowTemplate[] = [
  generalClinicTemplate,
  dentalClinicTemplate,
  dermatologyClinicTemplate,
  pharmacyTemplate,
]
