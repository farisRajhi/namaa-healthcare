import { useState } from 'react';
import { CheckCircle, Zap, Stethoscope, Crown, ArrowRight, X, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TapCardForm from '../components/billing/TapCardForm';

type PlanId = 'starter' | 'professional' | 'enterprise';

interface Plan {
  id: PlanId;
  nameAr: string;
  nameEn: string;
  price: number;
  amount: number;
  icon: typeof Zap;
  color: 'blue' | 'purple' | 'gold';
  description: string;
  descriptionEn: string;
  features: string[];
  featuresAr: string[];
  popular?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    nameAr: 'المبتدئ',
    nameEn: 'Starter',
    price: 299,
    amount: 29900,
    icon: Zap,
    color: 'blue',
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
    color: 'purple',
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
    color: 'gold',
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
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isRTL = lang === 'ar';

  function handleSubscribeClick(plan: Plan) {
    setError(null);
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login?redirect=/pricing');
      return;
    }
    setSelectedPlan(plan);
  }

  async function handleTokenized(tokenId: string) {
    if (!selectedPlan) return;
    const authToken = localStorage.getItem('token');
    const response = await fetch('/api/payments/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        tokenId,
        plan: selectedPlan.id,
        callbackUrl: `${window.location.origin}/billing?payment=callback&plan=${selectedPlan.id}`,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Payment failed');
    }

    if (data.transactionUrl) {
      const url = new URL(data.transactionUrl);
      if (url.protocol === 'https:' && url.hostname.endsWith('.tap.company')) {
        window.location.href = data.transactionUrl;
        return;
      }
      throw new Error('Invalid payment redirect URL');
    }

    navigate(`/billing?chargeId=${encodeURIComponent(data.chargeId)}`);
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
        {error && !selectedPlan && (
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
                onClick={() => handleSubscribeClick(plan)}
                className={`w-full py-3 px-6 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                  isPopular
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-slate-700 hover:bg-slate-600 border border-slate-600'
                }`}
              >
                {isRTL ? `ابدأ مع ${plan.nameAr}` : `Get Started with ${plan.nameEn}`}
                <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Trust Section */}
      <div className="mt-16 text-center">
        <p className="text-slate-500 text-sm">
          <Lock className="inline w-3.5 h-3.5 -mt-0.5 me-1" />
          {isRTL ? 'مدفوعات آمنة عبر' : 'Secure payments via'}{' '}
          <span className="text-slate-400 font-medium">Tap Payments</span>
          {' '}• SSL {isRTL ? 'مشفر' : 'encrypted'} •{' '}
          {isRTL ? 'يمكن الإلغاء في أي وقت' : 'Cancel anytime'}
        </p>
        <div className="flex justify-center gap-8 mt-4 text-slate-500 text-xs">
          <span>💳 {isRTL ? 'بطاقات ائتمانية' : 'Credit Cards'}</span>
          <span>🍎 Apple Pay</span>
          <span>🏦 mada</span>
          <span>🔒 3D Secure</span>
        </div>
      </div>

      {/* Card entry modal */}
      {selectedPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelectedPlan(null)}
        >
          <div
            className="bg-slate-800 rounded-2xl border border-slate-700 w-full max-w-md p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-4 end-4 text-slate-400 hover:text-white"
              onClick={() => setSelectedPlan(null)}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-4">
              <h3 className="text-xl font-bold text-white">
                {isRTL ? `الاشتراك في ${selectedPlan.nameAr}` : `Subscribe to ${selectedPlan.nameEn}`}
              </h3>
              <p className="text-slate-400 text-sm mt-1">
                {isRTL
                  ? `${selectedPlan.price} ريال شهرياً • تجديد تلقائي`
                  : `${selectedPlan.price} SAR / month • auto-renews`}
              </p>
            </div>

            <TapCardForm
              amount={selectedPlan.price}
              currency="SAR"
              customer={{ userId: user?.userId, email: user?.email }}
              isRTL={isRTL}
              onTokenized={handleTokenized}
              onError={setError}
            />
          </div>
        </div>
      )}
    </div>
  );
}
