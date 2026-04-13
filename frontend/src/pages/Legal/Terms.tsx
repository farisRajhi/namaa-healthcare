/**
 * Tawafud (توافد) – شروط الاستخدام
 * Arabic Terms of Service
 */

import { useTranslation } from 'react-i18next'
import { FileText, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Terms() {
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
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">شروط الاستخدام</h1>
              <p className="text-xs text-gray-500">Terms of Service</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">

          {/* Title */}
          <div className="text-center mb-10 pb-8 border-b border-gray-100">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-50 rounded-2xl mb-4">
              <FileText size={32} className="text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">شروط الاستخدام</h2>
            <p className="text-gray-500">آخر تحديث: فبراير 2026</p>
            <p className="text-gray-500 text-sm mt-1">
              يُرجى قراءة هذه الشروط بعناية قبل استخدام منصة توافد
            </p>
          </div>

          {/* Alert */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">تنبيه مهم</p>
              <p>
                منصة توافد هي أداة مساعدة إدارية وليست بديلاً عن الرعاية الطبية المتخصصة.
                في حالات الطوارئ الطبية، يُرجى الاتصال بالرقم <strong>911</strong> فوراً.
              </p>
            </div>
          </div>

          <div className="space-y-8 text-gray-700 leading-relaxed text-[15px]">

            {/* 1 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">١.</span> قبول الشروط
              </h3>
              <p>
                باستخدامك لمنصة <strong>توافد (Tawafud)</strong> – المساعد الطبي الذكي – سواء عبر الموقع الإلكتروني
                أو التطبيق أو واجهة برمجية أو خدمة الاتصال الصوتي، فإنك توافق على الالتزام بهذه الشروط وسياسة
                الخصوصية المرفقة. إذا كنت تستخدم المنصة نيابةً عن منشأة صحية، فإنك تُقر بأن لديك صلاحية
                قبول هذه الشروط بالنيابة عنها.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٢.</span> وصف الخدمة
              </h3>
              <p className="mb-3">تُقدم منصة توافد الخدمات التالية:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: '📅', title: 'إدارة المواعيد', desc: 'حجز وتعديل وإلغاء المواعيد الطبية' },
                  { icon: '🤖', title: 'المساعد الذكي', desc: 'الرد على الاستفسارات الطبية الإدارية' },
                  { icon: '📱', title: 'التواصل متعدد القنوات', desc: 'عبر الهاتف والواتساب والويب' },
                  { icon: '📊', title: 'التقارير والتحليلات', desc: 'لوحات تحكم إدارية للمنشآت الصحية' },
                  { icon: '🔔', title: 'التذكيرات الذكية', desc: 'إشعارات تلقائية للمرضى والكادر الطبي' },
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

            {/* 3 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٣.</span> الأهلية والتسجيل
              </h3>
              <ul className="space-y-2">
                {[
                  'يجب أن يكون عمرك 18 عاماً أو أكثر لاستخدام الخدمة، أو 16 عاماً بموافقة ولي الأمر',
                  'أنت مسؤول عن الحفاظ على سرية بيانات دخولك وعدم مشاركتها',
                  'يُحظر إنشاء حسابات متعددة لشخص واحد بقصد التحايل',
                  'تُقر بأن المعلومات المُقدَّمة عند التسجيل دقيقة وصحيحة',
                  'للمنشآت الصحية: المسؤول الأول هو مدير الحساب المُعيَّن',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٤.</span> الاستخدام المقبول
              </h3>
              <p className="mb-3">تلتزم بعدم:</p>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <ul className="space-y-2 text-sm text-red-800">
                  {[
                    'انتحال شخصية مرضى أو أطباء آخرين أو موظفين',
                    'إدخال بيانات طبية مضللة أو كاذبة',
                    'استخدام المنصة لأغراض غير طبية أو تجارية غير مرخصة',
                    'محاولة اختراق أمان المنصة أو الوصول لبيانات الآخرين',
                    'إساءة استخدام المساعد الذكي بطريقة تُلحق ضرراً بالخدمة',
                    'إعادة بيع أو ترخيص الخدمة لأطراف ثالثة دون إذن خطي',
                    'تحميل أي محتوى ضار أو فيروسات أو برامج خبيثة',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 5 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٥.</span> حدود المسؤولية الطبية
              </h3>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
                <p className="text-blue-900 font-semibold mb-3">إخلاء المسؤولية الطبي</p>
                <ul className="space-y-2 text-sm text-blue-800">
                  {[
                    'توافد هي منصة إدارية وليست مزوداً للرعاية الصحية',
                    'لا تُشكّل المعلومات المُقدَّمة تشخيصاً طبياً أو وصفة علاجية',
                    'القرارات الطبية النهائية تعود دائماً للطبيب المرخص',
                    'لا تتحمل توافد مسؤولية قرارات طبية مبنية على محادثات مع المساعد الذكي',
                    'في الطوارئ اتصل بـ 911 أو اذهب لأقرب طوارئ فوراً',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1">ℹ️</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 6 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٦.</span> الاشتراكات والفوترة (للمنشآت)
              </h3>
              <ul className="space-y-2">
                {[
                  'خطط الاشتراك وأسعارها محددة في اتفاقية الخدمة المنفصلة مع المنشأة',
                  'الفوترة شهرية/سنوية مقدماً، وغير قابلة للاسترداد إلا وفق سياسة الاسترداد',
                  'التأخر في السداد يمنح توافد حق تعليق الخدمة بعد إشعار 7 أيام',
                  'جميع الأسعار بالريال السعودي وتشمل ضريبة القيمة المضافة (15%)',
                  'يحق لتوافد تعديل الأسعار مع إشعار 60 يوماً مسبقاً',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٧.</span> الملكية الفكرية
              </h3>
              <p className="mb-3">
                جميع عناصر منصة توافد – بما يشمل الكود المصدري، التصاميم، الخوارزميات، نماذج الذكاء الاصطناعي،
                والمحتوى – هي ملكية فكرية حصرية لتوافد أو مرخصيها، وتخضع لحقوق النشر والعلامات التجارية.
              </p>
              <p>
                تحتفظ المنشآت الصحية بملكية بياناتها الخاصة المحفوظة في المنصة. يمنحك استخدام الخدمة
                ترخيصاً محدوداً وغير حصري وغير قابل للتحويل لاستخدام المنصة لأغراضها المعتادة.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٨.</span> مستوى الخدمة (SLA)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-200 px-4 py-2 text-right">المعيار</th>
                      <th className="border border-gray-200 px-4 py-2 text-right">الالتزام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['وقت التشغيل', '99.5% شهرياً (باستثناء الصيانة المجدولة)'],
                      ['وقت استجابة الدعم', 'خلال 4 ساعات عمل للحوادث الحرجة'],
                      ['النسخ الاحتياطية', 'يومية مع استرداد خلال 24 ساعة'],
                      ['التحديثات الأمنية', 'خلال 48 ساعة من اكتشاف الثغرة'],
                      ['إشعار الانقطاع', 'قبل 24 ساعة للصيانة المجدولة'],
                    ].map(([criterion, commitment], i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-4 py-2 font-medium">{criterion}</td>
                        <td className="border border-gray-200 px-4 py-2 text-blue-700">{commitment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 9 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">٩.</span> إنهاء الخدمة
              </h3>
              <ul className="space-y-2">
                {[
                  'يحق للمستخدم إنهاء حسابه في أي وقت عبر إعدادات الحساب أو بالتواصل مع الدعم',
                  'يحق لتوافد تعليق أو إنهاء الحساب عند انتهاك هذه الشروط',
                  'عند الإنهاء، يمكن تصدير بياناتك خلال 30 يوماً ثم تُحذف بشكل آمن',
                  'الالتزامات المالية المستحقة قبل الإنهاء تظل سارية',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 10 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">١٠.</span> تسوية النزاعات والقانون المطبق
              </h3>
              <p className="mb-3">
                تخضع هذه الشروط وتُفسَّر وفقاً لنظام التجارة الإلكترونية السعودي ولوائحه التنفيذية،
                وأحكام نظام التعاملات الإلكترونية، وقوانين المملكة العربية السعودية المعمول بها.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm">
                <p className="font-semibold mb-2">آلية تسوية النزاعات:</p>
                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                  <li>التواصل المباشر مع فريق دعم توافد (الأولوية القصوى)</li>
                  <li>التفاوض الودي خلال 30 يوماً</li>
                  <li>الوساطة عبر مركز التحكيم التجاري لدول مجلس التعاون الخليجي</li>
                  <li>التقاضي أمام المحاكم المختصة في مدينة الرياض</li>
                </ol>
              </div>
            </section>

            {/* 11 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">١١.</span> تعديل الشروط
              </h3>
              <p>
                نحتفظ بحق تعديل هذه الشروط في أي وقت. سيتم إشعارك بأي تغييرات جوهرية عبر البريد الإلكتروني
                المسجل أو إشعار بارز داخل المنصة قبل 30 يوماً. استمرارك في استخدام الخدمة بعد نفاذ
                التعديلات يُعدّ قبولاً صريحاً لها.
              </p>
            </section>

            {/* 12 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">١٢.</span> أحكام متفرقة
              </h3>
              <ul className="space-y-2 text-sm">
                {[
                  'إذا أُبطل أي حكم من هذه الشروط، تظل باقي الأحكام سارية المفعول',
                  'تمثل هذه الشروط الاتفاقية الكاملة بين الطرفين وتحل محل أي اتفاقيات سابقة',
                  'عدم ممارسة توافد لأي حق من حقوقها لا يُعدّ تنازلاً عنه',
                  'لا يجوز التنازل عن هذه الشروط دون موافقة خطية مسبقة من توافد',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-gray-400 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Contact */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="text-blue-600">١٣.</span> التواصل معنا
              </h3>
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                <p className="font-semibold text-blue-900 mb-4">الفريق القانوني – منصة توافد</p>
                <div className="space-y-2 text-sm text-blue-800">
                  <p>📧 البريد الإلكتروني: <a href="mailto:legal@tawafud.raskh.app" className="font-medium hover:underline">legal@tawafud.raskh.app</a></p>
                  <p>📧 الدعم التقني: <a href="mailto:support@tawafud.raskh.app" className="font-medium hover:underline">support@tawafud.raskh.app</a></p>
                  <p>📞 الهاتف: <a href="tel:+966920000000" className="font-medium hover:underline">+966 920 000 000</a></p>
                  <p>📍 العنوان: الرياض، المملكة العربية السعودية</p>
                </div>
              </div>
            </section>

          </div>

          {/* Footer */}
          <div className="mt-10 pt-8 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} توافد – جميع الحقوق محفوظة |{' '}
              <a href="/privacy" className="text-blue-600 hover:underline">سياسة الخصوصية</a>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              خاضعة للقانون السعودي – نظام التجارة الإلكترونية ونظام حماية البيانات الشخصية (PDPL)
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
