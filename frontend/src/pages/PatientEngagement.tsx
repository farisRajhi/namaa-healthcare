import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Settings, Brain, ArrowRight, ArrowLeft } from 'lucide-react'
import { usePatientEngagementQueue } from '../hooks/usePatientEngagementQueue'
import EngagementStatsBar from '../components/engagement/EngagementStatsBar'
import PatientQueueList from '../components/engagement/PatientQueueList'
import SettingsDrawer from '../components/engagement/SettingsDrawer'

export default function PatientEngagement() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const [settingsOpen, setSettingsOpen] = useState(false)

  const navigate = useNavigate()
  const { patients, stats, isLoading } = usePatientEngagementQueue(orgId)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Patient Intelligence Banner */}
      <button
        onClick={() => navigate('/dashboard/patient-intelligence')}
        className="w-full flex items-center gap-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4 hover:shadow-md transition-all group"
      >
        <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <Brain className="h-5 w-5 text-purple-600" />
        </div>
        <div className={`flex-1 text-${isAr ? 'right' : 'left'}`}>
          <p className="font-semibold text-purple-900">
            {isAr ? 'حملات ذكية' : 'Smart Campaigns'}
          </p>
          <p className="text-sm text-purple-600">
            {isAr
              ? 'ارفع قاعدة بيانات المرضى ودع الذكاء الاصطناعي يقترح حملات تسويقية'
              : 'Upload your patient database and let AI suggest marketing campaigns'}
          </p>
        </div>
        {isAr ? (
          <ArrowLeft className="h-5 w-5 text-purple-400 group-hover:text-purple-600 transition-colors" />
        ) : (
          <ArrowRight className="h-5 w-5 text-purple-400 group-hover:text-purple-600 transition-colors" />
        )}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-healthcare-text">
            {isAr ? 'متابعة المرضى' : 'Patient Engagement'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAr
              ? 'المرضى الذين يحتاجون متابعتك، مرتبين حسب الأولوية'
              : 'Patients who need your attention, ranked by priority'}
          </p>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="btn-ghost btn-icon p-2.5 rounded-xl"
          title={isAr ? 'الإعدادات' : 'Settings'}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      {/* Stats */}
      <EngagementStatsBar stats={stats} isAr={isAr} />

      {/* Patient Queue */}
      <PatientQueueList patients={patients} isLoading={isLoading} isAr={isAr} />

      {/* Settings Drawer */}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} isAr={isAr} />
    </div>
  )
}
