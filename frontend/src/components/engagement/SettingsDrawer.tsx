import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Bell, MessageSquare, Phone, Mail, Save, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { api } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'

interface Props {
  open: boolean
  onClose: () => void
  isAr: boolean
}

interface ReminderConfig {
  interval: '48h' | '24h' | '2h'
  label: { ar: string; en: string }
  channels: { sms: boolean; whatsapp: boolean; voice: boolean; email: boolean }
}

interface SmsTemplate {
  id: string
  name: string
  trigger: string
  channel: string
  isActive: boolean
}

const defaultConfigs: ReminderConfig[] = [
  { interval: '48h', label: { ar: '48 ساعة قبل', en: '48h before' }, channels: { sms: true, whatsapp: true, voice: false, email: true } },
  { interval: '24h', label: { ar: '24 ساعة قبل', en: '24h before' }, channels: { sms: true, whatsapp: true, voice: false, email: false } },
  { interval: '2h', label: { ar: 'ساعتان قبل', en: '2h before' }, channels: { sms: true, whatsapp: false, voice: true, email: false } },
]

const channelList = [
  { key: 'sms' as const, icon: MessageSquare, label: { en: 'SMS', ar: 'رسالة' } },
  { key: 'whatsapp' as const, icon: MessageSquare, label: { en: 'WhatsApp', ar: 'واتساب' } },
  { key: 'voice' as const, icon: Phone, label: { en: 'Voice', ar: 'صوتي' } },
  { key: 'email' as const, icon: Mail, label: { en: 'Email', ar: 'بريد' } },
]

const triggerLabels: Record<string, { en: string; ar: string }> = {
  post_booking: { en: 'Post Booking', ar: 'بعد الحجز' },
  reminder: { en: 'Reminder', ar: 'تذكير' },
  mid_call_link: { en: 'Mid-call', ar: 'أثناء المكالمة' },
  survey: { en: 'Survey', ar: 'استبيان' },
  custom: { en: 'Custom', ar: 'مخصص' },
  follow_up: { en: 'Follow-up', ar: 'متابعة' },
}

export default function SettingsDrawer({ open, onClose, isAr }: Props) {
  const { user } = useAuth()
  const orgId = user?.org?.id || ''
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const [configs, setConfigs] = useState<ReminderConfig[]>(defaultConfigs)

  // Fetch templates
  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ['sms-templates-settings', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/sms-templates/${orgId}`)
      const list = res.data?.data || res.data || []
      return Array.isArray(list) ? list : []
    },
    enabled: open && !!orgId,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      const intervals = configs.flatMap((config) => {
        const hoursBefore = config.interval === '48h' ? 48 : config.interval === '24h' ? 24 : 2
        const channels: string[] = []
        if (config.channels.sms) channels.push('sms')
        if (config.channels.whatsapp) channels.push('whatsapp')
        if (config.channels.voice) channels.push('voice')
        return channels.map((channel) => ({ hoursBefore, channel }))
      })
      return api.post('/api/reminders/configure', { orgId, intervals, enableSurvey: true, surveyDelayHours: 2 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] })
      addToast({ type: 'success', title: isAr ? 'تم الحفظ' : 'Saved' })
    },
    onError: () => {
      addToast({ type: 'error', title: isAr ? 'فشل الحفظ' : 'Save failed' })
    },
  })

  const toggleChannel = (idx: number, ch: keyof ReminderConfig['channels']) => {
    const next = [...configs]
    next[idx] = { ...next[idx], channels: { ...next[idx].channels, [ch]: !next[idx].channels[ch] } }
    setConfigs(next)
  }

  if (!open) return null

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 bottom-0 z-50 w-80 bg-white shadow-xl flex flex-col transition-transform',
          isAr ? 'start-0' : 'end-0',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold font-heading text-healthcare-text">
            {isAr ? 'الإعدادات' : 'Settings'}
          </h2>
          <button onClick={onClose} className="btn-icon btn-ghost p-2">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Reminder Config */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-healthcare-primary" />
              <h3 className="text-sm font-semibold text-gray-800">
                {isAr ? 'إعدادات التذكيرات' : 'Reminder Config'}
              </h3>
            </div>

            <div className="space-y-3">
              {configs.map((config, idx) => (
                <div key={config.interval} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    {isAr ? config.label.ar : config.label.en}
                  </p>
                  <div className="flex gap-2">
                    {channelList.map((ch) => (
                      <button
                        key={ch.key}
                        type="button"
                        onClick={() => toggleChannel(idx, ch.key)}
                        className={cn(
                          'px-2 py-1 rounded text-[10px] font-medium border transition-colors',
                          config.channels[ch.key]
                            ? 'bg-healthcare-primary/10 border-healthcare-primary/30 text-healthcare-primary'
                            : 'bg-white border-gray-200 text-gray-400',
                        )}
                      >
                        {isAr ? ch.label.ar : ch.label.en}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="btn-primary btn-sm w-full mt-3 flex items-center justify-center gap-2"
            >
              {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {isAr ? 'حفظ التذكيرات' : 'Save Reminders'}
            </button>
          </section>

          {/* SMS Templates */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-healthcare-primary" />
              <h3 className="text-sm font-semibold text-gray-800">
                {isAr ? 'قوالب الرسائل' : 'SMS Templates'}
              </h3>
            </div>

            {templates?.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-3">
                {isAr ? 'لا توجد قوالب' : 'No templates yet'}
              </p>
            )}

            <div className="space-y-2">
              {templates?.map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center justify-between p-2.5 rounded-lg border',
                    t.isActive ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{t.name}</p>
                    <p className="text-[10px] text-gray-500">
                      {triggerLabels[t.trigger]?.[isAr ? 'ar' : 'en'] || t.trigger}
                      {' · '}
                      {t.channel}
                    </p>
                  </div>
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    t.isActive ? 'bg-green-500' : 'bg-gray-300',
                  )} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
