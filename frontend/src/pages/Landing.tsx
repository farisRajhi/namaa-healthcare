import { useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  MessageCircle,
  MessageSquare,
  Mail,
  Calendar,
  Users,
  BarChart3,
  Clock,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
  Bot,
  Building2,
  Sparkles,
  Heart,
  Globe,
  Megaphone,
  Workflow,
  Brain,
} from 'lucide-react'
import DemoChatEmbed from '../components/chat/DemoChatEmbed'
import PricingSection from '../components/pricing/PricingSection'
import { gsap, ScrollTrigger, useGSAP } from '../lib/gsap'

export default function Landing() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Clicking a pricing card on the public landing page routes to /pricing,
  // which handles the auth gate + Tap payment flow.
  const handlePricingCta = () => navigate('/pricing')

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar'
    i18n.changeLanguage(newLang)
  }

  const channels = [
    { icon: MessageCircle, label: t('landing.channels.whatsapp') },
    { icon: MessageSquare, label: t('landing.channels.webChat') },
    { icon: Mail, label: t('landing.channels.sms') },
  ]

  const stats = [
    { value: '50%', label: t('landing.stats.noShows'), icon: '📉' },
    { value: '24/7', label: t('landing.stats.availability'), icon: '🕐' },
    { value: '3x', label: t('landing.stats.bookings'), icon: '📈' },
    { value: '< 1min', label: t('landing.stats.responseTime'), icon: '⚡' },
  ]

  const featureCategories = [
    {
      title: t('landing.features.categoryChannels'),
      borderColor: 'border-primary-400',
      iconColor: 'bg-primary-100 text-primary-600',
      features: [
        { icon: MessageCircle, title: t('landing.features.whatsappAI.title'), description: t('landing.features.whatsappAI.description') },
        { icon: MessageSquare, title: t('landing.features.webChat.title'), description: t('landing.features.webChat.description') },
        { icon: Mail, title: t('landing.features.smsCampaigns.title'), description: t('landing.features.smsCampaigns.description') },
      ],
    },
    {
      title: t('landing.features.categoryScheduling'),
      borderColor: 'border-secondary-400',
      iconColor: 'bg-secondary-100 text-secondary-600',
      features: [
        { icon: Calendar, title: t('landing.features.scheduling.title'), description: t('landing.features.scheduling.description') },
        { icon: Users, title: t('landing.features.patients.title'), description: t('landing.features.patients.description') },
        { icon: Building2, title: t('landing.features.multiLocation.title'), description: t('landing.features.multiLocation.description') },
      ],
    },
    {
      title: t('landing.features.categoryGrowth'),
      borderColor: 'border-success-400',
      iconColor: 'bg-success-100 text-success-600',
      features: [
        { icon: Megaphone, title: t('landing.features.campaigns.title'), description: t('landing.features.campaigns.description') },
        { icon: Heart, title: t('landing.features.careGap.title'), description: t('landing.features.careGap.description') },
        { icon: Clock, title: t('landing.features.reminders.title'), description: t('landing.features.reminders.description') },
      ],
    },
    {
      title: t('landing.features.categoryIntelligence'),
      borderColor: 'border-warning-400',
      iconColor: 'bg-warning-100 text-warning-600',
      features: [
        { icon: BarChart3, title: t('landing.features.analytics.title'), description: t('landing.features.analytics.description') },
        { icon: Workflow, title: t('landing.features.agentBuilder.title'), description: t('landing.features.agentBuilder.description') },
        { icon: Brain, title: t('landing.features.triageRouting.title'), description: t('landing.features.triageRouting.description') },
      ],
    },
  ]

  const steps = [
    {
      step: '01',
      icon: Building2,
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
      icon: Globe,
      title: t('landing.howItWorks.step3.title'),
      description: t('landing.howItWorks.step3.description'),
    },
    {
      step: '04',
      icon: Zap,
      title: t('landing.howItWorks.step4.title'),
      description: t('landing.howItWorks.step4.description'),
    },
  ]

  const benefits = [
    t('landing.benefits.list.workload'),
    t('landing.benefits.list.satisfaction'),
    t('landing.benefits.list.slots'),
    t('landing.benefits.list.channels'),
    t('landing.benefits.list.revenue'),
    t('landing.benefits.list.compliance'),
  ]

  const securityFeatures = [
    t('landing.benefits.security.encryption'),
    t('landing.benefits.security.pdpl'),
    t('landing.benefits.security.pii'),
    t('landing.benefits.security.audit'),
  ]

  // --- GSAP Animations ---
  const { contextSafe } = useGSAP(() => {
    const mm = gsap.matchMedia()

    mm.add(
      {
        isDesktop: '(min-width: 768px)',
        isMobile: '(max-width: 767px)',
        prefersMotion: '(prefers-reduced-motion: no-preference)',
        reducedMotion: '(prefers-reduced-motion: reduce)',
      },
      (context) => {
        const { prefersMotion, isDesktop } = context.conditions!

        if (!prefersMotion) {
          // Show everything immediately for reduced-motion users
          gsap.set('[data-hero], [data-feature], [data-step], [data-demo], [data-benefits], [data-cta], [data-footer]', {
            autoAlpha: 1,
            y: 0,
          })
          return
        }

        // ── Hero entrance timeline (plays immediately) ──
        const heroTl = gsap.timeline({
          defaults: { duration: 0.6, ease: 'power2.out' },
        })

        heroTl
          .from('[data-hero="badge"]', {
            autoAlpha: 0,
            y: 20,
            scale: 0.95,
            duration: 0.5,
          })
          .from('[data-hero="title"]', {
            autoAlpha: 0,
            y: 30,
          }, '<0.15')
          .from('[data-hero="subtitle"]', {
            autoAlpha: 0,
            y: 20,
          }, '<0.2')
          .from('[data-hero="channel"]', {
            autoAlpha: 0,
            y: 15,
            stagger: 0.08,
          }, '<0.15')
          .from('[data-hero="cta"] > *', {
            autoAlpha: 0,
            y: 15,
            stagger: 0.1,
          }, '<0.15')

        // Stats cards — scroll-triggered (below fold on mobile)
        gsap.from('[data-hero="stat"]', {
          scrollTrigger: {
            trigger: '[data-hero="stats"]',
            start: 'top 85%',
            toggleActions: 'play none none none',
          },
          autoAlpha: 0,
          y: 30,
          stagger: 0.1,
          duration: 0.5,
        })

        // ── Features — category headers + batch cards ──
        gsap.utils.toArray<HTMLElement>('[data-feature="category-header"]').forEach((header) => {
          gsap.from(header, {
            scrollTrigger: {
              trigger: header,
              start: 'top 85%',
              toggleActions: 'play none none none',
            },
            autoAlpha: 0,
            y: 20,
            duration: 0.5,
          })
        })

        ScrollTrigger.batch('[data-feature="card"]', {
          onEnter: (batch) => {
            gsap.from(batch, {
              autoAlpha: 0,
              y: 40,
              stagger: 0.08,
              duration: 0.5,
              ease: 'power2.out',
              overwrite: true,
            })
          },
          start: 'top 85%',
          once: true,
        })

        // ── How It Works — sequential step reveal ──
        const stepsTl = gsap.timeline({
          scrollTrigger: {
            trigger: '[data-section="how-it-works"]',
            start: 'top 70%',
            toggleActions: 'play none none none',
          },
          defaults: { duration: 0.5, ease: 'power2.out' },
        })

        if (isDesktop) {
          stepsTl.from('[data-step="line"]', {
            scaleX: 0,
            transformOrigin: document.dir === 'rtl' ? 'right center' : 'left center',
            stagger: 0.15,
            duration: 0.4,
          })
        }

        stepsTl.from('[data-step="item"]', {
          autoAlpha: 0,
          y: 30,
          stagger: 0.15,
        }, isDesktop ? '<0.1' : 0)

        // ── Demo Chat — gentle reveal ──
        const demoTl = gsap.timeline({
          scrollTrigger: {
            trigger: '#demo',
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
          defaults: { duration: 0.5, ease: 'power2.out' },
        })

        demoTl
          .from('[data-demo="badge"]', { autoAlpha: 0, y: 15, scale: 0.95 })
          .from('[data-demo="header"]', { autoAlpha: 0, y: 20 }, '<0.1')
          .from('[data-demo="chat"]', {
            autoAlpha: 0,
            y: 30,
            scale: 0.98,
            duration: 0.7,
            ease: 'power3.out',
          }, '<0.2')
          .from('[data-demo="feature"]', {
            autoAlpha: 0,
            y: 15,
            stagger: 0.08,
          }, '<0.3')

        // ── Benefits — two-column stagger ──
        const benefitsTl = gsap.timeline({
          scrollTrigger: {
            trigger: '[data-benefits="content"]',
            start: 'top 75%',
            toggleActions: 'play none none none',
          },
          defaults: { duration: 0.5, ease: 'power2.out' },
        })

        benefitsTl
          .from('[data-benefits="content"]', { autoAlpha: 0, y: 25 })
          .from('[data-benefits="item"]', {
            autoAlpha: 0,
            y: 15,
            stagger: 0.06,
          }, '<0.15')
          .from('[data-benefits="security"]', {
            autoAlpha: 0,
            y: 30,
            scale: 0.98,
            duration: 0.6,
          }, '<0.1')

        // ── CTA — punchy entrance ──
        const ctaTl = gsap.timeline({
          scrollTrigger: {
            trigger: '[data-cta="icon"]',
            start: 'top 80%',
            toggleActions: 'play none none none',
          },
          defaults: { duration: 0.5, ease: 'power2.out' },
        })

        ctaTl
          .from('[data-cta="icon"]', {
            autoAlpha: 0,
            scale: 0.5,
            duration: 0.4,
            ease: 'back.out(1.7)',
          })
          .from('[data-cta="heading"]', { autoAlpha: 0, y: 20 }, '<0.1')
          .from('[data-cta="subtitle"]', { autoAlpha: 0, y: 15 }, '<0.1')
          .from('[data-cta="button"]', {
            autoAlpha: 0,
            y: 15,
            scale: 0.95,
          }, '<0.15')

        // ── Footer — minimal fade ──
        gsap.from('[data-footer="content"]', {
          scrollTrigger: {
            trigger: 'footer',
            start: 'top 90%',
            toggleActions: 'play none none none',
          },
          autoAlpha: 0,
          y: 20,
          duration: 0.6,
        })
      }
    )
  }, { scope: containerRef })

  // Smooth scroll for anchor links
  const handleAnchorClick = contextSafe((e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute('href')
    if (href?.startsWith('#')) {
      e.preventDefault()
      gsap.to(window, {
        duration: 0.8,
        scrollTo: { y: href, offsetY: 80 },
        ease: 'power2.inOut',
      })
    }
  })

  return (
    <div ref={containerRef} className="min-h-screen bg-white overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 start-0 end-0 glass z-50 border-b border-healthcare-border/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-gradient rounded-xl flex items-center justify-center shadow-btn">
                <span className="text-white font-bold text-lg">✚</span>
              </div>
              <div>
                <span className="text-lg font-heading font-bold text-healthcare-text">{t('landing.brand')}</span>
                <span className="hidden sm:inline text-xs text-healthcare-muted ms-2 font-medium">HEALTH AI</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="#pricing"
                onClick={handleAnchorClick}
                className="hidden sm:inline text-healthcare-muted hover:text-healthcare-text font-medium text-sm transition-colors"
              >
                {t('landing.footer.pricing')}
              </a>
              <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 text-healthcare-muted hover:text-healthcare-text font-medium text-sm transition-colors"
                title="Toggle Language"
              >
                <Globe className="w-4 h-4" />
                <span>{i18n.language === 'ar' ? 'EN' : 'AR'}</span>
              </button>
              <Link
                to="/login"
                className="text-healthcare-muted hover:text-healthcare-text font-medium text-sm transition-colors"
              >
                {t('common.signIn')}
              </Link>
              <Link
                to="/register"
                className="btn-primary btn-sm"
              >
                {t('common.getStarted')}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 bg-hero-gradient bg-mesh relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div data-hero="badge" className="inline-flex items-center gap-2 bg-white/80 backdrop-blur text-primary-700 px-5 py-2.5 rounded-full text-sm font-semibold mb-8 shadow-card border border-primary-200/50">
              <Sparkles className="w-4 h-4" />
              {t('landing.badge')}
            </div>
            <h1 data-hero="title" className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold text-healthcare-text leading-tight mb-6">
              {t('landing.hero.title')}{' '}
              <span className="text-gradient">{t('landing.hero.highlight')}</span>
            </h1>
            <p data-hero="subtitle" className="text-lg sm:text-xl text-healthcare-muted mb-8 max-w-2xl mx-auto leading-relaxed">
              {t('landing.hero.subtitle')}
            </p>
            <div data-hero="channels" className="flex flex-wrap justify-center gap-3 mb-10">
              {channels.map((channel) => (
                <div key={channel.label} data-hero="channel" className="inline-flex items-center gap-2 bg-white/80 backdrop-blur text-primary-700 px-4 py-2 rounded-full text-sm font-medium border border-primary-200/50 shadow-sm">
                  <channel.icon className="w-4 h-4" />
                  {channel.label}
                </div>
              ))}
            </div>
            <div data-hero="cta" className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/register"
                className="btn-primary btn-lg shadow-lg hover:shadow-xl transition-shadow"
              >
                {t('landing.cta.trial')}
                <ArrowRight className="w-5 h-5 rtl:rotate-180" />
              </Link>
              <a
                href="#features"
                onClick={handleAnchorClick}
                className="btn-outline btn-lg"
              >
                {t('landing.cta.howItWorks')}
              </a>
            </div>
          </div>

          {/* Stats */}
          <div data-hero="stats" className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} data-hero="stat" className="card-neu text-center p-6">
                <span className="text-2xl mb-2 block">{stat.icon}</span>
                <div className="text-3xl sm:text-4xl font-heading font-bold text-primary-500 mb-1">{stat.value}</div>
                <div className="text-sm text-healthcare-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-heading font-bold text-healthcare-text mb-4">
              {t('landing.features.title')}
            </h2>
            <p className="text-lg text-healthcare-muted max-w-2xl mx-auto">
              {t('landing.features.subtitle')}
            </p>
          </div>

          <div className="space-y-12">
            {featureCategories.map((category) => (
              <div key={category.title}>
                <div data-feature="category-header" className={`border-s-4 ${category.borderColor} ps-4 mb-6`}>
                  <h3 className="text-lg font-heading font-semibold text-healthcare-text">{category.title}</h3>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {category.features.map((feature) => (
                    <div
                      key={feature.title}
                      data-feature="card"
                      className="card-interactive p-8 group"
                    >
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${category.iconColor} transition-transform group-hover:scale-110`}>
                        <feature.icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-heading font-semibold text-healthcare-text mb-3">{feature.title}</h3>
                      <p className="text-healthcare-muted leading-relaxed">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section data-section="how-it-works" className="py-20 bg-healthcare-bg px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-heading font-bold text-healthcare-text mb-4">
              {t('landing.howItWorks.title')}
            </h2>
            <p className="text-lg text-healthcare-muted max-w-2xl mx-auto">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((item, index) => (
              <div key={item.step} data-step="item" className="text-center relative">
                {index < steps.length - 1 && (
                  <div data-step="line" className="hidden lg:block absolute top-8 start-[55%] w-[90%] h-0.5 bg-primary-200 -z-10" />
                )}
                <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-gradient rounded-2xl mb-6 shadow-btn relative">
                  <item.icon className="w-7 h-7 text-white" />
                  <span className="absolute -top-2 -end-2 w-8 h-8 bg-healthcare-text text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-xl font-heading font-semibold text-healthcare-text mb-3">{item.title}</h3>
                <p className="text-healthcare-muted leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="py-20 bg-white px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div data-demo="badge" className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 px-5 py-2.5 rounded-full text-sm font-semibold mb-6 border border-primary-200/50">
              <Bot className="w-4 h-4" />
              {t('landing.demo.badge')}
            </div>
            <div data-demo="header">
              <h2 className="text-3xl sm:text-4xl font-heading font-bold text-healthcare-text mb-4">
                {t('landing.demo.title')}
              </h2>
              <p className="text-lg text-healthcare-muted max-w-2xl mx-auto">
                {t('landing.demo.subtitle')}
              </p>
            </div>
          </div>

          <div data-demo="chat" className="max-w-2xl mx-auto">
            <DemoChatEmbed />
          </div>

          <div className="mt-12 flex flex-wrap justify-center gap-4">
            {[t('landing.demo.features.dialects'), t('landing.demo.features.booking'), t('landing.demo.features.availability')].map((text) => (
              <div key={text} data-demo="feature" className="card flex items-center gap-2 px-5 py-2.5">
                <CheckCircle className="w-5 h-5 text-success-500" />
                <span className="text-sm font-medium text-healthcare-text">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-teal-gradient px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 start-20 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-20 end-20 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div data-benefits="content">
              <h2 className="text-3xl sm:text-4xl font-heading font-bold text-white mb-6">
                {t('landing.benefits.title')}
              </h2>
              <p className="text-primary-100 text-lg mb-8 leading-relaxed">
                {t('landing.benefits.subtitle')}
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} data-benefits="item" className="flex items-center gap-3 text-white">
                    <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div data-benefits="security" className="bg-white rounded-2xl p-8 shadow-xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-primary-50 rounded-2xl flex items-center justify-center">
                  <Shield className="w-7 h-7 text-primary-600" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-healthcare-text text-lg">{t('landing.benefits.security.title')}</h3>
                  <p className="text-healthcare-muted text-sm">{t('landing.benefits.security.subtitle')}</p>
                </div>
              </div>
              <ul className="space-y-3">
                {securityFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-healthcare-text">
                    <CheckCircle className="w-5 h-5 text-success-500 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <PricingSection id="pricing" onSelectPlan={handlePricingCta} variant="landing" />

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-hero-gradient">
        <div className="max-w-4xl mx-auto text-center">
          <div data-cta="icon" className="inline-flex mb-6">
            <Heart className="w-8 h-8 text-danger-400" />
          </div>
          <h2 data-cta="heading" className="text-3xl sm:text-4xl font-heading font-bold text-healthcare-text mb-6">
            {t('landing.finalCta.title')}
          </h2>
          <p data-cta="subtitle" className="text-lg text-healthcare-muted mb-10 max-w-2xl mx-auto">
            {t('landing.finalCta.subtitle')}
          </p>
          <Link
            data-cta="button"
            to="/register"
            className="btn-primary btn-lg shadow-lg hover:shadow-xl transition-shadow"
          >
            {t('landing.cta.getStartedFree')}
            <ArrowRight className="w-5 h-5 rtl:rotate-180" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-healthcare-text text-white/70 py-12 px-4 sm:px-6 lg:px-8">
        <div data-footer="content" className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-lg">✚</span>
                </div>
                <div>
                  <span className="text-lg font-heading font-bold text-white">{t('landing.brand')}</span>
                  <span className="text-xs text-white/50 ms-2">HEALTH AI</span>
                </div>
              </div>
              <p className="text-sm text-white/50 leading-relaxed">
                {t('landing.footer.tagline')}
              </p>
            </div>

            {/* Product links */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">{t('landing.footer.product')}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#features" onClick={handleAnchorClick} className="hover:text-white transition-colors">{t('common.features')}</a></li>
                <li><a href="#pricing" onClick={handleAnchorClick} className="hover:text-white transition-colors">{t('landing.footer.pricing')}</a></li>
              </ul>
            </div>

            {/* Access links */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">{t('landing.footer.access')}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/login" className="hover:text-white transition-colors">{t('common.signIn')}</Link></li>
                <li><Link to="/register" className="hover:text-white transition-colors">{t('common.getStarted')}</Link></li>
                <li><Link to="/patient" className="hover:text-white transition-colors">{t('landing.footer.patientPortal')}</Link></li>
              </ul>
            </div>

            {/* Legal links */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-4">{t('landing.footer.legal')}</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/privacy" className="hover:text-white transition-colors">{t('landing.footer.privacy')}</Link></li>
                <li><Link to="/terms" className="hover:text-white transition-colors">{t('landing.footer.terms')}</Link></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 mt-10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-white/40">
              &copy; {new Date().getFullYear()} {t('landing.footer.copyright')}
            </p>
            <div className="flex items-center gap-6 text-sm text-white/40">
              <Link to="/privacy" className="hover:text-white/60 transition-colors">{t('landing.footer.privacy')}</Link>
              <Link to="/terms" className="hover:text-white/60 transition-colors">{t('landing.footer.terms')}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
