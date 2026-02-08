import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { Building, Globe, Bell, Webhook, Languages } from 'lucide-react'

export default function Settings() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-gray-500">{t('settings.subtitle')}</p>
      </div>

      <div className="grid gap-6">
        {/* Language Settings */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Languages className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.language.title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.language.select')}
              </label>
              <select
                value={i18n.language}
                onChange={(e) => changeLanguage(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="en">{t('settings.language.english')}</option>
                <option value="ar">{t('settings.language.arabic')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Organization Settings */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Building className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.organization.title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.organization.name')}
              </label>
              <input
                type="text"
                defaultValue={user?.org?.name || ''}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.organization.timezone')}
              </label>
              <select className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500">
                <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
                <option value="Africa/Cairo">Africa/Cairo (GMT+2)</option>
              </select>
            </div>
          </div>
        </div>

        {/* n8n Webhook Settings */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Webhook className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.n8n.title')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.n8n.apiKey')}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  type="password"
                  defaultValue="••••••••••••••••"
                  readOnly
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm bg-gray-50"
                />
                <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {t('settings.n8n.regenerate')}
                </button>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {t('settings.n8n.apiKeyHint')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.n8n.endpoints')}
              </label>
              <div className="mt-2 space-y-2 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg font-mono text-xs">
                  POST /api/webhooks/availability
                </div>
                <div className="p-3 bg-gray-50 rounded-lg font-mono text-xs">
                  POST /api/webhooks/book
                </div>
                <div className="p-3 bg-gray-50 rounded-lg font-mono text-xs">
                  POST /api/webhooks/patient
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* WhatsApp Settings */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.whatsapp.title')}</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                {t('settings.whatsapp.notice')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                {t('settings.whatsapp.phoneNumber')}
              </label>
              <input
                type="text"
                placeholder="+966 XX XXX XXXX"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-5 w-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.notifications.title')}</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{t('settings.notifications.newBooking')}</p>
                <p className="text-sm text-gray-500">{t('settings.notifications.newBookingDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{t('settings.notifications.negativeFeedback')}</p>
                <p className="text-sm text-gray-500">{t('settings.notifications.negativeFeedbackDesc')}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
