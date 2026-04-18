import { useEffect, useState } from 'react'

interface Impersonation {
  orgName: string
  expiresAt: string
}

function read(): Impersonation | null {
  try {
    const raw = sessionStorage.getItem('impersonating')
    if (!raw) return null
    return JSON.parse(raw) as Impersonation
  } catch {
    return null
  }
}

export default function ImpersonationBanner() {
  const [state] = useState<Impersonation | null>(() => read())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!state) return null

  const msLeft = new Date(state.expiresAt).getTime() - now
  if (msLeft <= 0) {
    sessionStorage.removeItem('impersonating')
    localStorage.removeItem('token')
    window.location.href = '/platform/orgs'
    return null
  }

  const minutes = Math.floor(msLeft / 60_000)
  const seconds = Math.floor((msLeft % 60_000) / 1000).toString().padStart(2, '0')

  const exit = () => {
    sessionStorage.removeItem('impersonating')
    localStorage.removeItem('token')
    window.location.href = '/platform/orgs'
  }

  return (
    <div className="sticky top-0 z-[60] bg-red-700 text-white text-sm">
      <div className="max-w-screen-2xl mx-auto px-4 py-2 flex items-center justify-between gap-4" dir="ltr">
        <div>
          <strong>Impersonating</strong> {state.orgName} — expires in {minutes}:{seconds}
        </div>
        <button
          onClick={exit}
          className="bg-white/10 hover:bg-white/20 rounded px-3 py-1 text-xs font-semibold"
        >
          Exit impersonation
        </button>
      </div>
    </div>
  )
}
