import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

interface CampaignCreateData {
  name: string
  nameAr?: string
  type: string
  targetFilter: Record<string, any>
  channelSequence?: string[]
  scriptEn?: string
  scriptAr?: string
  startDate?: string
  endDate?: string
  offerId?: string
}

export function useCampaignCreate(options: {
  onSuccess: (campaignId: string) => void
  onError: (msg: string) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ data, sendNow }: { data: CampaignCreateData; sendNow: boolean }) => {
      // Step 1: create the campaign
      const res = await api.post('/api/outbound/campaigns', {
        ...data,
        channelSequence: data.channelSequence || ['whatsapp'],
      })
      const campaign = res.data?.data || res.data
      const campaignId = campaign?.campaignId || campaign?.id

      if (!campaignId) throw new Error('Failed to create campaign')

      // Step 2: start immediately if sendNow
      if (sendNow) {
        await api.post(`/api/outbound/campaigns/${campaignId}/start`)
      }

      return campaignId as string
    },
    onSuccess: (campaignId) => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['campaigns-hub'] })
      options.onSuccess(campaignId)
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || error?.message || 'Failed to create campaign'
      options.onError(msg)
    },
  })
}
