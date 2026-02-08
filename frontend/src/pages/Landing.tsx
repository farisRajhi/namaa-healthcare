import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  MessageCircle,
  Calendar,
  Users,
  BarChart3,
  Clock,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
  Phone,
  Bot,
  Building2,
  PhoneCall,
} from 'lucide-react'
import VoiceDemoRealtime from '../components/voice/VoiceDemoRealtime'
import DemoChatEmbed from '../components/chat/DemoChatEmbed'

export default function Landing() {
  const { t } = useTranslation()

  const stats = [
    { value: '50%', label: t('landing.stats.noShows') },
    { value: '24/7', label: t('landing.stats.availability') },
    { value: '3x', label: t('landing.stats.bookings') },
    { value: '< 1min', label: t('landing.stats.responseTime') },
  ]

  const features = [
    {
      icon: MessageCircle,
      title: t('landing.features.whatsapp.title'),
      description: t('landing.features.whatsapp.description'),
    },
    {
      icon: Calendar,
      title: t('landing.features.scheduling.title'),
      description: t('landing.features.scheduling.description'),
    },
    {
      icon: Users,
      title: t('landing.features.patients.title'),
      description: t('landing.features.patients.description'),
    },
    {
      icon: BarChart3,
      title: t('landing.features.analytics.title'),
      description: t('landing.features.analytics.description'),
    },
    {
      icon: Clock,
      title: t('landing.features.reminders.title'),
      description: t('landing.features.reminders.description'),
    },
    {
      icon: Building2,
      title: t('landing.features.multiLocation.title'),
      description: t('landing.features.multiLocation.description'),
    },
  ]

  const steps = [
    {
      step: '01',
      icon: Phone,
      title: t('landing.howItWorks.step1.title'),
      description: t('landing.howItWorks.step1.description'),
    },
    {
      step: '02',
      icon: Bot,
      title: t('landing.howItWorks.step2.title'),
      description: t('landing.howItWorks.step2.description'),
    },
    {
      step: '03',
      icon: Zap,
      title: t('landing.howItWorks.step3.title'),
      description: t('landing.howItWorks.step3.description'),
    },
  ]

  const benefits = [
    t('landing.benefits.list.workload'),
    t('landing.benefits.list.satisfaction'),
    t('landing.benefits.list.slots'),
    t('landing.benefits.list.hipaa'),
    t('landing.benefits.list.integration'),
  ]

  const securityFeatures = [
    t('landing.benefits.security.encryption'),
    t('landing.benefits.security.hipaa'),
    t('landing.benefits.security.audits'),
    t('landing.benefits.security.residency'),
  ]

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 start-0 end-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">{t('landing.brand')}</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="#demo"
                className="text-primary-600 hover:text-primary-700 font-medium transition-colors flex items-center gap-1"
              >
                <PhoneCall className="w-4 h-4" />
                جرب الآن
              </a>
              <Link
                to="/login"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
              >
                {t('common.signIn')}
              </Link>
              <Link
                to="/register"
                className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {t('common.getStarted')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Bot className="w-4 h-4" />
              {t('landing.badge')}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              {t('landing.hero.title')}{' '}
              <span className="text-primary-600">{t('landing.hero.highlight')}</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              {t('landing.hero.subtitle')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
              >
                {t('landing.cta.trial')}
                <ArrowRight className="w-5 h-5 rtl:rotate-180" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
              >
                {t('landing.cta.howItWorks')}
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-primary-600 mb-2">{stat.value}</div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.features.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="w-6 h-6 text-primary-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t('landing.howItWorks.title')}
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-6 relative">
                  <item.icon className="w-8 h-8 text-white" />
                  <span className="absolute -top-2 -end-2 w-8 h-8 bg-gray-900 text-white text-sm font-bold rounded-full flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Bot className="w-4 h-4" />
              جرب الآن مجاناً
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              جرب المساعد الذكي
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              تفاعل مع مساعدنا الذكي عبر المحادثة النصية أو الصوتية
            </p>
          </div>

          {/* Demo Cards - Side by Side */}
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <DemoChatEmbed />
            <VoiceDemoRealtime />
          </div>

          {/* Features List */}
          <div className="mt-16 flex flex-wrap justify-center gap-8">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-primary-600" />
              <span className="text-gray-700">يفهم اللهجات العربية</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-primary-600" />
              <span className="text-gray-700">حجز المواعيد</span>
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-primary-600" />
              <span className="text-gray-700">متاح 24/7</span>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-primary-600 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                {t('landing.benefits.title')}
              </h2>
              <p className="text-primary-100 text-lg mb-8">
                {t('landing.benefits.subtitle')}
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3 text-white">
                    <CheckCircle className="w-6 h-6 text-primary-200 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{t('landing.benefits.security.title')}</h3>
                  <p className="text-gray-600 text-sm">{t('landing.benefits.security.subtitle')}</p>
                </div>
              </div>
              <ul className="space-y-3 text-gray-600">
                {securityFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary-600" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            {t('landing.finalCta.title')}
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            {t('landing.finalCta.subtitle')}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold text-lg transition-colors"
          >
            {t('landing.cta.getStartedFree')}
            <ArrowRight className="w-5 h-5 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <MessageCircle className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold text-white">{t('landing.brand')}</span>
            </div>
            <div className="flex items-center gap-8">
              <a href="#features" className="hover:text-white transition-colors">{t('common.features')}</a>
              <Link to="/login" className="hover:text-white transition-colors">{t('common.signIn')}</Link>
              <Link to="/register" className="hover:text-white transition-colors">{t('common.getStarted')}</Link>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
            &copy; {new Date().getFullYear()} {t('landing.footer.copyright')}
          </div>
        </div>
      </footer>

    </div>
  )
}
