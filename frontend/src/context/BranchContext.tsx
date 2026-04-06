/**
 * BranchContext – Multi-branch support for dashboard.
 *
 * Provides the currently selected branch ID to all child components.
 * The branch selector in DashboardLayout sets this value.
 * Components that need branch-filtered data read `selectedBranchId` from this context.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'

export interface Branch {
  branchId: string
  name: string
  nameAr: string | null
  address: string | null
  phone: string | null
  facilityIds: string[]
  isActive: boolean
  createdAt: string
}

interface BranchContextValue {
  branches: Branch[]
  selectedBranchId: string | null
  selectedBranch: Branch | null
  setSelectedBranchId: (id: string | null) => void
  loading: boolean
  reload: () => void
}

const BranchContext = createContext<BranchContextValue>({
  branches: [],
  selectedBranchId: null,
  selectedBranch: null,
  setSelectedBranchId: () => {},
  loading: false,
  reload: () => {},
})

const STORAGE_KEY = 'tawafud_selected_branch'

export function BranchProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  )
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const reload = () => setTick((t) => t + 1)

  useEffect(() => {
    if (!isAuthenticated) return
    setLoading(true)
    fetch('/api/branches', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const list: Branch[] = json.data ?? []
        setBranches(list.filter((b) => b.isActive))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated, tick])

  const setSelectedBranchId = (id: string | null) => {
    setSelectedBranchIdState(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY, id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const selectedBranch = branches.find((b) => b.branchId === selectedBranchId) ?? null

  return (
    <BranchContext.Provider
      value={{ branches, selectedBranchId, selectedBranch, setSelectedBranchId, loading, reload }}
    >
      {children}
    </BranchContext.Provider>
  )
}

export function useBranch() {
  return useContext(BranchContext)
}
