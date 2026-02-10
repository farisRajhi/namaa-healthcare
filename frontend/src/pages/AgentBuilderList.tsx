import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Workflow,
  MoreVertical,
  Trash2,
  Copy,
  Upload,
  FileDown,
  Search,
  LayoutTemplate,
  Clock,
  GitBranch,
  Loader2,
} from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

type FilterTab = 'all' | 'published' | 'draft'

interface FlowListItem {
  id: string
  name: string
  nameAr?: string
  description?: string
  descriptionAr?: string
  isActive: boolean
  version: number
  publishedAt: string | null
  sessionsCount: number
  createdAt: string
  updatedAt: string
}

interface TemplateItem {
  id: string
  name: string
  nameAr?: string
  description?: string
  descriptionAr?: string
  templateCategory?: string
  isBuiltIn: boolean
}

export default function AgentBuilderList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const orgId = user?.org?.id
  const [flows, setFlows] = useState<FlowListItem[]>([])
  const [templates, setTemplates] = useState<TemplateItem[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load flows from API
  const loadFlows = useCallback(async () => {
    if (!orgId) return
    setIsLoading(true)
    try {
      const res = await api.get('/api/agent-builder/flows', {
        params: { limit: 100 },
      })
      const data = res.data?.data || []
      setFlows(data.sort((a: FlowListItem, b: FlowListItem) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ))
    } catch {
      // silently fail — user will see empty state
    } finally {
      setIsLoading(false)
    }
  }, [orgId])

  // Load templates from API
  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/api/agent-builder/templates')
      setTemplates(res.data?.data || [])
    } catch {
      // templates are optional
    }
  }, [])

  useEffect(() => {
    loadFlows()
    loadTemplates()
  }, [loadFlows, loadTemplates])

  // Create new flow via API
  const createNewFlow = async () => {
    try {
      const res = await api.post('/api/agent-builder/flows', {
        name: 'تدفق جديد',
        nameAr: 'تدفق جديد',
        nodes: [
          {
            id: 'start-1',
            type: 'start',
            position: { x: 400, y: 50 },
            data: { type: 'start', label: 'بداية', greetingAr: 'مرحباً! كيف أقدر أساعدك؟', greetingEn: 'Hello! How can I help you?' },
          },
        ],
        edges: [],
      })
      const newId = res.data?.data?.id
      if (newId) {
        navigate(`/dashboard/agent-builder/${newId}`)
      }
    } catch {
      // fallback: navigate to new builder with no ID
      navigate('/dashboard/agent-builder/new')
    }
  }

  // Clone template via API
  const useTemplate = async (template: TemplateItem) => {
    try {
      const res = await api.post(`/api/agent-builder/templates/${template.id}/clone`)
      const newId = res.data?.data?.id
      if (newId) {
        navigate(`/dashboard/agent-builder/${newId}`)
      }
    } catch {
      // fallback
    }
    setShowTemplates(false)
  }

  // Delete flow via API
  const deleteFlow = async (flowIdToDelete: string) => {
    try {
      await api.delete(`/api/agent-builder/flows/${flowIdToDelete}`)
      setOpenMenuId(null)
      loadFlows()
    } catch {
      // silently fail
    }
  }

  // Duplicate flow: fetch full flow then create copy
  const duplicateFlow = async (flow: FlowListItem) => {
    try {
      const detailRes = await api.get(`/api/agent-builder/flows/${flow.id}`)
      const detail = detailRes.data?.data
      if (detail) {
        const res = await api.post('/api/agent-builder/flows', {
          name: `${detail.nameAr || detail.name} (نسخة)`,
          nameAr: `${detail.nameAr || detail.name} (نسخة)`,
          description: detail.description,
          nodes: detail.nodes || [],
          edges: detail.edges || [],
        })
        if (res.data?.data?.id) {
          setOpenMenuId(null)
          loadFlows()
        }
      }
    } catch {
      // silently fail
    }
  }

  // Toggle publish via API
  const togglePublish = async (flow: FlowListItem) => {
    try {
      if (flow.isActive) {
        await api.post(`/api/agent-builder/flows/${flow.id}/unpublish`)
      } else {
        await api.post(`/api/agent-builder/flows/${flow.id}/publish`)
      }
      setOpenMenuId(null)
      loadFlows()
    } catch {
      // silently fail
    }
  }

  // Filter flows
  const filteredFlows = flows.filter((f) => {
    if (filter === 'published' && !f.isActive) return false
    if (filter === 'draft' && f.isActive) return false
    if (searchQuery) {
      const displayName = f.nameAr || f.name
      const displayDesc = f.descriptionAr || f.description || ''
      return displayName.includes(searchQuery) || displayDesc.includes(searchQuery)
    }
    return true
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'published', label: 'منشور' },
    { key: 'draft', label: 'مسودة' },
  ]

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Workflow className="w-6 h-6 text-teal-500" />
            بناء المحادثات
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            أنشئ وأدر تدفقات المحادثة الآلية
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <LayoutTemplate className="w-4 h-4" />
            استخدام قالب
          </button>
          <button
            onClick={createNewFlow}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            إنشاء تدفق جديد
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث في التدفقات..."
            className="w-full ps-10 pe-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-300 bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                filter === tab.key
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">جاري التحميل...</p>
        </div>
      ) : filteredFlows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <div className="w-20 h-20 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
            <Workflow className="w-10 h-10 text-teal-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-700 mb-1">لا توجد تدفقات بعد</h3>
          <p className="text-sm text-gray-400 mb-4">ابدأ بإنشاء تدفق محادثة جديد أو استخدم قالب جاهز</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={createNewFlow}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-xl hover:bg-teal-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              إنشاء تدفق جديد
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFlows.map((flow) => (
            <div
              key={flow.id}
              className="bg-white rounded-2xl border border-gray-100 hover:border-teal-200 hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer"
              onClick={() => navigate(`/dashboard/agent-builder/${flow.id}`)}
            >
              {/* Card header */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-800 truncate">{flow.nameAr || flow.name}</h3>
                    {(flow.descriptionAr || flow.description) && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{flow.descriptionAr || flow.description}</p>
                    )}
                  </div>
                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === flow.id ? null : flow.id)
                      }}
                      className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                    {openMenuId === flow.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null) }} />
                        <div className="absolute end-0 top-full mt-1 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-20" dir="rtl">
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateFlow(flow) }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            نسخ
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); togglePublish(flow) }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            {flow.isActive ? (
                              <>
                                <FileDown className="w-3.5 h-3.5" />
                                إلغاء النشر
                              </>
                            ) : (
                              <>
                                <Upload className="w-3.5 h-3.5" />
                                نشر
                              </>
                            )}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id) }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            حذف
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Card footer */}
              <div className="px-4 py-2.5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`
                    text-[10px] font-semibold px-2 py-0.5 rounded-full
                    ${flow.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'}
                  `}>
                    {flow.isActive ? 'منشور' : 'مسودة'}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-gray-400">
                    <GitBranch className="w-3 h-3" />
                    v{flow.version}
                  </span>
                  {flow.sessionsCount > 0 && (
                    <span className="text-[10px] text-gray-400">
                      {flow.sessionsCount} جلسة
                    </span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {formatDate(flow.updatedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Templates Modal */}
      {showTemplates && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setShowTemplates(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-800">اختر قالب</h2>
                <p className="text-xs text-gray-400 mt-0.5">ابدأ من قالب جاهز وخصصه حسب احتياجاتك</p>
              </div>
              <div className="p-4 space-y-3 overflow-y-auto max-h-[50vh]">
                {templates.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-8">لا توجد قوالب متاحة</p>
                ) : (
                  templates.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      onClick={() => useTemplate(tmpl)}
                      className="w-full text-start p-4 bg-gray-50 rounded-xl hover:bg-teal-50 hover:border-teal-200 border border-gray-100 transition-all"
                    >
                      <h3 className="text-sm font-bold text-gray-800">{tmpl.nameAr || tmpl.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{tmpl.descriptionAr || tmpl.description}</p>
                      {tmpl.templateCategory && (
                        <span className="inline-block mt-1.5 text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
                          {tmpl.templateCategory}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="px-6 py-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => setShowTemplates(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
