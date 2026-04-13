/**
 * Tawafud (توافد) – سياسة الخصوصية
 * Arabic Privacy Policy – PDPL (Saudi Arabia Personal Data Protection Law) Compliant
 */

import { useTranslation } from 'react-i18next'
import { Shield, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PrivacyPolicy() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const navigate = useNavigate()

  return (
    <div
      className="min-h-screen bg-gray-50"
      dir={isAr ? 'rtl' : 'ltr'}
      lang={isAr ? 'ar' : 'en'}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="العودة"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Shield size={20} className="text-primary-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">سياسة الخصوصية</h1>
              <p className="text-xs text-gray-500">Privacy Policy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">

          {/* Title */}
          <div className="text-center mb-10 pb-8 border-b border-gray-100">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-50 rounded-2xl mb-4">
              <Shield size={32} className="text-primary-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">سياسة الخصوصية</h2>
            <p className="text-gray-500">آخر تحديث: فبراير 2026</p>
            <p className="text-gray-500 text-sm mt-1">
              متوافقة مع نظام حماية البيانات الشخصية (PDPL) في المملكة العربية السعودية
            </p>
          </div>

          <div className="space-y-8 text-gray-700 leading-relaxed text-[15px]">

            {/* 1 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">١.</span> المقدمة
              </h3>
              <p>
                تُعدّ منصة <strong>توافد (Tawafud)</strong> مساعداً طبياً ذكياً مخصصاً لتيسير خدمات الرعاية الصحية،
                تشمل حجز المواعيد، والاستفسارات الطبية، والتواصل مع مرافق الرعاية الصحية.
                نحن نُولي حماية بياناتك الشخصية أهمية قصوى، ونلتزم بأحكام <strong>نظام حماية البيانات الشخصية السعودي (PDPL)</strong>
                الصادر بالمرسوم الملكي رقم م/19 لعام 1443هـ ولوائحه التنفيذية.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٢.</span> البيانات التي نجمعها
              </h3>
              <p className="mb-3">نجمع الأنواع التالية من البيانات الشخصية:</p>
              <div className="space-y-3">
                {[
                  {
                    title: '٢.١ بيانات الهوية',
                    items: ['الاسم الكامل', 'تاريخ الميلاد', 'الجنس', 'رقم السجل الطبي (MRN)'],
                  },
                  {
                    title: '٢.٢ بيانات الاتصال',
                    items: ['رقم الجوال', 'البريد الإلكتروني', 'العنوان البريدي'],
                  },
                  {
                    title: '٢.٣ البيانات الصحية',
                    items: [
                      'المواعيد الطبية وسجل الحجوزات',
                      'الحساسيات والحالات المزمنة (بموافقة صريحة)',
                      'نصوص وتسجيلات المكالمات الصوتية (مشفرة)',
                    ],
                  },
                  {
                    title: '٢.٤ البيانات التقنية',
                    items: [
                      'عنوان IP وبيانات الجهاز',
                      'سجلات الاستخدام وبيانات الجلسة',
                      'ملفات تعريف الارتباط (Cookies)',
                    ],
                  },
                ].map((section) => (
                  <div key={section.title} className="bg-gray-50 rounded-xl p-4">
                    <h4 className="font-semibold text-gray-800 mb-2">{section.title}</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600 text-sm">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* 3 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٣.</span> الأساس القانوني للمعالجة
              </h3>
              <p className="mb-3">نعالج بياناتك استناداً إلى الأسس القانونية التالية وفق نظام PDPL:</p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-primary-50">
                      <th className="border border-primary-100 px-4 py-2 text-right">الغرض</th>
                      <th className="border border-primary-100 px-4 py-2 text-right">الأساس القانوني</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['حجز المواعيد وإدارتها', 'تنفيذ العقد / الموافقة الصريحة'],
                      ['تقديم الرعاية الصحية', 'المصلحة الحيوية / المتطلبات التنظيمية'],
                      ['الإشعارات والتذكيرات', 'الموافقة الصريحة'],
                      ['التحليلات وتحسين الخدمة', 'المصلحة المشروعة'],
                      ['الامتثال القانوني', 'الالتزام القانوني'],
                    ].map(([purpose, basis], i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-4 py-2">{purpose}</td>
                        <td className="border border-gray-200 px-4 py-2 text-primary-700 font-medium">{basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٤.</span> كيفية استخدام بياناتك
              </h3>
              <ul className="space-y-2">
                {[
                  'حجز وإدارة مواعيدك الطبية مع مزودي الرعاية الصحية',
                  'إرسال تذكيرات المواعيد عبر الرسائل النصية أو واتساب',
                  'تشغيل المساعد الذكي للرد على استفساراتك الطبية',
                  'تحسين جودة خدماتنا عبر تحليل أنماط الاستخدام (مجهولة الهوية)',
                  'الامتثال للمتطلبات التنظيمية الصحية في المملكة العربية السعودية',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary-500 mt-1">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 5 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٥.</span> مشاركة البيانات مع أطراف ثالثة
              </h3>
              <p className="mb-3">
                لا نبيع بياناتك الشخصية لأي طرف ثالث. قد نشارك بياناتك في الحالات التالية فقط:
              </p>
              <ul className="space-y-2 text-sm">
                {[
                  {
                    title: 'مزودو الرعاية الصحية',
                    desc: 'الأطباء والمرافق الطبية المعنية بتقديم الرعاية لك',
                  },
                  {
                    title: 'مزودو الخدمات التقنية',
                    desc: 'Twilio (الاتصالات) و OpenAI/Google (الذكاء الاصطناعي) بموجب اتفاقيات معالجة بيانات صارمة',
                  },
                  {
                    title: 'الجهات التنظيمية',
                    desc: 'وزارة الصحة، الهيئة السعودية للتخصصات الصحية، عند الطلب القانوني',
                  },
                  {
                    title: 'حالات الطوارئ',
                    desc: 'لحماية حياتك أو سلامة أشخاص آخرين في الحالات الطارئة',
                  },
                ].map((item) => (
                  <li key={item.title} className="bg-gray-50 rounded-lg p-3">
                    <span className="font-semibold text-gray-800">{item.title}: </span>
                    <span className="text-gray-600">{item.desc}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 6 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٦.</span> أمن البيانات
              </h3>
              <p className="mb-3">نطبق معايير أمنية متقدمة لحماية بياناتك:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: '🔐', title: 'تشفير AES-256', desc: 'لجميع البيانات المخزنة' },
                  { icon: '🔒', title: 'HTTPS/TLS', desc: 'لجميع الاتصالات الشبكية' },
                  { icon: '🛡️', title: 'مصادقة ثنائية', desc: 'لحسابات المسؤولين' },
                  { icon: '📋', title: 'سجلات التدقيق', desc: 'تتبع كامل لعمليات الوصول' },
                  { icon: '🔍', title: 'تحجيم البيانات الحساسة', desc: 'إخفاء PII في السجلات' },
                  { icon: '🏥', title: 'عزل البيانات', desc: 'بيانات كل منشأة معزولة تماماً' },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <div className="font-semibold text-gray-800 text-sm">{item.title}</div>
                      <div className="text-gray-500 text-xs">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 7 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٧.</span> حقوقك وفق نظام PDPL
              </h3>
              <p className="mb-3">يمنحك نظام حماية البيانات الشخصية الحقوق التالية:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { right: 'الحق في الاطلاع', desc: 'طلب نسخة من بياناتك الشخصية المحفوظة لدينا' },
                  { right: 'الحق في التصحيح', desc: 'تصحيح بياناتك غير الدقيقة أو غير المكتملة' },
                  { right: 'الحق في الحذف', desc: 'طلب حذف بياناتك (مع مراعاة الالتزامات القانونية)' },
                  { right: 'الحق في سحب الموافقة', desc: 'سحب موافقتك على المعالجة في أي وقت' },
                  { right: 'الحق في نقل البيانات', desc: 'الحصول على بياناتك بصيغة قابلة للنقل' },
                  { right: 'الحق في تقديم شكوى', desc: 'التقدم بشكوى للهيئة السعودية للبيانات والذكاء الاصطناعي (SDAIA)' },
                ].map((item) => (
                  <div key={item.right} className="border border-primary-100 rounded-xl p-3 bg-primary-50/30">
                    <div className="font-semibold text-primary-800 text-sm mb-1">{item.right}</div>
                    <div className="text-gray-600 text-xs">{item.desc}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-600">
                لممارسة أي من هذه الحقوق، تواصل معنا على:{' '}
                <a href="mailto:privacy@tawafud.raskh.app" className="text-primary-600 hover:underline font-medium">
                  privacy@tawafud.raskh.app
                </a>
              </p>
            </section>

            {/* 8 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٨.</span> الاحتفاظ بالبيانات
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-200 px-4 py-2 text-right">نوع البيانات</th>
                      <th className="border border-gray-200 px-4 py-2 text-right">مدة الاحتفاظ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['السجلات الطبية والمواعيد', '10 سنوات (وفق اشتراطات وزارة الصحة)'],
                      ['سجلات الاتصال والمحادثات', '3 سنوات'],
                      ['بيانات التحليلات (مجهولة)', '5 سنوات'],
                      ['سجلات الأمن والتدقيق', 'سنة واحدة'],
                      ['بيانات التسويق (بعد سحب الموافقة)', 'حذف فوري خلال 30 يوماً'],
                    ].map(([type, period], i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-4 py-2">{type}</td>
                        <td className="border border-gray-200 px-4 py-2 text-primary-700">{period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 9 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">٩.</span> نقل البيانات عبر الحدود
              </h3>
              <p>
                تُعالج بياناتك بصفة أساسية داخل المملكة العربية السعودية. في حالة نقل بيانات لمزودي خدمات خارج المملكة
                (مثل خدمات الذكاء الاصطناعي)، نحرص على توافر الضمانات المناسبة وفق متطلبات نظام PDPL،
                بما يشمل اتفاقيات معالجة البيانات وعدم مشاركة البيانات الشخصية المعرِّفة بشكل مباشر.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">١٠.</span> ملفات تعريف الارتباط (Cookies)
              </h3>
              <p>
                نستخدم ملفات تعريف ارتباط ضرورية للتشغيل (مثل جلسة المستخدم) وملفات تحليلية مجهولة الهوية.
                يمكنك التحكم في ملفات تعريف الارتباط من خلال إعدادات متصفحك. تعطيل بعض الملفات قد يؤثر
                على تجربة استخدام المنصة.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">١١.</span> التغييرات على هذه السياسة
              </h3>
              <p>
                قد نُحدِّث هذه السياسة دورياً. سنُخطرك بأي تغييرات جوهرية عبر البريد الإلكتروني أو إشعار
                داخل المنصة قبل 30 يوماً من نفاذها. الاستمرار في استخدام الخدمة بعد التحديث يُعدّ موافقة
                على السياسة المحدَّثة.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-primary-600">١٢.</span> التواصل معنا
              </h3>
              <div className="bg-primary-50 rounded-xl p-6 border border-primary-100">
                <p className="font-semibold text-primary-900 mb-4">مسؤول حماية البيانات – منصة توافد</p>
                <div className="space-y-2 text-sm text-primary-800">
                  <p>📧 البريد الإلكتروني: <a href="mailto:privacy@tawafud.raskh.app" className="font-medium hover:underline">privacy@tawafud.raskh.app</a></p>
                  <p>📞 الهاتف: <a href="tel:+966920000000" className="font-medium hover:underline">+966 920 000 000</a></p>
                  <p>📍 العنوان: الرياض، المملكة العربية السعودية</p>
                  <p>🌐 الموقع: <a href="https://tawafud.raskh.app" className="font-medium hover:underline">tawafud.raskh.app</a></p>
                </div>
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} توافد – جميع الحقوق محفوظة |{' '}
              <a href="/terms" className="text-primary-600 hover:underline">شروط الاستخدام</a>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              متوافقة مع نظام حماية البيانات الشخصية (PDPL) – مرسوم ملكي م/19 لعام 1443هـ
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
