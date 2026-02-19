import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, ArrowRight, HeartPulse } from 'lucide-react'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-healthcare-bg flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center animate-fade-in">
        {/* Illustration */}
        <div className="relative mb-8">
          <div className="w-32 h-32 mx-auto bg-primary-50 rounded-full flex items-center justify-center">
            <HeartPulse className="w-16 h-16 text-primary-300" />
          </div>
          <div className="absolute top-0 end-1/4 w-8 h-8 bg-danger-100 rounded-full flex items-center justify-center animate-bounce">
            <span className="text-danger-500 font-bold text-xs">!</span>
          </div>
        </div>

        {/* Error code */}
        <h1 className="text-8xl font-heading font-bold text-primary-200 mb-2">404</h1>

        {/* Message */}
        <h2 className="text-2xl font-heading font-bold text-healthcare-text mb-3">
          {t('notFound.title')}
        </h2>
        <p className="text-healthcare-muted mb-8 leading-relaxed">
          {t('notFound.description')}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            {t('notFound.goHome')}
          </Link>
          <Link
            to="/dashboard"
            className="btn-outline inline-flex items-center justify-center gap-2"
          >
            {t('notFound.goDashboard')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </Link>
        </div>

        {/* Helpful links */}
        <div className="mt-12 pt-8 border-t border-healthcare-border/30">
          <p className="text-sm text-healthcare-muted mb-4">{t('notFound.helpfulLinks')}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/patient" className="text-sm text-primary-500 hover:text-primary-600 transition-colors font-medium">
              {t('notFound.links.patientPortal')}
            </Link>
            <Link to="/pricing" className="text-sm text-primary-500 hover:text-primary-600 transition-colors font-medium">
              {t('notFound.links.pricing')}
            </Link>
            <Link to="/login" className="text-sm text-primary-500 hover:text-primary-600 transition-colors font-medium">
              {t('common.signIn')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
