import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { useToast } from '../components/ui/Toast'
import { cn, formatDate } from '../lib/utils'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import StatCard from '../components/ui/StatCard'
import SuggestionCard, { type Suggestion } from '../components/patientIntelligence/SuggestionCard'
import ApprovalDialog from '../components/patientIntelligence/ApprovalDialog'
import {
  Upload,
  Brain,
  Users,
  Target,
  Sparkles,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

/* ─── Types ─── */
interface Analysis {
  id: string
  orgId: string
  fileName: string
  status: 'pending' | 'parsing' | 'analyzing' | 'generating' | 'completed' | 'failed'
  progress: number
  currentStep: string | null
  totalPatients: number
  patientsAnalyzed: number
  matchedPatients?: number
  suggestionsCount: number
  error: string | null
  createdAt: string
  completedAt: string | null
}

interface PatientRow {
  id: string
  name: string
  nameAr: string | null
  phone: string
  lastVisit: string | null
  matchedServices: string[]
  riskScore: number | null
}

interface PatientsResponse {
  patients: PatientRow[]
  total: number
  page: number
  limit: number
}

/* ─── Step labels ─── */
const STEP_LABELS: Record<string, { ar: string; en: string }> = {
  pending: { ar: 'في الانتظار...', en: 'Waiting...' },
  parsing: { ar: 'قراءة الملف وتحليل البيانات', en: 'Parsing file & extracting data' },
  analyzing: { ar: 'تحليل بيانات المرضى بالذكاء الاصطناعي', en: 'AI analyzing patient data' },
  generating: { ar: 'توليد اقتراحات الحملات', en: 'Generating campaign suggestions' },
  completed: { ar: 'اكتمل التحليل', en: 'Analysis complete' },
  failed: { ar: 'فشل التحليل', en: 'Analysis failed' },
}

const STEP_ORDER = ['pending', 'parsing', 'analyzing', 'generating', 'completed']

/* ─── Main Component ─── */
export default function PatientIntelligence() {
  const { i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const { user } = useAuth()
  const { addToast } = useToast()
  const queryClient = useQueryClient()
  const orgId = user?.org?.id || ''
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [dialogSuggestion, setDialogSuggestion] = useState<Suggestion | null>(null)
  const [dialogMode, setDialogMode] = useState<'approve' | 'edit'>('approve')
  const [showPastAnalyses, setShowPastAnalyses] = useState(false)
  const [patientsPage, setPatientsPage] = useState(1)
  const [showPatients, setShowPatients] = useState(false)

  /* ─── Queries ─── */

  // List all analyses
  const { data: analyses, isLoading: analysesLoading } = useQuery<Analysis[]>({
    queryKey: ['patient-intelligence', 'analyses', orgId],
    queryFn: async () => {
      const res = await api.get(`/api/patient-intelligence/${orgId}/analyses`)
      return res.data?.data || res.data || []
    },
    enabled: !!orgId,
    staleTime: 10_000,
  })

  // Current analysis = selected or the most recent
  const latestAnalysis = analyses?.[0] || null
  const activeAnalysis = selectedAnalysisId
    ? analyses?.find((a) => a.id === selectedAnalysisId) || latestAnalysis
    : latestAnalysis

  // Poll for progress when processing
  const isProcessing =
    activeAnalysis &&
    !['completed', 'failed'].includes(activeAnalysis.status)

  const { data: liveAnalysis } = useQuery<Analysis>({
    queryKey: ['patient-intelligence', 'analysis', activeAnalysis?.id],
    queryFn: async () => {
      const res = await api.get(
        `/api/patient-intelligence/${orgId}/analyses/${activeAnalysis!.id}`
      )
      return res.data?.data || res.data
    },
    enabled: !!activeAnalysis?.id && !!isProcessing,
    refetchInterval: isProcessing ? 3000 : false,
    staleTime: 0,
  })

  // Merge live data into activeAnalysis
  const currentAnalysis: Analysis | null =
    liveAnalysis && activeAnalysis && liveAnalysis.id === activeAnalysis.id
      ? liveAnalysis
      : activeAnalysis

  // When processing finishes, invalidate analyses list
  useEffect(() => {
    if (liveAnalysis && ['completed', 'failed'].includes(liveAnalysis.status)) {
      queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'analyses', orgId] })
    }
  }, [liveAnalysis?.status])

  // Suggestions for the current analysis
  const { data: suggestions } = useQuery<Suggestion[]>({
    queryKey: ['patient-intelligence', 'suggestions', currentAnalysis?.id],
    queryFn: async () => {
      const res = await api.get(
        `/api/patient-intelligence/${orgId}/analyses/${currentAnalysis!.id}/suggestions`
      )
      return res.data?.data || res.data || []
    },
    enabled: !!currentAnalysis?.id && currentAnalysis?.status === 'completed',
    staleTime: 30_000,
  })

  // Patients table
  const { data: patientsData } = useQuery<PatientsResponse>({
    queryKey: ['patient-intelligence', 'patients', currentAnalysis?.id, patientsPage],
    queryFn: async () => {
      const res = await api.get(
        `/api/patient-intelligence/${orgId}/analyses/${currentAnalysis!.id}/patients?page=${patientsPage}&limit=20`
      )
      return res.data?.data || res.data
    },
    enabled: !!currentAnalysis?.id && currentAnalysis?.status === 'completed' && showPatients,
    staleTime: 30_000,
  })

  /* ─── Mutations ─── */

  const approveMutation = useMutation({
    mutationFn: async (data: {
      id: string
      messageScriptAr: string
      messageScriptEn: string
      channel: string[]
    }) => {
      await api.patch(
        `/api/patient-intelligence/${orgId}/suggestions/${data.id}/approve`,
        {
          messageScriptAr: data.messageScriptAr,
          messageScriptEn: data.messageScriptEn,
          channel: data.channel,
        }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'suggestions'] })
      addToast({
        type: 'success',
        title: isAr ? 'تم إطلاق الحملة' : 'Campaign launched',
      })
      setDialogSuggestion(null)
    },
    onError: () => {
      addToast({
        type: 'error',
        title: isAr ? 'حدث خطأ' : 'Something went wrong',
      })
    },
  })

  const editMutation = useMutation({
    mutationFn: async (data: {
      id: string
      messageScriptAr: string
      messageScriptEn: string
      channel: string[]
    }) => {
      await api.patch(
        `/api/patient-intelligence/${orgId}/suggestions/${data.id}/edit`,
        {
          messageScriptAr: data.messageScriptAr,
          messageScriptEn: data.messageScriptEn,
          channel: data.channel,
        }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'suggestions'] })
      addToast({
        type: 'success',
        title: isAr ? 'تم حفظ التعديلات' : 'Changes saved',
      })
      setDialogSuggestion(null)
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/api/patient-intelligence/${orgId}/suggestions/${id}/reject`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'suggestions'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/patient-intelligence/${orgId}/analyses/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'analyses', orgId] })
      if (selectedAnalysisId) setSelectedAnalysisId(null)
      addToast({ type: 'success', title: isAr ? 'تم الحذف' : 'Deleted' })
    },
  })

  /* ─── Upload handler ─── */

  const handleUpload = useCallback(
    async (file: File) => {
      if (!orgId) return
      const validTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ]
      if (!validTypes.includes(file.type) && !file.name.match(/\.(csv|xlsx|xls)$/i)) {
        addToast({
          type: 'error',
          title: isAr ? 'صيغة غير مدعومة' : 'Unsupported format',
          message: isAr ? 'يرجى رفع ملف CSV أو Excel' : 'Please upload a CSV or Excel file',
        })
        return
      }

      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await api.post(
          `/api/patient-intelligence/${orgId}/upload`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        )
        const newId = res.data?.data?.id || res.data?.id
        if (newId) setSelectedAnalysisId(newId)
        queryClient.invalidateQueries({ queryKey: ['patient-intelligence', 'analyses', orgId] })
        addToast({
          type: 'success',
          title: isAr ? 'تم رفع الملف بنجاح' : 'File uploaded successfully',
        })
      } catch {
        addToast({
          type: 'error',
          title: isAr ? 'فشل رفع الملف' : 'Upload failed',
        })
      } finally {
        setUploading(false)
      }
    },
    [orgId, isAr, addToast, queryClient]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleUpload(file)
    },
    [handleUpload]
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleUpload(file)
      e.target.value = ''
    },
    [handleUpload]
  )

  /* ─── Dialog handlers ─── */

  const handleApproveClick = (s: Suggestion) => {
    setDialogSuggestion(s)
    setDialogMode('approve')
  }

  const handleEditClick = (s: Suggestion) => {
    setDialogSuggestion(s)
    setDialogMode('edit')
  }

  const handleSkipClick = (s: Suggestion) => {
    rejectMutation.mutate(s.id)
  }

  const handleDialogConfirm = (data: {
    messageScriptAr: string
    messageScriptEn: string
    channel: string[]
  }) => {
    if (!dialogSuggestion) return
    const payload = { id: dialogSuggestion.id, ...data }
    if (dialogMode === 'approve') {
      approveMutation.mutate(payload)
    } else {
      editMutation.mutate(payload)
    }
  }

  /* ─── Elapsed time helper ─── */
  const getElapsed = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
    if (diff < 60) return `${diff}s`
    const mins = Math.floor(diff / 60)
    const secs = diff % 60
    return `${mins}m ${secs}s`
  }

  /* ─── Render helpers ─── */

  // Loading
  if (analysesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" text={isAr ? 'جاري التحميل...' : 'Loading...'} />
      </div>
    )
  }

  const hasAnalyses = analyses && analyses.length > 0
  const isComplete = currentAnalysis?.status === 'completed'
  const isFailed = currentAnalysis?.status === 'failed'
  const pendingSuggestions = suggestions?.filter((s) => s.status === 'pending') || []
  const approvedSuggestions = suggestions?.filter((s) => s.status === 'approved') || []

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Brain className="h-7 w-7 text-primary-600" />
            {isAr ? 'حملات ذكية' : 'Smart Campaigns'}
          </h1>
          <p className="text-healthcare-muted mt-1">
            {isAr
              ? 'ارفع بيانات المرضى واحصل على اقتراحات حملات ذكية تلقائيا'
              : 'Upload patient data and get AI-powered campaign suggestions automatically'}
          </p>
        </div>
        {hasAnalyses && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {isAr ? 'رفع ملف جديد' : 'Upload New File'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFileChange}
          className="hidden"
        />
      </div>

      {/* ═══ EMPTY STATE ═══ */}
      {!hasAnalyses && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={cn(
            'relative rounded-2xl border-2 border-dashed p-12 text-center transition-all',
            dragOver
              ? 'border-primary-400 bg-primary-50'
              : 'border-gray-300 bg-white hover:border-primary-300 hover:bg-gray-50'
          )}
        >
          {uploading ? (
            <LoadingSpinner size="lg" text={isAr ? 'جاري رفع الملف...' : 'Uploading...'} />
          ) : (
            <>
              <div className="mx-auto w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center mb-5">
                <FileSpreadsheet className="h-8 w-8 text-primary-600" />
              </div>
              <h2 className="text-xl font-heading font-semibold text-healthcare-text mb-2">
                {isAr ? 'ارفع بيانات المرضى' : 'Upload Patient Data'}
              </h2>
              <p className="text-sm text-gray-500 max-w-md mx-auto mb-6 leading-relaxed">
                {isAr
                  ? 'ارفع ملف CSV أو Excel يحتوي على بيانات المرضى. سيقوم الذكاء الاصطناعي بتحليل البيانات واقتراح حملات تسويقية مخصصة لكل شريحة.'
                  : 'Upload a CSV or Excel file with patient data. AI will analyze the data and suggest personalized campaigns for each segment.'}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl font-medium transition-colors"
              >
                <Upload className="h-5 w-5" />
                {isAr ? 'اختر ملف' : 'Choose File'}
              </button>
              <p className="text-xs text-gray-400 mt-3">
                {isAr ? 'أو اسحب الملف وأفلته هنا — CSV, XLSX' : 'Or drag and drop here — CSV, XLSX'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ═══ PROCESSING STATE ═══ */}
      {hasAnalyses && currentAnalysis && isProcessing && (
        <div className="card p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary-600 animate-pulse" />
            </div>
            <div>
              <h2 className="font-heading font-semibold text-healthcare-text">
                {isAr ? 'جاري التحليل...' : 'Analyzing...'}
              </h2>
              <p className="text-xs text-gray-500">
                {currentAnalysis.fileName} &middot; {getElapsed(currentAnalysis.createdAt)}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-3 bg-gray-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-500"
              style={{ width: `${currentAnalysis.progress || 5}%` }}
            />
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {STEP_ORDER.map((step, idx) => {
              const stepIdx = STEP_ORDER.indexOf(currentAnalysis.status)
              const thisIdx = idx
              const isDone = thisIdx < stepIdx
              const isCurrent = step === currentAnalysis.status
              const label = STEP_LABELS[step] || { ar: step, en: step }

              return (
                <div key={step} className="flex items-center gap-1 shrink-0">
                  {idx > 0 && (
                    <div
                      className={cn(
                        'w-8 h-0.5 rounded-full',
                        isDone ? 'bg-primary-400' : 'bg-gray-200'
                      )}
                    />
                  )}
                  <div className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                        isDone
                          ? 'bg-primary-500 text-white'
                          : isCurrent
                            ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-300'
                            : 'bg-gray-100 text-gray-400'
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <span
                      className={cn(
                        'text-xs whitespace-nowrap',
                        isCurrent ? 'text-primary-700 font-medium' : 'text-gray-400'
                      )}
                    >
                      {isAr ? label.ar : label.en}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Current step detail */}
          {currentAnalysis.currentStep && (
            <p className="text-xs text-gray-500 mt-3 animate-pulse">
              {currentAnalysis.currentStep}
            </p>
          )}
        </div>
      )}

      {/* ═══ FAILED STATE ═══ */}
      {hasAnalyses && currentAnalysis && isFailed && (
        <div className="card p-6 border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-6 w-6 text-red-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-red-800">
                {isAr ? 'فشل التحليل' : 'Analysis Failed'}
              </h3>
              <p className="text-sm text-red-600 mt-1">
                {currentAnalysis.error ||
                  (isAr
                    ? 'حدث خطأ أثناء تحليل الملف. حاول رفع الملف مرة أخرى.'
                    : 'An error occurred while analyzing the file. Try uploading again.')}
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 text-sm font-medium text-red-700 hover:text-red-800 underline"
              >
                {isAr ? 'رفع ملف جديد' : 'Upload a new file'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RESULTS STATE ═══ */}
      {hasAnalyses && currentAnalysis && isComplete && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              value={(currentAnalysis.totalPatients ?? 0).toLocaleString()}
              label={isAr ? 'إجمالي المرضى' : 'Total Patients'}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <StatCard
              icon={Target}
              value={(currentAnalysis.patientsAnalyzed ?? 0).toLocaleString()}
              label={isAr ? 'تم تحليلهم' : 'Analyzed'}
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <StatCard
              icon={Sparkles}
              value={currentAnalysis.suggestionsCount ?? 0}
              label={isAr ? 'اقتراحات الحملات' : 'Campaign Suggestions'}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
            <StatCard
              icon={CheckCircle2}
              value={approvedSuggestions.length}
              label={isAr ? 'حملات تمت الموافقة' : 'Approved Campaigns'}
              iconBg="bg-emerald-100"
              iconColor="text-emerald-600"
            />
          </div>

          {/* File info bar */}
          <div className="flex items-center gap-4 text-xs text-gray-500 px-1">
            <span className="flex items-center gap-1">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {currentAnalysis.fileName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(currentAnalysis.createdAt)}
            </span>
            <button
              onClick={() => {
                if (confirm(isAr ? 'هل تريد حذف هذا التحليل؟' : 'Delete this analysis?')) {
                  deleteMutation.mutate(currentAnalysis.id)
                }
              }}
              className="ms-auto flex items-center gap-1 text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isAr ? 'حذف' : 'Delete'}
            </button>
          </div>

          {/* ─── Suggestion cards ─── */}
          {pendingSuggestions.length > 0 && (
            <section>
              <h2 className="text-lg font-heading font-semibold text-healthcare-text mb-4">
                {isAr ? 'اقتراحات تنتظر المراجعة' : 'Suggestions Awaiting Review'}
                <span className="ms-2 text-sm font-normal text-gray-500">
                  ({pendingSuggestions.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {pendingSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    isAr={isAr}
                    onApprove={handleApproveClick}
                    onEdit={handleEditClick}
                    onSkip={handleSkipClick}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Approved suggestions */}
          {approvedSuggestions.length > 0 && (
            <section>
              <h2 className="text-lg font-heading font-semibold text-healthcare-text mb-4">
                {isAr ? 'حملات تمت الموافقة عليها' : 'Approved Campaigns'}
                <span className="ms-2 text-sm font-normal text-gray-500">
                  ({approvedSuggestions.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {approvedSuggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    isAr={isAr}
                    onApprove={handleApproveClick}
                    onEdit={handleEditClick}
                    onSkip={handleSkipClick}
                  />
                ))}
              </div>
            </section>
          )}

          {/* No suggestions yet */}
          {suggestions && suggestions.length === 0 && (
            <div className="card p-8 text-center">
              <Sparkles className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">
                {isAr
                  ? 'لم يتم العثور على اقتراحات لهذا التحليل'
                  : 'No suggestions found for this analysis'}
              </p>
            </div>
          )}

          {/* ─── Patient Table (expandable) ─── */}
          <section>
            <button
              onClick={() => setShowPatients(!showPatients)}
              className="flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors mb-3"
            >
              {showPatients ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {isAr ? 'عرض بيانات المرضى' : 'View Patient Data'}
              <span className="text-gray-400 font-normal">
                ({currentAnalysis.totalPatients})
              </span>
            </button>

            {showPatients && (
              <div className="card overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="text-start px-4 py-3 font-medium">
                          {isAr ? 'الاسم' : 'Name'}
                        </th>
                        <th className="text-start px-4 py-3 font-medium">
                          {isAr ? 'الهاتف' : 'Phone'}
                        </th>
                        <th className="text-start px-4 py-3 font-medium">
                          {isAr ? 'آخر زيارة' : 'Last Visit'}
                        </th>
                        <th className="text-start px-4 py-3 font-medium">
                          {isAr ? 'الخدمات المطابقة' : 'Matched Services'}
                        </th>
                        <th className="text-start px-4 py-3 font-medium">
                          {isAr ? 'درجة الخطر' : 'Risk'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {patientsData?.patients?.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-healthcare-text">
                            {isAr ? p.nameAr || p.name : p.name}
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                            {p.phone}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {p.lastVisit ? formatDate(p.lastVisit) : '--'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {p.matchedServices?.slice(0, 3).map((svc, i) => (
                                <span
                                  key={i}
                                  className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full"
                                >
                                  {svc}
                                </span>
                              ))}
                              {(p.matchedServices?.length || 0) > 3 && (
                                <span className="text-xs text-gray-400">
                                  +{p.matchedServices.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {p.riskScore != null && (
                              <div className="flex items-center gap-2">
                                <div className="w-12 h-1.5 bg-gray-100 rounded-full">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      p.riskScore > 70
                                        ? 'bg-red-500'
                                        : p.riskScore > 40
                                          ? 'bg-amber-500'
                                          : 'bg-green-500'
                                    )}
                                    style={{ width: `${p.riskScore}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">{p.riskScore}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan={5} className="text-center py-8 text-gray-400">
                            <LoadingSpinner size="sm" />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {patientsData && patientsData.total > 20 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      {isAr ? 'صفحة' : 'Page'} {patientsPage}{' '}
                      {isAr ? 'من' : 'of'} {Math.ceil(patientsData.total / 20)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPatientsPage((p) => Math.max(1, p - 1))}
                        disabled={patientsPage <= 1}
                        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                      >
                        {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setPatientsPage((p) => p + 1)}
                        disabled={patientsPage >= Math.ceil(patientsData.total / 20)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-colors"
                      >
                        {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══ PAST ANALYSES ═══ */}
      {analyses && analyses.length > 1 && (
        <section>
          <button
            onClick={() => setShowPastAnalyses(!showPastAnalyses)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            {showPastAnalyses ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            {isAr ? 'التحليلات السابقة' : 'Past Analyses'}
            <span className="text-gray-400 font-normal">({analyses.length})</span>
          </button>

          {showPastAnalyses && (
            <div className="mt-3 space-y-2 animate-fade-in">
              {analyses.map((a) => {
                const isSelected = a.id === currentAnalysis?.id
                const statusLabel = STEP_LABELS[a.status] || { ar: a.status, en: a.status }
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedAnalysisId(a.id)
                      setPatientsPage(1)
                      setShowPatients(false)
                    }}
                    className={cn(
                      'w-full text-start card p-4 flex items-center gap-4 transition-all hover:shadow-card-hover',
                      isSelected && 'ring-2 ring-primary-300'
                    )}
                  >
                    <div
                      className={cn(
                        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                        a.status === 'completed'
                          ? 'bg-green-100'
                          : a.status === 'failed'
                            ? 'bg-red-100'
                            : 'bg-primary-100'
                      )}
                    >
                      {a.status === 'completed' ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-green-600" />
                      ) : a.status === 'failed' ? (
                        <AlertCircle className="h-4.5 w-4.5 text-red-500" />
                      ) : (
                        <Brain className="h-4.5 w-4.5 text-primary-600 animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-healthcare-text truncate">
                        {a.fileName}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(a.createdAt)} &middot;{' '}
                        {isAr ? statusLabel.ar : statusLabel.en}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-semibold text-healthcare-text">
                        {(a.totalPatients ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-400">
                        {isAr ? 'مريض' : 'patients'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══ APPROVAL DIALOG ═══ */}
      {dialogSuggestion && (
        <ApprovalDialog
          suggestion={dialogSuggestion}
          isAr={isAr}
          mode={dialogMode}
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialogSuggestion(null)}
        />
      )}
    </div>
  )
}
