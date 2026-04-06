import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { Settings } from 'lucide-react'
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

  const { patients, stats, isLoading } = usePatientEngagementQueue(orgId)

  return (
    <div className="space-y-6 animate-fade-in">
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
