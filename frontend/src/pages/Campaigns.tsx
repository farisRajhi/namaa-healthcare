import { useState } from 'react'
import CampaignList from '../components/campaigns/CampaignList'
import CampaignDetail from '../components/campaigns/CampaignDetail'
import SimpleCampaignWizard from '../components/campaigns/SimpleCampaignWizard'
import type { Campaign } from '../components/campaigns/CampaignList'

type View = 'list' | 'detail' | 'create'

export default function Campaigns() {
  const [view, setView] = useState<View>('list')
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  if (view === 'create') {
    return (
      <SimpleCampaignWizard
        onClose={() => setView('list')}
        onSuccess={() => setView('list')}
      />
    )
  }

  if (view === 'detail' && selectedCampaign) {
    return (
      <CampaignDetail
        campaign={selectedCampaign}
        onBack={() => {
          setSelectedCampaign(null)
          setView('list')
        }}
      />
    )
  }

  return (
    <CampaignList
      onSelect={(campaign) => {
        setSelectedCampaign(campaign)
        setView('detail')
      }}
      onCreateNew={() => setView('create')}
    />
  )
}
