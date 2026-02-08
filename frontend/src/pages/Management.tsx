import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  Plus,
  FolderTree,
  Building2,
  User,
  Pencil,
  Trash2,
  X,
  Users,
  MapPin,
  Building,
  Briefcase,
  Clock,
  Calendar,
  Phone,
} from 'lucide-react'
import { cn } from '../lib/utils'
import TestChatWidget from '../components/chat/TestChatWidget'
import VoiceTestWidget from '../components/voice/VoiceTestWidget'

// Types
interface Department {
  departmentId: string
  name: string
  createdAt: string
  _count: {
    providers: number
    appointments: number
  }
}

interface Facility {
  facilityId: string
  name: string
  timezone: string
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
  createdAt: string
  _count: {
    providers: number
    appointments: number
  }
}

interface Provider {
  providerId: string
  displayName: string
  credentials: string | null
  active: boolean
  departmentId: string | null
  facilityId: string | null
  department: { departmentId: string; name: string } | null
  facility: { facilityId: string; name: string } | null
  services: Array<{ service: { serviceId: string; name: string } }>
}

type TabType = 'sections' | 'clinics' | 'providers'

export default function Management() {
  const [activeTab, setActiveTab] = useState<TabType>('sections')

  const tabs = [
    { id: 'sections' as TabType, name: 'Sections', icon: FolderTree },
    { id: 'clinics' as TabType, name: 'Clinics', icon: Building2 },
    { id: 'providers' as TabType, name: 'Providers', icon: User },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Management</h1>
        <p className="text-gray-500">Manage sections, clinics, and providers</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'sections' && <SectionsTab />}
      {activeTab === 'clinics' && <ClinicsTab />}
      {activeTab === 'providers' && <ProvidersTab />}

      {/* Floating test widgets */}
      <VoiceTestWidget />
      <TestChatWidget />
    </div>
  )
}

// ============ SECTIONS TAB ============
function SectionsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null)
  const [name, setName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await api.get('/api/departments')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: { name: string }) => api.post('/api/departments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name: string } }) =>
      api.put(`/api/departments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/departments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] })
      setDeleteConfirm(null)
    },
  })

  const departments: Department[] = data?.data || []

  const handleOpenModal = (department?: Department) => {
    if (department) {
      setEditingDepartment(department)
      setName(department.name)
    } else {
      setEditingDepartment(null)
      setName('')
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingDepartment(null)
    setName('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (editingDepartment) {
      updateMutation.mutate({ id: editingDepartment.departmentId, data: { name } })
    } else {
      createMutation.mutate({ name })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          Add Section
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : departments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <FolderTree className="h-10 w-10 text-gray-300 mb-2" />
            <p>No sections yet</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Section Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Providers
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {departments.map((dept) => (
                <tr key={dept.departmentId} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                        <FolderTree className="h-4 w-4 text-primary-600" />
                      </div>
                      <span className="font-medium text-gray-900">{dept.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {dept._count.providers} providers
                  </td>
                  <td className="px-6 py-4 text-right">
                    {deleteConfirm === dept.departmentId ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm text-red-600">Delete?</span>
                        <button
                          onClick={() => deleteMutation.mutate(dept.departmentId)}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenModal(dept)}
                          className="p-2 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-100"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(dept.departmentId)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <Modal title={editingDepartment ? 'Edit Section' : 'Add Section'} onClose={handleCloseModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Section Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Cardiology, Pediatrics"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
                autoFocus
              />
            </div>
            <ModalActions
              onCancel={handleCloseModal}
              isLoading={createMutation.isPending || updateMutation.isPending}
              submitLabel={editingDepartment ? 'Update' : 'Add'}
            />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ============ CLINICS TAB ============
function ClinicsTab() {
  const [showModal, setShowModal] = useState(false)
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null)
  const [form, setForm] = useState({
    name: '',
    timezone: 'Asia/Riyadh',
    addressLine1: '',
    city: '',
    region: '',
    country: 'Saudi Arabia',
  })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const response = await api.get('/api/facilities')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => api.post('/api/facilities', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) =>
      api.put(`/api/facilities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/facilities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['facilities'] })
      setDeleteConfirm(null)
    },
  })

  const facilities: Facility[] = data?.data || []

  const handleOpenModal = (facility?: Facility) => {
    if (facility) {
      setEditingFacility(facility)
      setForm({
        name: facility.name,
        timezone: facility.timezone,
        addressLine1: facility.addressLine1 || '',
        city: facility.city || '',
        region: facility.region || '',
        country: facility.country || 'Saudi Arabia',
      })
    } else {
      setEditingFacility(null)
      setForm({
        name: '',
        timezone: 'Asia/Riyadh',
        addressLine1: '',
        city: '',
        region: '',
        country: 'Saudi Arabia',
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingFacility(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editingFacility) {
      updateMutation.mutate({ id: editingFacility.facilityId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const getAddress = (f: Facility) => {
    const parts = [f.city, f.region].filter(Boolean)
    return parts.join(', ') || 'No address'
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          Add Clinic
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : facilities.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">No clinics yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {facilities.map((facility) => (
            <div
              key={facility.facilityId}
              className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{facility.name}</h3>
                    <p className="text-xs text-gray-500">{facility.timezone}</p>
                  </div>
                </div>
                {deleteConfirm === facility.facilityId ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => deleteMutation.mutate(facility.facilityId)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 text-xs bg-gray-200 rounded"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenModal(facility)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(facility.facilityId)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{getAddress(facility)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{facility._count.providers} providers</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal title={editingFacility ? 'Edit Clinic' : 'Add Clinic'} onClose={handleCloseModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Clinic Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Main Branch"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timezone *
              </label>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                <option value="Asia/Kuwait">Asia/Kuwait (GMT+3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="City"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <input
                type="text"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                placeholder="Region"
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <ModalActions
              onCancel={handleCloseModal}
              isLoading={createMutation.isPending || updateMutation.isPending}
              submitLabel={editingFacility ? 'Update' : 'Add'}
            />
          </form>
        </Modal>
      )}
    </div>
  )
}

// ============ PROVIDERS TAB ============
interface AvailabilityRule {
  ruleId: string
  dayOfWeek: number
  startLocal: string
  endLocal: string
  slotIntervalMin: number
}

interface ProviderWithAvailability extends Provider {
  availabilityRules?: AvailabilityRule[]
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function ProvidersTab() {
  const [showModal, setShowModal] = useState(false)
  const [showAvailabilityModal, setShowAvailabilityModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithAvailability | null>(null)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState({
    displayName: '',
    credentials: '',
    departmentId: '',
    facilityId: '',
    active: true,
  })
  const [availabilityForm, setAvailabilityForm] = useState({
    dayOfWeek: 0,
    startLocal: '09:00',
    endLocal: '17:00',
    slotIntervalMin: 15,
  })
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const response = await api.get('/api/providers')
      return response.data
    },
  })

  const { data: departmentsData } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await api.get('/api/departments')
      return response.data
    },
  })

  const { data: facilitiesData } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const response = await api.get('/api/facilities')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) =>
      api.post('/api/providers', {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) =>
      api.put(`/api/providers/${id}`, {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      setDeleteConfirm(null)
    },
  })

  // Fetch provider details with availability when selected
  const { data: providerDetails, refetch: refetchProviderDetails } = useQuery({
    queryKey: ['provider-details', selectedProvider?.providerId],
    queryFn: async () => {
      const response = await api.get(`/api/providers/${selectedProvider?.providerId}`)
      return response.data
    },
    enabled: !!selectedProvider,
  })

  // Add availability rule mutation
  const addAvailabilityMutation = useMutation({
    mutationFn: async ({ providerId, data }: { providerId: string; data: typeof availabilityForm }) =>
      api.post(`/api/providers/${providerId}/availability`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      queryClient.invalidateQueries({ queryKey: ['provider-details', selectedProvider?.providerId] })
      queryClient.invalidateQueries({ queryKey: ['chat-readiness'] })
      refetchProviderDetails()
      setAvailabilityForm({
        dayOfWeek: 0,
        startLocal: '09:00',
        endLocal: '17:00',
        slotIntervalMin: 15,
      })
    },
  })

  const providers: Provider[] = data?.data || []
  const departments: Department[] = departmentsData?.data || []
  const facilities: Facility[] = facilitiesData?.data || []

  const handleOpenModal = (provider?: Provider) => {
    if (provider) {
      setEditingProvider(provider)
      setForm({
        displayName: provider.displayName,
        credentials: provider.credentials || '',
        departmentId: provider.departmentId || '',
        facilityId: provider.facilityId || '',
        active: provider.active,
      })
    } else {
      setEditingProvider(null)
      setForm({
        displayName: '',
        credentials: '',
        departmentId: '',
        facilityId: '',
        active: true,
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProvider(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.displayName.trim()) return
    if (editingProvider) {
      updateMutation.mutate({ id: editingProvider.providerId, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  const handleOpenAvailability = (provider: Provider) => {
    setSelectedProvider(provider)
    setShowAvailabilityModal(true)
  }

  const handleCloseAvailability = () => {
    setShowAvailabilityModal(false)
    setSelectedProvider(null)
  }

  const handleAddAvailability = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProvider) return
    addAvailabilityMutation.mutate({
      providerId: selectedProvider.providerId,
      data: availabilityForm,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          Add Provider
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <User className="h-10 w-10 mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500">No providers yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <div
              key={provider.providerId}
              className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{provider.displayName}</h3>
                      {!provider.active && (
                        <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-500 rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    {provider.credentials && (
                      <p className="text-xs text-gray-500">{provider.credentials}</p>
                    )}
                  </div>
                </div>
                {deleteConfirm === provider.providerId ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => deleteMutation.mutate(provider.providerId)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 text-xs bg-gray-200 rounded"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenAvailability(provider)}
                      className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-gray-100"
                      title="Manage availability"
                    >
                      <Clock className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleOpenModal(provider)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-100"
                      title="Edit provider"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(provider.providerId)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                      title="Delete provider"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                {provider.department && (
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4" />
                    <span>{provider.department.name}</span>
                  </div>
                )}
                {provider.facility && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span>{provider.facility.name}</span>
                  </div>
                )}
                {provider.services.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    <span>{provider.services.length} services</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <Modal title={editingProvider ? 'Edit Provider' : 'Add Provider'} onClose={handleCloseModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="e.g., Dr. Ahmed Mohammed"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Credentials</label>
              <input
                type="text"
                value={form.credentials}
                onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                placeholder="e.g., MD, FACP"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Section</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select section</option>
                  {departments.map((d) => (
                    <option key={d.departmentId} value={d.departmentId}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                <select
                  value={form.facilityId}
                  onChange={(e) => setForm({ ...form, facilityId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Select clinic</option>
                  {facilities.map((f) => (
                    <option key={f.facilityId} value={f.facilityId}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="provider-active"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 text-primary-600 rounded"
              />
              <label htmlFor="provider-active" className="text-sm text-gray-700">
                Active provider
              </label>
            </div>
            <ModalActions
              onCancel={handleCloseModal}
              isLoading={createMutation.isPending || updateMutation.isPending}
              submitLabel={editingProvider ? 'Update' : 'Add'}
            />
          </form>
        </Modal>
      )}

      {/* Availability Modal */}
      {showAvailabilityModal && selectedProvider && (
        <Modal title={`Availability - ${selectedProvider.displayName}`} onClose={handleCloseAvailability}>
          <div className="space-y-4">
            {/* Current availability */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Current Schedule</h4>
              {providerDetails?.availabilityRules?.length > 0 ? (
                <div className="space-y-1 text-sm">
                  {providerDetails.availabilityRules.map((rule: AvailabilityRule) => (
                    <div key={rule.ruleId} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{DAYS_OF_WEEK[rule.dayOfWeek]}:</span>
                      <span>
                        {rule.startLocal.slice(11, 16)} - {rule.endLocal.slice(11, 16)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 p-2 bg-amber-50 rounded border border-amber-200">
                  No availability set. Add working hours below.
                </p>
              )}
            </div>

            {/* Add new availability */}
            <form onSubmit={handleAddAvailability} className="space-y-3 pt-2 border-t">
              <h4 className="text-sm font-medium text-gray-700">Add Working Hours</h4>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Day of Week</label>
                <select
                  value={availabilityForm.dayOfWeek}
                  onChange={(e) =>
                    setAvailabilityForm({ ...availabilityForm, dayOfWeek: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {DAYS_OF_WEEK.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={availabilityForm.startLocal}
                    onChange={(e) =>
                      setAvailabilityForm({ ...availabilityForm, startLocal: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">End Time</label>
                  <input
                    type="time"
                    value={availabilityForm.endLocal}
                    onChange={(e) =>
                      setAvailabilityForm({ ...availabilityForm, endLocal: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseAvailability}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={addAvailabilityMutation.isPending}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {addAvailabilityMutation.isPending ? 'Adding...' : 'Add Hours'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============ SHARED COMPONENTS ============
function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 py-8">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function ModalActions({
  onCancel,
  isLoading,
  submitLabel,
}: {
  onCancel: () => void
  isLoading: boolean
  submitLabel: string
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isLoading}
        className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
      >
        {isLoading ? 'Saving...' : submitLabel}
      </button>
    </div>
  )
}

