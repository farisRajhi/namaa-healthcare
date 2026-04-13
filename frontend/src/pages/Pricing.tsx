import { useState } from 'react';
import { CheckCircle, Zap, Stethoscope, Crown, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PLANS = [
  {
    id: 'starter',
    nameAr: 'المبتدئ',
    nameEn: 'Starter',
    price: 299,
    amount: 29900,
    icon: Zap,
    color: 'blue' as const,
    description: 'للعيادات الصغيرة',
    descriptionEn: 'For small clinics',
    features: [
      'AI Appointment Booking (Arabic + English)',
      'WhatsApp & SMS Integration',
      'Up to 5 Providers',
      'Basic Analytics Dashboard',
      'Email Support',
    ],
    featuresAr: [
      'حجز المواعيد بالذكاء الاصطناعي',
      'تكامل WhatsApp و SMS',
      'حتى 5 مزودين',
      'لوحة تحكم تحليلية أساسية',
      'دعم بالبريد الإلكتروني',
    ],
  },
  {
    id: 'professional',
    nameAr: 'الاحترافي',
    nameEn: 'Professional',
    price: 499,
    amount: 49900,
    icon: Stethoscope,
    color: 'purple' as const,
    description: 'للمنشآت المتوسطة',
    descriptionEn: 'For medium-sized facilities',
    features: [
      'Everything in Starter',
      'Up to 25 Providers',
      'Voice AI (Arabic Dialects)',
      'Campaign Management',
      'Patient Memory & CRM',
      'Priority Support',
    ],
    featuresAr: [
      'كل مزايا المبتدئ',
      'حتى 25 مزوداً',
      'الذكاء الاصطناعي الصوتي (لهجات عربية)',
      'إدارة الحملات',
      'ذاكرة المريض وCRM',
      'دعم أولوية',
    ],
    popular: true,
  },
  {
    id: 'enterprise',
    nameAr: 'المؤسسي',
    nameEn: 'Enterprise',
    price: 799,
    amount: 79900,
    icon: Crown,
    color: 'gold' as const,
    description: 'للمستشفيات والمجموعات',
    descriptionEn: 'For hospitals & groups',
    features: [
      'Everything in Professional',
      'Unlimited Providers & Facilities',
      'Custom AI Agent Builder',
      'EHR Integration (HL7/FHIR)',
      'Dedicated Account Manager',
      'Custom SLA + 24/7 Support',
      'On-premise option available',
    ],
    featuresAr: [
      'كل مزايا الاحترافي',
      'مزودون ومنشآت غير محدودة',
      'بناء وكيل AI مخصص',
      'تكامل السجلات الطبية',
      'مدير حساب مخصص',
      'اتفاقية مستوى خدمة + دعم 24/7',
      'خيار التثبيت المحلي',
    ],
  },
];

interface PricingProps {
  lang?: 'ar' | 'en';
}

export default function Pricing({ lang = 'en' }: PricingProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRTL = lang === 'ar';

  async function handleSubscribe(plan: (typeof PLANS)[0]) {
    setLoading(plan.id);
    setError(null);

    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login?redirect=/pricing');
      return;
    }

    try {
      const response = await fetch('/api/subscription/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: plan.id,
          source: {
            type: 'creditcard',
          },
          callbackUrl: `${window.location.origin}/billing?payment=callback&plan=${plan.id}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate payment');
      }

      if (data.transactionUrl) {
        try {
          const url = new URL(data.transactionUrl);
          if (url.protocol === 'https:' && url.hostname.endsWith('.moyasar.com')) {
            window.location.href = data.transactionUrl;
          } else {
            setError('Invalid payment redirect URL');
          }
        } catch {
          setError('Invalid payment redirect URL');
        }
      } else {
        navigate(`/billing?paymentId=${data.moyasarPayment?.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-16 px-4 ${isRTL ? 'rtl' : 'ltr'}`}
    >
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">
          {isRTL ? 'اختر خطة توافد' : 'Choose Your Tawafud Plan'}
        </h1>
        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
          {isRTL
            ? 'وكيل ذكاء اصطناعي متكامل لإدارة المواعيد والمرضى بالعربية والإنجليزية'
            : 'Full-stack AI agent for appointment management and patient engagement in Arabic & English'}
        </p>
        {error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 max-w-md mx-auto">
            {error}
          </div>
        )}
      </div>

      {/* Plans Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {PLANS.map((plan) => {
          const Icon = plan.icon;
          const isPopular = plan.popular;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-slate-800/50 backdrop-blur-sm p-8 flex flex-col transition-all hover:scale-105 ${
                isPopular
                  ? 'border-purple-500 shadow-lg shadow-purple-500/20'
                  : 'border-slate-700'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-sm font-bold px-4 py-1 rounded-full whitespace-nowrap">
                  {isRTL ? 'الأكثر شيوعاً' : 'Most Popular'}
                </div>
              )}

              <div className="mb-6">
                <div
                  className={`inline-flex p-3 rounded-xl mb-4 ${
                    plan.color === 'blue'
                      ? 'bg-blue-500/20 text-blue-400'
                      : plan.color === 'purple'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold text-white">
                  {isRTL ? plan.nameAr : plan.nameEn}
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  {isRTL ? plan.description : plan.descriptionEn}
                </p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-slate-400">
                    {isRTL ? 'ريال / شهر' : 'SAR / month'}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-grow">
                {(isRTL ? plan.featuresAr : plan.features).map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan)}
                disabled={loading === plan.id}
                className={`w-full py-3 px-6 rounded-xl font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  isPopular
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                }`}
              >
                {loading === plan.id ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isRTL ? 'جاري المعالجة...' : 'Processing...'}
                  </>
                ) : (
                  <>
                    {isRTL ? `ابدأ مع ${plan.nameAr}` : `Get Started with ${plan.nameEn}`}
                    <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Trust Section */}
      <div className="mt-16 text-center">
        <p className="text-slate-500 text-sm">
          🔒 {isRTL ? 'مدفوعات آمنة عبر' : 'Secure payments via'}{' '}
          <span className="text-slate-400 font-medium">Moyasar</span>
          {' '}• SSL {isRTL ? 'مشفر' : 'encrypted'} •{' '}
          {isRTL ? 'يمكن الإلغاء في أي وقت' : 'Cancel anytime'}
        </p>
        <div className="flex justify-center gap-8 mt-4 text-slate-500 text-xs">
          <span>💳 {isRTL ? 'بطاقات ائتمانية' : 'Credit Cards'}</span>
          <span>🍎 Apple Pay</span>
          <span>🏦 mada</span>
          <span>🔄 SADAD</span>
        </div>
      </div>
    </div>
  );
}
