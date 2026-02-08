import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Plus, User, Building, Briefcase, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '../lib/utils'

interface Provider {
  providerId: string
  displayName: string
  credentials: string | null
  active: boolean
  departmentId: string | null
  facilityId: string | null
  department: {
    departmentId: string
    name: string
  } | null
  facility: {
    facilityId: string
    name: string
  } | null
  services: Array<{
    service: {
      serviceId: string
      name: string
    }
  }>
}

interface Department {
  departmentId: string
  name: string
}

interface Facility {
  facilityId: string
  name: string
}

interface ProviderForm {
  displayName: string
  credentials: string
  departmentId: string
  facilityId: string
  active: boolean
}

const defaultForm: ProviderForm = {
  displayName: '',
  credentials: '',
  departmentId: '',
  facilityId: '',
  active: true,
}

export default function Providers() {
  const [showActive, setShowActive] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [form, setForm] = useState<ProviderForm>(defaultForm)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['providers', { active: showActive }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (showActive) params.set('active', 'true')
      const response = await api.get(`/api/providers?${params}`)
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
    mutationFn: async (data: ProviderForm) => {
      return api.post('/api/providers', {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      handleCloseModal()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ProviderForm> }) => {
      return api.put(`/api/providers/${id}`, {
        displayName: data.displayName,
        credentials: data.credentials || undefined,
        departmentId: data.departmentId || undefined,
        facilityId: data.facilityId || undefined,
        active: data.active,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      handleCloseModal()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`/api/providers/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      setDeleteConfirm(null)
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
      setForm(defaultForm)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingProvider(null)
    setForm(defaultForm)
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

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Providers</h1>
          <p className="text-gray-500">Manage doctors and staff</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="h-5 w-5" />
          Add Provider
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowActive(true)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            showActive
              ? 'bg-primary-100 text-primary-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          Active
        </button>
        <button
          onClick={() => setShowActive(false)}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            !showActive
              ? 'bg-primary-100 text-primary-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          All
        </button>
      </div>

      {/* Providers Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
          <User className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No providers found</p>
          <button
            onClick={() => handleOpenModal()}
            className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
          >
            Add your first provider
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((provider) => (
            <div
              key={provider.providerId}
              className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 truncate">
                        {provider.displayName}
                      </h3>
                      {!provider.active && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    {provider.credentials && (
                      <p className="text-sm text-gray-500">{provider.credentials}</p>
                    )}
                  </div>
                </div>
                {deleteConfirm === provider.providerId ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(provider.providerId)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenModal(provider)}
                      className="p-1.5 text-gray-400 hover:text-primary-600 rounded hover:bg-gray-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(provider.providerId)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {provider.department && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building className="h-4 w-4" />
                    {provider.department.name}
                  </div>
                )}
                {provider.facility && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Building className="h-4 w-4" />
                    {provider.facility.name}
                  </div>
                )}
                {provider.services.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <Briefcase className="h-4 w-4 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {provider.services.slice(0, 3).map((ps, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-gray-100 rounded text-xs"
                        >
                          {ps.service.name}
                        </span>
                      ))}
                      {provider.services.length > 3 && (
                        <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                          +{provider.services.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 py-8">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={handleCloseModal}
            />
            <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingProvider ? 'Edit Provider' : 'Add Provider'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                    placeholder="e.g., Dr. Ahmed Mohammed"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Credentials
                  </label>
                  <input
                    type="text"
                    value={form.credentials}
                    onChange={(e) => setForm({ ...form, credentials: e.target.value })}
                    placeholder="e.g., MD, FACP"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Section
                  </label>
                  <select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select a section</option>
                    {departments.map((dept) => (
                      <option key={dept.departmentId} value={dept.departmentId}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clinic
                  </label>
                  <select
                    value={form.facilityId}
                    onChange={(e) => setForm({ ...form, facilityId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select a clinic</option>
                    {facilities.map((facility) => (
                      <option key={facility.facilityId} value={facility.facilityId}>
                        {facility.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="active" className="text-sm text-gray-700">
                    Active provider
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : editingProvider
                      ? 'Update'
                      : 'Add'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
