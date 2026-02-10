import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Building2,
  MapPin,
  CheckCircle,
  AlertTriangle,
  XCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Globe,
  Clock,
  Bot,
} from 'lucide-react'
import { cn } from '../lib/utils'

interface Facility {
  facilityId: string
  name: string
  city: string
  region?: string
  activeCalls: number
  resolutionRate: number
  status: 'healthy' | 'degraded' | 'down'
  aiEnabled: boolean
  greeting?: string
  operatingHours?: string
  totalCallsToday: number
  avgWaitTime: number
  languages?: string[]
  activeConversations?: number
  todayAppointments?: number
}

const statusConfig: Record<string, { ar: string; en: string; color: string; bg: string; icon: React.ElementType }> = {
  healthy: { ar: 'يعمل', en: 'Healthy', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle },
  degraded: { ar: 'متأخر', en: 'Degraded', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: AlertTriangle },
  down: { ar: 'متوقف', en: 'Down', color: 'text-red-700', bg: 'bg-red-100', icon: XCircle },
}

export default function FleetDashboard() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()

  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<string>('')
  const [bulkValue, setBulkValue] = useState('')
  const [showBulkModal, setShowBulkModal] = useState(false)

  // Backend: GET /api/fleet/overview returns { facilities: [...] }
  const { data: facilities, isLoading } = useQuery<Facility[]>({
    queryKey: ['fleet', 'facilities'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/fleet/overview')
        const rawFacilities = res.data?.facilities || []
        return rawFacilities.map((f: any) => ({
          facilityId: f.facilityId,
          name: f.name,
          city: f.city || '',
          region: f.region,
          activeCalls: f.todayCalls || 0,
          resolutionRate: 0,
          status: f.aiEnabled === false ? 'down' : 'healthy',
          aiEnabled: f.aiEnabled ?? true,
          totalCallsToday: f.todayCalls || 0,
          avgWaitTime: 0,
          languages: f.languages,
          activeConversations: f.activeConversations || 0,
          todayAppointments: f.todayAppointments || 0,
        }))
      } catch {
        return []
      }
    },
    placeholderData: [],
  })

  // Backend: POST /api/fleet/bulk-update { facilityIds, config }
  const bulkMutation = useMutation({
    mutationFn: (data: { action: string; facilityIds: string[]; value: string }) => {
      // Map frontend actions to backend config format
      const config: Record<string, any> = {}
      if (data.action === 'update_greeting') {
        config.greetingAr = data.value
        config.greetingEn = data.value
      } else if (data.action === 'toggle_ai') {
        config.aiEnabled = data.value === 'enable'
      } else if (data.action === 'change_hours') {
        // Simple format: pass as afterHoursMsg for now
        config.afterHoursMsg = data.value
      }
      return api.post('/api/fleet/bulk-update', {
        facilityIds: data.facilityIds,
        config,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleet'] })
      setShowBulkModal(false)
      setSelectedIds(new Set())
      setBulkAction('')
      setBulkValue('')
    },
  })

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const toggleAll = () => {
    if (selectedIds.size === (facilities || []).length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set((facilities || []).map(f => f.facilityId)))
    }
  }

  const handleBulk = (action: string) => {
    setBulkAction(action)
    setShowBulkModal(true)
  }

  const executeBulk = () => {
    bulkMutation.mutate({
      action: bulkAction,
      facilityIds: Array.from(selectedIds),
      value: bulkValue,
    })
  }

  if (selectedFacility) {
    const status = statusConfig[selectedFacility.status] || statusConfig.healthy
    const StatusIcon = status.icon

    return (
      <div className="space-y-6 animate-fade-in">
        <button
          onClick={() => setSelectedFacility(null)}
          className="flex items-center gap-2 text-primary-600 hover:underline"
        >
          {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {isAr ? 'العودة للمنشآت' : 'Back to Fleet'}
        </button>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="page-title">{selectedFacility.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin className="h-4 w-4" />
                {selectedFacility.city}
              </span>
              <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', status.bg, status.color)}>
                <StatusIcon className="h-3 w-3" />
                {isAr ? status.ar : status.en}
              </span>
            </div>
          </div>
        </div>

        {/* Facility Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs page-subtitle">{isAr ? 'مكالمات نشطة' : 'Active Calls'}</p>
            <p className="page-title">{selectedFacility.activeCalls}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs page-subtitle">{isAr ? 'المواعيد اليوم' : "Today's Appointments"}</p>
            <p className="page-title">{selectedFacility.todayAppointments || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs page-subtitle">{isAr ? 'مكالمات اليوم' : "Today's Calls"}</p>
            <p className="page-title">{selectedFacility.totalCallsToday}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs page-subtitle">{isAr ? 'محادثات نشطة' : 'Active Conversations'}</p>
            <p className="page-title">{selectedFacility.activeConversations || 0}</p>
          </div>
        </div>

        {/* Config */}
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'إعدادات المنشأة' : 'Facility Configuration'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-4 w-4 text-primary-500" />
                <span className="text-sm font-medium text-gray-700">{isAr ? 'الذكاء الاصطناعي' : 'AI Agent'}</span>
              </div>
              <p className={cn('text-sm font-medium', selectedFacility.aiEnabled ? 'text-green-600' : 'text-red-600')}>
                {selectedFacility.aiEnabled ? (isAr ? 'مفعّل' : 'Enabled') : (isAr ? 'معطّل' : 'Disabled')}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="h-4 w-4 text-primary-500" />
                <span className="text-sm font-medium text-gray-700">{isAr ? 'اللغات' : 'Languages'}</span>
              </div>
              <p className="text-sm text-gray-600">{(selectedFacility.languages || ['ar', 'en']).join(', ')}</p>
            </div>
            {selectedFacility.greeting && (
              <div className="p-4 bg-gray-50 rounded-lg md:col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-primary-500" />
                  <span className="text-sm font-medium text-gray-700">{isAr ? 'رسالة الترحيب' : 'Greeting'}</span>
                </div>
                <p className="text-sm text-gray-600">{selectedFacility.greeting}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="page-title">
          {isAr ? 'إدارة المنشآت' : 'Fleet Dashboard'}
        </h1>
        <p className="text-healthcare-muted">
          {isAr ? 'نظرة شاملة على جميع المنشآت' : 'Overview of all facilities'}
        </p>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-primary-700 font-medium">
            {selectedIds.size} {isAr ? 'منشأة محددة' : 'facilities selected'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulk('update_greeting')}
              className="px-3 py-1.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-sm hover:bg-primary-100"
            >
              {isAr ? 'تحديث الترحيب' : 'Update Greeting'}
            </button>
            <button
              onClick={() => handleBulk('toggle_ai')}
              className="px-3 py-1.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-sm hover:bg-primary-100"
            >
              {isAr ? 'تبديل الذكاء الاصطناعي' : 'Toggle AI'}
            </button>
            <button
              onClick={() => handleBulk('change_hours')}
              className="px-3 py-1.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-sm hover:bg-primary-100"
            >
              {isAr ? 'تغيير الساعات' : 'Change Hours'}
            </button>
          </div>
        </div>
      )}

      {/* Facility Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner"></div>
        </div>
      ) : (facilities || []).length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-white rounded-xl border">
          <Building2 className="h-12 w-12 mb-3 text-gray-300" />
          <p>{isAr ? 'لا توجد منشآت' : 'No facilities found'}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={selectedIds.size === (facilities || []).length && (facilities || []).length > 0}
              onChange={toggleAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm page-subtitle">{isAr ? 'تحديد الكل' : 'Select All'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(facilities || []).map((facility) => {
              const status = statusConfig[facility.status] || statusConfig.healthy
              const StatusIcon = status.icon
              const isSelected = selectedIds.has(facility.facilityId)

              return (
                <div
                  key={facility.facilityId}
                  className={cn(
                    'table-container overflow-hidden transition-all',
                    isSelected && 'ring-2 ring-primary-500'
                  )}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(facility.facilityId)}
                          className="mt-1 rounded border-gray-300"
                        />
                        <div>
                          <h3 className="font-semibold text-healthcare-text">{facility.name}</h3>
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {facility.city}
                          </p>
                        </div>
                      </div>
                      <span className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', status.bg, status.color)}>
                        <StatusIcon className="h-3 w-3" />
                        {isAr ? status.ar : status.en}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-healthcare-text">{facility.activeCalls}</p>
                        <p className="text-xs page-subtitle">{isAr ? 'مكالمات اليوم' : 'Today Calls'}</p>
                      </div>
                      <div className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-lg font-bold text-green-600">{facility.todayAppointments || 0}</p>
                        <p className="text-xs page-subtitle">{isAr ? 'مواعيد اليوم' : 'Appointments'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedFacility(facility)}
                      className="w-full py-2 text-sm text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                    >
                      {isAr ? 'عرض التفاصيل' : 'View Details'}
                    </button>
                  </div>

                  {/* Status indicator bar */}
                  <div className={cn(
                    'h-1',
                    facility.status === 'healthy' ? 'bg-green-500' :
                    facility.status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500'
                  )} />
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Bulk Action Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-heading font-semibold text-healthcare-text">
                {bulkAction === 'update_greeting' ? (isAr ? 'تحديث رسالة الترحيب' : 'Update Greeting') :
                 bulkAction === 'toggle_ai' ? (isAr ? 'تبديل الذكاء الاصطناعي' : 'Toggle AI') :
                 (isAr ? 'تغيير ساعات العمل' : 'Change Hours')}
              </h2>
              <button onClick={() => setShowBulkModal(false)} className="p-1 hover:bg-primary-50 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {isAr ? `سيتم التطبيق على ${selectedIds.size} منشأة` : `Will apply to ${selectedIds.size} facilities`}
            </p>
            {bulkAction === 'toggle_ai' ? (
              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => setBulkValue('enable')}
                  className={cn('flex-1 py-2 rounded-lg border', bulkValue === 'enable' ? 'bg-green-50 border-green-300 text-green-700' : 'hover:bg-primary-50/30')}
                >
                  {isAr ? 'تفعيل' : 'Enable'}
                </button>
                <button
                  onClick={() => setBulkValue('disable')}
                  className={cn('flex-1 py-2 rounded-lg border', bulkValue === 'disable' ? 'bg-red-50 border-red-300 text-red-700' : 'hover:bg-primary-50/30')}
                >
                  {isAr ? 'تعطيل' : 'Disable'}
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                placeholder={bulkAction === 'update_greeting'
                  ? (isAr ? 'رسالة الترحيب الجديدة...' : 'New greeting message...')
                  : (isAr ? 'مثال: 08:00-17:00' : 'e.g., 08:00-17:00')}
                className="input focus:ring-primary-400/20 focus:border-primary-500 mb-4"
              />
            )}
            <div className="flex gap-3">
              <button
                onClick={executeBulk}
                disabled={bulkMutation.isPending || !bulkValue}
                className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {bulkMutation.isPending ? (isAr ? 'جاري التطبيق...' : 'Applying...') : (isAr ? 'تطبيق' : 'Apply')}
              </button>
              <button onClick={() => setShowBulkModal(false)} className="px-4 py-2 border rounded-lg hover:bg-healthcare-bg">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
