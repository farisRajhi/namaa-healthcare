import { ReactNode } from 'react'
import { useAuth } from '../../context/AuthContext'
import NotActivatedOverlay from './NotActivatedOverlay'

/**
 * Gate any feature behind an "activated" org. Replaces the (now hidden)
 * subscription-based RequiresSubscription wrapper. The dashboard shell stays
 * visible — only the inner page is replaced with the lock screen.
 */
export default function RequiresActivation({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.org?.isActivated) return <>{children}</>
  return <NotActivatedOverlay />
}
