import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import {
  Phone, PhoneForwarded, PhoneOff, Clock, Users,
  CheckCircle, ArrowUpRight, RefreshCw, Headphones,
} from 'lucide-react'
import { cn } from '../lib/utils'
import StatCard from '../components/ui/StatCard'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import StatusDot from '../components/ui/StatusDot'

interface ActiveCall {
  callId: string
  twilioCallSid?: string
  callerPhone: string
  duration: number
  intent: string
  status: string
  startedAt: string
  agentType: 'ai' | 'human'
}

interface CallCenterStats {
  totalToday: number; aiResolved: number; escalated: number
  avgWaitTime: number; activeNow: number; inQueue: number
}

const intentLabels: Record<string, { ar: string; en: string }> = {
  scheduling: { ar: 'حجز موعد', en: 'Scheduling' },
  prescription: { ar: 'وصفة طبية', en: 'Prescription' },
  faq: { ar: 'استفسار عام', en: 'General Inquiry' },
  billing: { ar: 'فوترة', en: 'Billing' },
  urgent: { ar: 'طارئ', en: 'Urgent' },
  physician_search: { ar: 'بحث عن طبيب', en: 'Physician Search' },
  unknown: { ar: 'غير محدد', en: 'Unknown' },
  greeting: { ar: 'ترحيب', en: 'Greeting' },
  identity: { ar: 'تحقق', en: 'Identity' },
}

const statusConfig: Record<string, { ar: string; en: string; variant: string }> = {
  active: { ar: 'نشط', en: 'Active', variant: 'success' },
  greeting: { ar: 'ترحيب', en: 'Greeting', variant: 'info' },
  identifying: { ar: 'تحقق', en: 'Identifying', variant: 'info' },
  routing: { ar: 'توجيه', en: 'Routing', variant: 'info' },
  in_progress: { ar: 'قيد التقدم', en: 'In Progress', variant: 'success' },
  on_hold: { ar: 'في الانتظار', en: 'On Hold', variant: 'warning' },
  transferring: { ar: 'يتم التحويل', en: 'Transferring', variant: 'info' },
  wrap_up: { ar: 'إنهاء', en: 'Wrapping Up', variant: 'neutral' },
  completed: { ar: 'مكتمل', en: 'Completed', variant: 'neutral' },
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function CallCenter() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Backend: POST /api/call-center/status returns { realtime, today }
  const { data: stats } = useQuery<CallCenterStats>({
    queryKey: ['call-center', 'stats'],
    queryFn: async () => {
      try {
        const res = await api.post('/api/call-center/status')
        const d = res.data
        return {
          totalToday: d.today?.totalCalls || 0,
          aiResolved: d.today?.completedCalls || 0,
          escalated: d.today?.handoffs || 0,
          avgWaitTime: d.today?.avgCallDurationSec || 0,
          activeNow: d.realtime?.activeCalls || 0,
          inQueue: Object.values(d.realtime?.byState || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0),
        }
      } catch {
        return { totalToday: 0, aiResolved: 0, escalated: 0, avgWaitTime: 0, activeNow: 0, inQueue: 0 }
      }
    },
    refetchInterval: autoRefresh ? 5000 : false,
    placeholderData: { totalToday: 0, aiResolved: 0, escalated: 0, avgWaitTime: 0, activeNow: 0, inQueue: 0 },
  })

  // Backend: GET /api/call-center/active-calls returns { data: [...], total }
  const { data: activeCalls, refetch: refetchCalls } = useQuery<ActiveCall[]>({
    queryKey: ['call-center', 'active-calls'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/call-center/active-calls')
        const calls = res.data?.data || []
        return calls.map((c: any) => ({
          callId: c.callId,
          twilioCallSid: c.twilioCallSid,
          callerPhone: c.callerPhone,
          duration: c.durationSec || 0,
          intent: c.intent || 'unknown',
          status: c.state || 'active',
          startedAt: c.startedAt,
          agentType: 'ai' as const,
        }))
      } catch {
        return []
      }
    },
    refetchInterval: autoRefresh ? 5000 : false,
    placeholderData: [],
  })

  // Backend: GET /api/call-center/queue returns { data: [...], pagination }
  const { data: queueData } = useQuery({
    queryKey: ['call-center', 'queue'],
    queryFn: async () => {
      try {
        const res = await api.get('/api/call-center/queue')
        return res.data?.data || []
      } catch {
        return []
      }
    },
    refetchInterval: autoRefresh ? 5000 : false,
    placeholderData: [],
  })

  // Backend: POST /api/call-center/transfer expects { twilioCallSid, reason, targetDepartment? }
  const handleTransfer = async (call: ActiveCall) => {
    try {
      await api.post('/api/call-center/transfer', {
        twilioCallSid: call.twilioCallSid || call.callId,
        reason: 'Manual transfer from dashboard',
      })
      refetchCalls()
    } catch (err) { console.error('Transfer failed', err) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">{isAr ? 'مركز الاتصال' : 'Live Call Center'}</h1>
            <StatusDot type="live" label={isAr ? 'مباشر' : 'Live'} />
          </div>
          <p className="page-subtitle">{isAr ? 'مراقبة المكالمات النشطة في الوقت الفعلي' : 'Monitor active calls in real-time'}</p>
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            'btn-sm',
            autoRefresh ? 'btn-success' : 'btn-outline'
          )}
        >
          <RefreshCw className={cn('h-4 w-4', autoRefresh && 'animate-spin')} />
          {autoRefresh
            ? (isAr ? 'تحديث تلقائي' : 'Auto-refresh: ON')
            : (isAr ? 'متوقف' : 'Auto-refresh: OFF')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard icon={Phone} value={stats?.totalToday || 0} label={isAr ? 'إجمالي اليوم' : 'Total Today'} iconBg="bg-primary-100" iconColor="text-primary-600" />
        <StatCard icon={CheckCircle} value={stats?.aiResolved || 0} label={isAr ? 'حلّها AI' : 'AI Resolved'} iconBg="bg-success-100" iconColor="text-success-600" />
        <StatCard icon={ArrowUpRight} value={stats?.escalated || 0} label={isAr ? 'تم تصعيدها' : 'Escalated'} iconBg="bg-warning-100" iconColor="text-warning-600" />
        <StatCard icon={Clock} value={stats?.avgWaitTime ? `${stats.avgWaitTime}${isAr ? ' ث' : 's'}` : '0s'} label={isAr ? 'متوسط الانتظار' : 'Avg Wait'} iconBg="bg-secondary-100" iconColor="text-secondary-600" />
        <StatCard icon={Headphones} value={stats?.activeNow || 0} label={isAr ? 'نشط الآن' : 'Active Now'} iconBg="bg-primary-100" iconColor="text-primary-500" live />
        <StatCard icon={Users} value={stats?.inQueue || 0} label={isAr ? 'في الانتظار' : 'In Queue'} iconBg="bg-danger-100" iconColor="text-danger-500" />
      </div>

      {/* Active Calls */}
      <div className="table-container">
        <div className="px-5 py-4 border-b border-healthcare-border/20 flex items-center justify-between">
          <h2 className="text-lg font-heading font-semibold text-healthcare-text">
            {isAr ? 'المكالمات النشطة' : 'Active Calls'}
          </h2>
          <Badge variant="success" dot>{(activeCalls || []).length} {isAr ? 'مكالمة' : 'calls'}</Badge>
        </div>

        {(activeCalls || []).length === 0 ? (
          <EmptyState
            icon={PhoneOff}
            title={isAr ? 'لا توجد مكالمات نشطة' : 'No active calls right now'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="table-header">
                <tr>
                  <th>{isAr ? 'المتصل' : 'Caller'}</th>
                  <th>{isAr ? 'المدة' : 'Duration'}</th>
                  <th>{isAr ? 'النية' : 'Intent'}</th>
                  <th>{isAr ? 'الحالة' : 'Status'}</th>
                  <th>{isAr ? 'النوع' : 'Agent'}</th>
                  <th>{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {(activeCalls || []).map((call) => {
                  const intent = intentLabels[call.intent] || intentLabels.unknown
                  const status = statusConfig[call.status] || statusConfig.active
                  return (
                    <tr key={call.callId} className="table-row">
                      <td>
                        <p className="text-xs text-healthcare-muted dir-ltr">{call.callerPhone || (isAr ? 'مجهول' : 'Unknown')}</p>
                      </td>
                      <td><span className="font-mono text-sm text-healthcare-text">{formatDuration(call.duration)}</span></td>
                      <td><Badge variant="info">{isAr ? intent.ar : intent.en}</Badge></td>
                      <td><Badge variant={status.variant as any}>{isAr ? status.ar : status.en}</Badge></td>
                      <td>
                        <Badge variant={call.agentType === 'ai' ? 'primary' : 'info'}>
                          {call.agentType === 'ai' ? (isAr ? 'ذكاء اصطناعي' : 'AI') : (isAr ? 'بشري' : 'Human')}
                        </Badge>
                      </td>
                      <td>
                        <button onClick={() => handleTransfer(call)} className="btn-warning btn-sm">
                          <PhoneForwarded className="h-3.5 w-3.5" />
                          {isAr ? 'تحويل' : 'Transfer'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="card p-6">
        <h2 className="text-lg font-heading font-semibold text-healthcare-text mb-4">
          {isAr ? 'قائمة الانتظار' : 'Call Queue'}
        </h2>
        {(queueData || []).length === 0 ? (
          <p className="text-healthcare-muted text-center py-8 text-sm">
            {isAr ? 'لا يوجد أحد في قائمة الانتظار' : 'No callers in queue'}
          </p>
        ) : (
          <div className="space-y-3">
            {(queueData as any[]).map((item: any, idx: number) => (
              <div key={item.callId || item.twilioCallSid || idx} className="flex items-center justify-between p-3 bg-primary-50/40 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-healthcare-text text-sm">{item.callerPhone || (isAr ? 'مجهول' : 'Unknown')}</p>
                    <p className="text-xs text-healthcare-muted">
                      {isAr ? 'الحالة:' : 'Status:'} {item.status || item.live?.state || '-'}
                    </p>
                  </div>
                </div>
                <Badge variant="warning" dot>{isAr ? 'في الانتظار' : 'Waiting'}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
