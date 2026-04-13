import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import {
  MessageSquare,
  Bell,
  Users,
  Megaphone,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Sparkles,
} from 'lucide-react'

interface MarketingOnboardingProps {
  isAr: boolean
  hasTemplates: boolean
  hasReminders: boolean
  hasCampaigns: boolean
}

const STORAGE_KEY = 'marketing-onboarding-dismissed'

const steps = [
  {
    key: 'templates',
    en: 'Set Up Message Templates',
    ar: 'إعداد قوالب الرسائل',
    descEn: 'Create SMS and WhatsApp templates for automated messaging',
    descAr: 'أنشئ قوالب الرسائل النصية والواتساب للرسائل التلقائية',
    href: '/dashboard/sms-templates',
    icon: MessageSquare,
    color: 'bg-primary-100 text-primary-600',
  },
  {
    key: 'reminders',
    en: 'Configure Reminders',
    ar: 'إعداد التذكيرات',
    descEn: 'Set up automatic appointment reminders to reduce no-shows',
    descAr: 'اضبط تذكيرات المواعيد التلقائية لتقليل حالات عدم الحضور',
    href: '/dashboard/reminders',
    icon: Bell,
    color: 'bg-amber-100 text-amber-600',
  },
  {
    key: 'insights',
    en: 'Explore Patient Insights',
    ar: 'استكشف تحليلات المرضى',
    descEn: 'Understand your patient segments and behavior patterns',
    descAr: 'افهم شرائح المرضى وأنماط سلوكهم',
    href: '/dashboard/patient-insights',
    icon: Users,
    color: 'bg-blue-100 text-blue-600',
  },
  {
    key: 'campaign',
    en: 'Create Your First Campaign',
    ar: 'أنشئ حملتك الأولى',
    descEn: 'Launch a targeted outreach campaign via WhatsApp or SMS',
    descAr: 'أطلق حملة تواصل مستهدفة عبر واتساب أو رسالة نصية',
    href: '/dashboard/campaigns',
    icon: Megaphone,
    color: 'bg-primary-100 text-primary-600',
  },
]

export default function MarketingOnboarding({ isAr, hasTemplates, hasReminders, hasCampaigns }: MarketingOnboardingProps) {
  const navigate = useNavigate()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') setDismissed(true)
  }, [])

  if (dismissed) return null

  const completion: Record<string, boolean> = {
    templates: hasTemplates,
    reminders: hasReminders,
    insights: true, // always viewable
    campaign: hasCampaigns,
  }
  const completedCount = Object.values(completion).filter(Boolean).length
  const allDone = completedCount === steps.length

  if (allDone) return null

  const Arrow = isAr ? ChevronLeft : ChevronRight

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-primary-50 to-white border-primary-200/50">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-xl">
              <Sparkles className="h-6 w-6 text-primary-600" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-healthcare-text">
                {isAr ? 'ابدأ مع التسويق' : 'Get Started with Marketing'}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {isAr
                  ? `${completedCount} من ${steps.length} خطوات مكتملة`
                  : `${completedCount} of ${steps.length} steps completed`}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(STORAGE_KEY, 'true')
              setDismissed(true)
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {isAr ? 'إخفاء' : 'Dismiss'}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-gray-100 rounded-full mb-5">
          <div
            className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {steps.map((step) => {
            const done = completion[step.key]
            return (
              <button
                key={step.key}
                onClick={() => navigate(step.href)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl text-start transition-all',
                  done
                    ? 'bg-green-50/50 border border-green-200/50'
                    : 'bg-white border border-gray-200 hover:border-primary-300 hover:shadow-sm',
                )}
              >
                <div className={cn('p-2 rounded-lg shrink-0', done ? 'bg-green-100' : step.color.split(' ')[0])}>
                  {done ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <step.icon className={cn('h-5 w-5', step.color.split(' ')[1])} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', done ? 'text-green-700 line-through' : 'text-gray-800')}>
                    {isAr ? step.ar : step.en}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{isAr ? step.descAr : step.descEn}</p>
                </div>
                {!done && <Arrow className="h-4 w-4 text-gray-300 shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
