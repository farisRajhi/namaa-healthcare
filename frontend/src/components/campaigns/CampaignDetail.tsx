import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { cn } from '../../lib/utils'
import { ChevronLeft, ChevronRight, Users, Send, MessageCircle, Target, Play, Pause, RotateCcw } from 'lucide-react'
import { statusConfig, typeLabels } from './CampaignList'
import type { Campaign } from './CampaignList'
import { useToast } from '../ui/Toast'
// Recharts removed for simplicity

interface CampaignDetailProps {
  campaign: Campaign
  onBack: () => void
}

export default function CampaignDetail({ campaign, onBack }: CampaignDetailProps) {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { addToast } = useToast()
  const queryClient = useQueryClient()

  // Campaign actions
  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/outbound/campaigns/${campaign.campaignId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaign-results', campaign.campaignId] })
      addToast({ type: 'success', title: isAr ? 'تم تفعيل الحملة' : 'Campaign started' })
    },
    onError: () => addToast({ type: 'error', title: isAr ? 'فشل تفعيل الحملة' : 'Failed to start campaign' }),
  })

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/api/outbound/campaigns/${campaign.campaignId}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      addToast({ type: 'success', title: isAr ? 'تم إيقاف الحملة' : 'Campaign paused' })
    },
    onError: () => addToast({ type: 'error', title: isAr ? 'فشل إيقاف الحملة' : 'Failed to pause campaign' }),
  })

  // Fetch full campaign details
  const { data: detail } = useQuery({
    queryKey: ['campaigns', campaign.campaignId],
    queryFn: async () => {
      const res = await api.get(`/api/outbound/campaigns/${campaign.campaignId}`)
      return res.data
    },
  })

  // Fetch campaign results
  const { data: results } = useQuery({
    queryKey: ['campaign-results', campaign.campaignId],
    queryFn: async () => {
      const res = await api.get(`/api/outbound/campaigns/${campaign.campaignId}/results`)
      return res.data
    },
  })

  // Fetch targets
  const { data: targetsData } = useQuery({
    queryKey: ['campaign-targets', campaign.campaignId],
    queryFn: async () => {
      const res = await api.get(`/api/outbound/campaigns/${campaign.campaignId}/targets`)
      return res.data
    },
  })

  const status = statusConfig[campaign.status] || statusConfig.draft
  const type = typeLabels[campaign.type] || { ar: campaign.type, en: campaign.type }

  const totalTargets = results?.totalTargets || campaign.targetsCount || 0
  const sent = campaign.sentCount || 0
  const booked = results?.byStatus?.booked || 0
  const reached = results?.byStatus?.reached || 0
  const progress = totalTargets > 0 ? Math.round((sent / totalTargets) * 100) : 0

  const targets = targetsData?.data || detail?.targets || []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-primary-600 hover:underline text-sm"
      >
        {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        {isAr ? 'العودة للحملات' : 'Back to Campaigns'}
      </button>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title">
            {isAr ? (campaign.nameAr || campaign.name) : campaign.name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={cn('px-2.5 py-1 rounded-full text-xs font-medium', status.color)}>
              {isAr ? status.ar : status.en}
            </span>
            <span className="text-sm text-gray-500">{isAr ? type.ar : type.en}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'draft' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {isAr ? 'تفعيل الحملة' : 'Start Campaign'}
            </button>
          )}
          {campaign.status === 'active' && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Pause className="h-4 w-4" />
              {isAr ? 'إيقاف مؤقت' : 'Pause'}
            </button>
          )}
          {campaign.status === 'paused' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {isAr ? 'استئناف' : 'Resume'}
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <Target className="h-5 w-5 text-gray-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-gray-900">{totalTargets}</p>
          <p className="text-xs text-gray-500">{isAr ? 'المستهدفين' : 'Targets'}</p>
        </div>
        <div className="card p-4 text-center">
          <Send className="h-5 w-5 text-blue-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-blue-600">{sent}</p>
          <p className="text-xs text-gray-500">{isAr ? 'تم الإرسال' : 'Sent'}</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full">
            <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${totalTargets > 0 ? Math.round((sent / totalTargets) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="card p-4 text-center">
          <MessageCircle className="h-5 w-5 text-green-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-green-600">{reached}</p>
          <p className="text-xs text-gray-500">{isAr ? 'تم الوصول' : 'Reached'}</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full">
            <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${sent > 0 ? Math.round((reached / sent) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="card p-4 text-center">
          <Users className="h-5 w-5 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-purple-600">{booked}</p>
          <p className="text-xs text-gray-500">{isAr ? 'حجزوا' : 'Booked'}</p>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full">
            <div className="h-full bg-purple-400 rounded-full transition-all duration-500" style={{ width: `${reached > 0 ? Math.round((booked / reached) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {isAr ? 'التقدم' : 'Progress'}
          </span>
          <span className="text-sm font-bold text-primary-700">{progress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Conversion Funnel */}
      {totalTargets > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-heading font-semibold text-healthcare-text mb-5">
            {isAr ? 'قمع التحويل' : 'Conversion Funnel'}
          </h3>
          <div className="space-y-3">
            {[
              { label: isAr ? 'المستهدفين' : 'Targets', value: totalTargets, color: 'bg-gray-400' },
              { label: isAr ? 'تم الإرسال' : 'Sent', value: sent, color: 'bg-blue-500' },
              { label: isAr ? 'تم الوصول' : 'Reached', value: reached, color: 'bg-green-500' },
              { label: isAr ? 'حجزوا' : 'Booked', value: booked, color: 'bg-purple-500' },
            ].map((stage, idx, arr) => {
              const pct = totalTargets > 0 ? Math.round((stage.value / totalTargets) * 100) : 0
              const dropOff = idx > 0 && arr[idx - 1].value > 0
                ? Math.round(((arr[idx - 1].value - stage.value) / arr[idx - 1].value) * 100)
                : null
              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                    <div className="flex items-center gap-3">
                      {dropOff !== null && dropOff > 0 && (
                        <span className="text-xs text-red-400">-{dropOff}%</span>
                      )}
                      <span className="text-sm font-bold text-gray-900">{stage.value.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className={cn('h-full rounded-lg transition-all duration-700', stage.color)}
                      style={{ width: `${pct}%`, minWidth: stage.value > 0 ? '2%' : '0%' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Target List */}
      {targets.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h3 className="text-lg font-heading font-semibold text-healthcare-text">
              {isAr ? 'قائمة المستهدفين' : 'Target List'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'المريض' : 'Patient'}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'الحالة' : 'Status'}
                  </th>
                  <th className="px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase">
                    {isAr ? 'المحاولات' : 'Attempts'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {targets.map((target: any) => {
                  const tStatus = target.status || 'pending'
                  return (
                    <tr key={target.targetId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-healthcare-text">
                        {target.patient
                          ? `${target.patient.firstName || ''} ${target.patient.lastName || ''}`
                          : target.patientName || target.targetId?.substring(0, 8)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium capitalize',
                            tStatus === 'booked' ? 'bg-green-100 text-green-800' :
                            tStatus === 'reached' ? 'bg-blue-100 text-blue-800' :
                            tStatus === 'failed' || tStatus === 'dnc' ? 'bg-red-100 text-red-800' :
                            tStatus === 'no_answer' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-700',
                          )}
                        >
                          {tStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {target.attempts || 0}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
