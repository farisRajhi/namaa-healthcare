import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import {
  Plus, Edit2, Trash2, Eye, AlertTriangle,
  BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '../lib/utils'
import Modal from '../components/ui/Modal'
import SearchInput from '../components/ui/SearchInput'
import EmptyState from '../components/ui/EmptyState'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import Badge from '../components/ui/Badge'

interface FAQEntry {
  faqId: string; category: string; questionAr: string; questionEn: string
  answerAr: string; answerEn: string; viewCount: number; isActive: boolean
  createdAt: string; updatedAt: string
}

interface TriageRule {
  triageRuleId: string; keywords: string[]
  severity: 'emergency' | 'urgent' | 'routine'
  responseAr: string; responseEn: string; action: string; isActive: boolean
}

const categories = [
  { key: 'all', ar: 'الكل', en: 'All' },
  { key: 'general', ar: 'عام', en: 'General' },
  { key: 'insurance', ar: 'التأمين', en: 'Insurance' },
  { key: 'procedures', ar: 'الإجراءات', en: 'Procedures' },
  { key: 'locations', ar: 'المواقع', en: 'Locations' },
  { key: 'policies', ar: 'السياسات', en: 'Policies' },
]

const emptyFaq = { category: 'general', questionAr: '', questionEn: '', answerAr: '', answerEn: '' }

export default function FAQ() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const orgId = user?.org?.id || ''

  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingFaq, setEditingFaq] = useState<FAQEntry | null>(null)
  const [faqForm, setFaqForm] = useState(emptyFaq)
  const [activeSection, setActiveSection] = useState<'faq' | 'triage'>('faq')
  const [showTriageModal, setShowTriageModal] = useState(false)
  const [triageForm, setTriageForm] = useState<{ keyword: string; severity: 'emergency' | 'urgent' | 'routine'; responseAr: string; responseEn: string }>({ keyword: '', severity: 'routine', responseAr: '', responseEn: '' })
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null)

  const { data: faqs, isLoading } = useQuery<FAQEntry[]>({
    queryKey: ['faqs', { category: activeCategory, search, orgId }],
    queryFn: async () => {
      if (!orgId) return []
      // If search is provided, use semantic search endpoint
      if (search) {
        try {
          const res = await api.post('/api/faq/search', {
            query: search,
            ...(activeCategory !== 'all' ? { category: activeCategory } : {}),
          })
          return res.data?.data || []
        } catch {
          return []
        }
      }
      // Otherwise use the list endpoint: GET /api/faq/:orgId
      const params = new URLSearchParams()
      if (activeCategory !== 'all') params.set('category', activeCategory)
      return (await api.get(`/api/faq/${orgId}?${params}`)).data?.data || []
    },
    enabled: !!orgId,
  })

  const { data: triageRules } = useQuery<TriageRule[]>({
    queryKey: ['triage-rules', orgId],
    queryFn: async () => {
      if (!orgId) return []
      return (await api.get(`/api/triage-rules/${orgId}`)).data?.data || []
    },
    enabled: !!orgId,
  })

  const saveFaqMutation = useMutation({
    mutationFn: (data: typeof faqForm & { faqId?: string }) =>
      data.faqId ? api.patch(`/api/faq/${data.faqId}`, data) : api.post('/api/faq', data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['faqs'] }); closeModal() },
  })

  const deleteFaqMutation = useMutation({
    mutationFn: (faqId: string) => api.delete(`/api/faq/${faqId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faqs'] }),
  })

  const saveTriageMutation = useMutation({
    mutationFn: (data: typeof triageForm) => api.post('/api/triage-rules', {
      keywords: [data.keyword],
      severity: data.severity,
      responseAr: data.responseAr,
      responseEn: data.responseEn,
      action: data.severity === 'emergency' ? 'call_emergency' : data.severity === 'urgent' ? 'schedule_urgent' : 'schedule_routine',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triage-rules'] })
      setShowTriageModal(false)
      setTriageForm({ keyword: '', severity: 'routine', responseAr: '', responseEn: '' })
    },
  })

  // Triage rules use PATCH to deactivate (no dedicated DELETE endpoint)
  const deleteTriageMutation = useMutation({
    mutationFn: (ruleId: string) => api.patch(`/api/triage-rules/${ruleId}`, { isActive: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triage-rules'] }),
  })

  const openAddModal = () => { setEditingFaq(null); setFaqForm(emptyFaq); setShowModal(true) }
  const openEditModal = (faq: FAQEntry) => {
    setEditingFaq(faq)
    setFaqForm({ category: faq.category, questionAr: faq.questionAr, questionEn: faq.questionEn, answerAr: faq.answerAr, answerEn: faq.answerEn })
    setShowModal(true)
  }
  const closeModal = () => { setShowModal(false); setEditingFaq(null); setFaqForm(emptyFaq) }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">{isAr ? 'قاعدة المعرفة' : 'FAQ Knowledge Base'}</h1>
          <p className="page-subtitle">{isAr ? 'إدارة الأسئلة الشائعة وقواعد الفرز' : 'Manage FAQs and triage rules'}</p>
        </div>
        {activeSection === 'faq' ? (
          <button onClick={openAddModal} className="btn-primary"><Plus className="h-4 w-4" />{isAr ? 'إضافة سؤال' : 'Add FAQ'}</button>
        ) : (
          <button onClick={() => setShowTriageModal(true)} className="btn-danger"><Plus className="h-4 w-4" />{isAr ? 'إضافة كلمة مفتاحية' : 'Add Keyword'}</button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-healthcare-border/30">
        <button
          onClick={() => setActiveSection('faq')}
          className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeSection === 'faq' ? 'border-primary-500 text-primary-600' : 'border-transparent text-healthcare-muted hover:text-healthcare-text')}
        >
          <BookOpen className="h-4 w-4" />{isAr ? 'الأسئلة الشائعة' : 'FAQs'}
        </button>
        <button
          onClick={() => setActiveSection('triage')}
          className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeSection === 'triage' ? 'border-danger-500 text-danger-600' : 'border-transparent text-healthcare-muted hover:text-healthcare-text')}
        >
          <AlertTriangle className="h-4 w-4" />{isAr ? 'قواعد الفرز' : 'Triage Rules'}
        </button>
      </div>

      {activeSection === 'faq' ? (
        <>
          <SearchInput value={search} onChange={setSearch} placeholder={isAr ? 'بحث في الأسئلة الشائعة...' : 'Search FAQs...'} />

          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                className={activeCategory === cat.key ? 'chip-active' : 'chip'}>
                {isAr ? cat.ar : cat.en}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64"><LoadingSpinner /></div>
          ) : (faqs || []).length === 0 ? (
            <div className="table-container">
              <EmptyState icon={BookOpen} title={isAr ? 'لا توجد أسئلة شائعة' : 'No FAQs found'} />
            </div>
          ) : (
            <div className="space-y-3">
              {(faqs || []).map((faq) => (
                <div key={faq.faqId} className="card overflow-hidden">
                  <div
                    className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-primary-50/30 transition-colors"
                    onClick={() => setExpandedFaq(expandedFaq === faq.faqId ? null : faq.faqId)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="info">
                          {isAr ? categories.find(c => c.key === faq.category)?.ar || faq.category : categories.find(c => c.key === faq.category)?.en || faq.category}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-healthcare-muted">
                          <Eye className="h-3 w-3" />{faq.viewCount}
                        </span>
                      </div>
                      <p className="font-semibold text-healthcare-text truncate">{isAr ? faq.questionAr : faq.questionEn}</p>
                    </div>
                    <div className="flex items-center gap-2 ms-4">
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(faq) }} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] text-primary-500">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); deleteFaqMutation.mutate(faq.faqId) }} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] text-danger-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {expandedFaq === faq.faqId ? <ChevronUp className="h-5 w-5 text-healthcare-muted" /> : <ChevronDown className="h-5 w-5 text-healthcare-muted" />}
                    </div>
                  </div>
                  {expandedFaq === faq.faqId && (
                    <div className="px-5 py-4 border-t border-healthcare-border/20 bg-primary-50/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold text-primary-600 mb-1">{isAr ? 'السؤال (عربي)' : 'Question (AR)'}</p>
                          <p className="text-sm text-healthcare-text mb-3" dir="rtl">{faq.questionAr}</p>
                          <p className="text-xs font-semibold text-primary-600 mb-1">{isAr ? 'الإجابة (عربي)' : 'Answer (AR)'}</p>
                          <p className="text-sm text-healthcare-muted" dir="rtl">{faq.answerAr}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-primary-600 mb-1">{isAr ? 'السؤال (إنجليزي)' : 'Question (EN)'}</p>
                          <p className="text-sm text-healthcare-text mb-3" dir="ltr">{faq.questionEn}</p>
                          <p className="text-xs font-semibold text-primary-600 mb-1">{isAr ? 'الإجابة (إنجليزي)' : 'Answer (EN)'}</p>
                          <p className="text-sm text-healthcare-muted" dir="ltr">{faq.answerEn}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="table-container">
          <div className="px-5 py-4 border-b border-healthcare-border/20">
            <h2 className="text-lg font-heading font-semibold text-healthcare-text">{isAr ? 'الكلمات المفتاحية للطوارئ' : 'Emergency Keywords'}</h2>
            <p className="text-xs text-healthcare-muted mt-0.5">{isAr ? 'الكلمات التي تؤدي إلى تصعيد فوري' : 'Keywords that trigger immediate escalation'}</p>
          </div>
          {(triageRules || []).length === 0 ? (
            <EmptyState icon={AlertTriangle} title={isAr ? 'لا توجد كلمات مفتاحية' : 'No triage keywords configured'} />
          ) : (
            <div className="divide-y divide-healthcare-border/20">
              {(triageRules || []).map((rule) => (
                <div key={rule.triageRuleId} className="px-5 py-4 flex items-center justify-between hover:bg-primary-50/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge variant={rule.severity === 'emergency' ? 'danger' : rule.severity === 'urgent' ? 'warning' : 'neutral'}>
                      {rule.severity === 'emergency' ? (isAr ? 'طوارئ' : 'Emergency') : rule.severity === 'urgent' ? (isAr ? 'عاجل' : 'Urgent') : (isAr ? 'روتيني' : 'Routine')}
                    </Badge>
                    <div>
                      <p className="font-semibold text-healthcare-text">{rule.keywords.join(', ')}</p>
                      <p className="text-xs text-healthcare-muted">{isAr ? rule.responseAr : rule.responseEn}</p>
                    </div>
                  </div>
                  <button onClick={() => deleteTriageMutation.mutate(rule.triageRuleId)} className="btn-icon btn-ghost p-2 min-w-[36px] min-h-[36px] text-danger-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FAQ Modal */}
      <Modal open={showModal} onClose={closeModal} title={editingFaq ? (isAr ? 'تعديل السؤال' : 'Edit FAQ') : (isAr ? 'إضافة سؤال' : 'Add FAQ')} size="xl">
        <form onSubmit={(e) => { e.preventDefault(); saveFaqMutation.mutate(editingFaq ? { ...faqForm, faqId: editingFaq.faqId } : faqForm) }} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'الفئة' : 'Category'}</label>
            <select value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} className="select">
              {categories.filter(c => c.key !== 'all').map((cat) => (
                <option key={cat.key} value={cat.key}>{isAr ? cat.ar : cat.en}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">{isAr ? 'السؤال (عربي)' : 'Question (Arabic)'}</label>
              <input type="text" dir="rtl" value={faqForm.questionAr} onChange={(e) => setFaqForm({ ...faqForm, questionAr: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">{isAr ? 'السؤال (إنجليزي)' : 'Question (English)'}</label>
              <input type="text" dir="ltr" value={faqForm.questionEn} onChange={(e) => setFaqForm({ ...faqForm, questionEn: e.target.value })} className="input" required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">{isAr ? 'الإجابة (عربي)' : 'Answer (Arabic)'}</label>
              <textarea dir="rtl" rows={4} value={faqForm.answerAr} onChange={(e) => setFaqForm({ ...faqForm, answerAr: e.target.value })} className="input" required />
            </div>
            <div>
              <label className="input-label">{isAr ? 'الإجابة (إنجليزي)' : 'Answer (English)'}</label>
              <textarea dir="ltr" rows={4} value={faqForm.answerEn} onChange={(e) => setFaqForm({ ...faqForm, answerEn: e.target.value })} className="input" required />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={closeModal} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={saveFaqMutation.isPending} className="btn-primary flex-1">
              {saveFaqMutation.isPending ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Triage Modal */}
      <Modal open={showTriageModal} onClose={() => setShowTriageModal(false)} title={isAr ? 'إضافة كلمة مفتاحية' : 'Add Triage Keyword'}>
        <form onSubmit={(e) => { e.preventDefault(); saveTriageMutation.mutate(triageForm) }} className="space-y-4">
          <div>
            <label className="input-label">{isAr ? 'الكلمة المفتاحية' : 'Keyword'}</label>
            <input type="text" value={triageForm.keyword} onChange={(e) => setTriageForm({ ...triageForm, keyword: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'الخطورة' : 'Severity'}</label>
            <select value={triageForm.severity} onChange={(e) => setTriageForm({ ...triageForm, severity: e.target.value as any })} className="select">
              <option value="emergency">{isAr ? 'طوارئ' : 'Emergency'}</option>
              <option value="urgent">{isAr ? 'عاجل' : 'Urgent'}</option>
              <option value="routine">{isAr ? 'روتيني' : 'Routine'}</option>
            </select>
          </div>
          <div>
            <label className="input-label">{isAr ? 'الاستجابة (عربي)' : 'Response (Arabic)'}</label>
            <textarea dir="rtl" rows={2} value={triageForm.responseAr} onChange={(e) => setTriageForm({ ...triageForm, responseAr: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="input-label">{isAr ? 'الاستجابة (إنجليزي)' : 'Response (English)'}</label>
            <textarea dir="ltr" rows={2} value={triageForm.responseEn} onChange={(e) => setTriageForm({ ...triageForm, responseEn: e.target.value })} className="input" required />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowTriageModal(false)} className="btn-outline flex-1">{isAr ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" disabled={saveTriageMutation.isPending} className="btn-danger flex-1">
              {saveTriageMutation.isPending ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ' : 'Save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
