import { useCallback } from 'react'
import {
  X,
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Sparkles,
  Globe,
  Variable,
  PhoneForwarded,
  Square,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Node } from '@xyflow/react'
import type {
  FlowNodeData,
  StartNodeData,
  MessageNodeData,
  QuestionNodeData,
  ConditionNodeData,
  AiResponseNodeData,
  ApiCallNodeData,
  SetVariableNodeData,
  TransferNodeData,
  EndNodeData,
  QuickReplyButton,
  ConditionBranch,
  ApiParam,
} from './types'

interface PropertiesPanelProps {
  selectedNode: Node<FlowNodeData> | null
  onUpdateNode: (nodeId: string, data: FlowNodeData) => void
  onClose: () => void
}

// Icon mapping
const typeIcons: Record<string, React.ElementType> = {
  start: Play,
  message: MessageSquare,
  question: HelpCircle,
  condition: GitBranch,
  aiResponse: Sparkles,
  apiCall: Globe,
  setVariable: Variable,
  transfer: PhoneForwarded,
  end: Square,
}

const typeLabels: Record<string, string> = {
  start: 'بداية',
  message: 'رسالة',
  question: 'سؤال',
  condition: 'شرط',
  aiResponse: 'رد ذكي',
  apiCall: 'استدعاء API',
  setVariable: 'متغير',
  transfer: 'تحويل',
  end: 'نهاية',
}

const typeColors: Record<string, string> = {
  start: 'bg-green-500',
  message: 'bg-blue-500',
  question: 'bg-purple-500',
  condition: 'bg-orange-500',
  aiResponse: 'bg-teal-500',
  apiCall: 'bg-gray-500',
  setVariable: 'bg-stone-500',
  transfer: 'bg-red-500',
  end: 'bg-red-600',
}

function generateId() {
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function PropertiesPanel({ selectedNode, onUpdateNode, onClose }: PropertiesPanelProps) {
  const updateData = useCallback(
    (partial: Partial<FlowNodeData>) => {
      if (!selectedNode) return
      onUpdateNode(selectedNode.id, { ...selectedNode.data, ...partial } as FlowNodeData)
    },
    [selectedNode, onUpdateNode]
  )

  if (!selectedNode) {
    return (
      <div className="w-80 border-s border-gray-200 bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <MessageSquare className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-sm text-gray-500 font-medium">اختر عنصراً لتعديل خصائصه</p>
        <p className="text-xs text-gray-400 mt-1">اضغط على أي عقدة في اللوحة</p>
      </div>
    )
  }

  const nodeData = selectedNode.data
  const nodeType = nodeData.type
  const Icon = typeIcons[nodeType] || MessageSquare

  return (
    <div className="w-80 border-s border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className={`w-8 h-8 rounded-lg ${typeColors[nodeType]} flex items-center justify-center flex-shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{typeLabels[nodeType]}</p>
          <p className="text-[10px] text-gray-400">ID: {selectedNode.id}</p>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" dir="rtl">
        {/* Label field (for all) */}
        <FieldGroup label="اسم العنصر">
          <input
            type="text"
            className="field-input"
            value={nodeData.label}
            onChange={(e) => updateData({ label: e.target.value })}
          />
        </FieldGroup>

        {/* Type-specific fields */}
        {nodeType === 'start' && <StartFields data={nodeData as StartNodeData} onChange={updateData} />}
        {nodeType === 'message' && <MessageFields data={nodeData as MessageNodeData} onChange={updateData} />}
        {nodeType === 'question' && <QuestionFields data={nodeData as QuestionNodeData} onChange={updateData} />}
        {nodeType === 'condition' && <ConditionFields data={nodeData as ConditionNodeData} onChange={updateData} />}
        {nodeType === 'aiResponse' && <AiResponseFields data={nodeData as AiResponseNodeData} onChange={updateData} />}
        {nodeType === 'apiCall' && <ApiCallFields data={nodeData as ApiCallNodeData} onChange={updateData} />}
        {nodeType === 'setVariable' && <SetVariableFields data={nodeData as SetVariableNodeData} onChange={updateData} />}
        {nodeType === 'transfer' && <TransferFields data={nodeData as TransferNodeData} onChange={updateData} />}
        {nodeType === 'end' && <EndFields data={nodeData as EndNodeData} onChange={updateData} />}
      </div>
    </div>
  )
}

// Shared field group component
function FieldGroup({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}

// ─── Type-specific field components ───────────────────────────────

function StartFields({ data, onChange }: { data: StartNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <FieldGroup label="رسالة الترحيب (عربي)">
        <textarea
          className="field-textarea"
          rows={3}
          value={data.greetingAr}
          onChange={(e) => onChange({ greetingAr: e.target.value } as Partial<StartNodeData>)}
        />
      </FieldGroup>
      <FieldGroup label="رسالة الترحيب (English)">
        <textarea
          className="field-textarea"
          rows={3}
          dir="ltr"
          value={data.greetingEn}
          onChange={(e) => onChange({ greetingEn: e.target.value } as Partial<StartNodeData>)}
        />
      </FieldGroup>
    </>
  )
}

function MessageFields({ data, onChange }: { data: MessageNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  const addQuickReply = () => {
    const newBtn: QuickReplyButton = { id: generateId(), label: '', value: '' }
    onChange({ quickReplies: [...data.quickReplies, newBtn] } as Partial<MessageNodeData>)
  }

  const removeQuickReply = (id: string) => {
    onChange({ quickReplies: data.quickReplies.filter((b) => b.id !== id) } as Partial<MessageNodeData>)
  }

  const updateQuickReply = (id: string, field: keyof QuickReplyButton, value: string) => {
    onChange({
      quickReplies: data.quickReplies.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    } as Partial<MessageNodeData>)
  }

  return (
    <>
      <FieldGroup label="نص الرسالة">
        <textarea
          className="field-textarea"
          rows={4}
          placeholder="اكتب الرسالة التي ستظهر للمستخدم..."
          value={data.messageText}
          onChange={(e) => onChange({ messageText: e.target.value } as Partial<MessageNodeData>)}
        />
      </FieldGroup>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">أزرار الرد السريع</span>
          <button
            onClick={addQuickReply}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3 h-3" />
            إضافة
          </button>
        </div>
        {data.quickReplies.map((btn) => (
          <div key={btn.id} className="flex gap-2 items-start bg-gray-50 rounded-lg p-2">
            <div className="flex-1 space-y-1">
              <input
                type="text"
                className="field-input text-xs"
                placeholder="العنوان"
                value={btn.label}
                onChange={(e) => updateQuickReply(btn.id, 'label', e.target.value)}
              />
              <input
                type="text"
                className="field-input text-xs"
                placeholder="القيمة"
                dir="ltr"
                value={btn.value}
                onChange={(e) => updateQuickReply(btn.id, 'value', e.target.value)}
              />
            </div>
            <button
              onClick={() => removeQuickReply(btn.id)}
              className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600 mt-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  )
}

function QuestionFields({ data, onChange }: { data: QuestionNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <FieldGroup label="نص السؤال">
        <textarea
          className="field-textarea"
          rows={3}
          placeholder="ما هو اسمك الكريم؟"
          value={data.questionText}
          onChange={(e) => onChange({ questionText: e.target.value } as Partial<QuestionNodeData>)}
        />
      </FieldGroup>

      <FieldGroup label="اسم المتغير" hint="سيتم حفظ الإجابة في هذا المتغير">
        <input
          type="text"
          className="field-input font-mono"
          dir="ltr"
          placeholder="patient_name"
          value={data.variableName}
          onChange={(e) => onChange({ variableName: e.target.value } as Partial<QuestionNodeData>)}
        />
      </FieldGroup>

      <FieldGroup label="نوع التحقق">
        <select
          className="field-input"
          value={data.validation}
          onChange={(e) => onChange({ validation: e.target.value } as Partial<QuestionNodeData>)}
        >
          <option value="none">بدون تحقق</option>
          <option value="phone">رقم هاتف</option>
          <option value="email">بريد إلكتروني</option>
          <option value="number">رقم</option>
          <option value="date">تاريخ</option>
          <option value="name">اسم</option>
        </select>
      </FieldGroup>
    </>
  )
}

function ConditionFields({ data, onChange }: { data: ConditionNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  const addBranch = () => {
    const newBranch: ConditionBranch = {
      id: generateId(),
      label: `فرع ${data.branches.length + 1}`,
      operator: 'equals',
      value: '',
    }
    onChange({ branches: [...data.branches, newBranch] } as Partial<ConditionNodeData>)
  }

  const removeBranch = (id: string) => {
    if (data.branches.length <= 2) return // minimum 2 branches
    onChange({ branches: data.branches.filter((b) => b.id !== id) } as Partial<ConditionNodeData>)
  }

  const updateBranch = (id: string, field: keyof ConditionBranch, value: string) => {
    onChange({
      branches: data.branches.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    } as Partial<ConditionNodeData>)
  }

  return (
    <>
      <FieldGroup label="نوع الشرط">
        <select
          className="field-input"
          value={data.conditionType}
          onChange={(e) => onChange({ conditionType: e.target.value } as Partial<ConditionNodeData>)}
        >
          <option value="intent">نية (Intent)</option>
          <option value="keyword">كلمة مفتاحية</option>
          <option value="variable">متغير</option>
          <option value="contains">يحتوي على</option>
        </select>
      </FieldGroup>

      <FieldGroup label="الحقل" hint="المتغير أو الحقل المراد فحصه">
        <input
          type="text"
          className="field-input font-mono"
          dir="ltr"
          placeholder="user_input"
          value={data.field}
          onChange={(e) => onChange({ field: e.target.value } as Partial<ConditionNodeData>)}
        />
      </FieldGroup>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">الفروع</span>
          <button
            onClick={addBranch}
            className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-700 font-medium"
          >
            <Plus className="w-3 h-3" />
            إضافة فرع
          </button>
        </div>
        {data.branches.map((branch) => (
          <div key={branch.id} className="bg-orange-50 rounded-lg p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="field-input text-xs flex-1"
                placeholder="اسم الفرع"
                value={branch.label}
                onChange={(e) => updateBranch(branch.id, 'label', e.target.value)}
              />
              {data.branches.length > 2 && (
                <button
                  onClick={() => removeBranch(branch.id)}
                  className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1">
              <select
                className="field-input text-xs flex-1"
                value={branch.operator}
                onChange={(e) => updateBranch(branch.id, 'operator', e.target.value)}
              >
                <option value="equals">يساوي</option>
                <option value="not_equals">لا يساوي</option>
                <option value="contains">يحتوي</option>
                <option value="starts_with">يبدأ بـ</option>
                <option value="greater_than">أكبر من</option>
                <option value="less_than">أصغر من</option>
              </select>
              <input
                type="text"
                className="field-input text-xs flex-1"
                dir="ltr"
                placeholder="القيمة"
                value={branch.value}
                onChange={(e) => updateBranch(branch.id, 'value', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function AiResponseFields({ data, onChange }: { data: AiResponseNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <FieldGroup label="تعليمات إضافية للذكاء الاصطناعي" hint="أضف تعليمات خاصة لتوجيه رد الذكاء الاصطناعي">
      <textarea
        className="field-textarea"
        rows={6}
        placeholder="أجب بلطف وباللغة العربية. ركز على المعلومات الطبية المتعلقة بالعيادة..."
        value={data.systemPrompt}
        onChange={(e) => onChange({ systemPrompt: e.target.value } as Partial<AiResponseNodeData>)}
      />
    </FieldGroup>
  )
}

function ApiCallFields({ data, onChange }: { data: ApiCallNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  const addParam = () => {
    const newParam: ApiParam = { id: generateId(), name: '', value: '', isVariable: false }
    onChange({ params: [...data.params, newParam] } as Partial<ApiCallNodeData>)
  }

  const removeParam = (id: string) => {
    onChange({ params: data.params.filter((p) => p.id !== id) } as Partial<ApiCallNodeData>)
  }

  const updateParam = (id: string, field: keyof ApiParam, value: string | boolean) => {
    onChange({
      params: data.params.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    } as Partial<ApiCallNodeData>)
  }

  return (
    <>
      <FieldGroup label="الإجراء">
        <select
          className="field-input"
          value={data.action}
          onChange={(e) => onChange({ action: e.target.value } as Partial<ApiCallNodeData>)}
        >
          <option value="">اختر الإجراء...</option>
          <option value="book_appointment">حجز موعد</option>
          <option value="check_availability">التحقق من التوفر</option>
          <option value="search_faq">بحث FAQ</option>
          <option value="refill_prescription">إعادة صرف وصفة</option>
          <option value="get_patient_info">بيانات المريض</option>
          <option value="cancel_appointment">إلغاء موعد</option>
        </select>
      </FieldGroup>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">المعاملات</span>
          <button
            onClick={addParam}
            className="flex items-center gap-1 text-[10px] text-gray-600 hover:text-gray-700 font-medium"
          >
            <Plus className="w-3 h-3" />
            إضافة
          </button>
        </div>
        {data.params.map((param) => (
          <div key={param.id} className="bg-gray-50 rounded-lg p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="field-input text-xs flex-1 font-mono"
                dir="ltr"
                placeholder="اسم المعامل"
                value={param.name}
                onChange={(e) => updateParam(param.id, 'name', e.target.value)}
              />
              <button
                onClick={() => removeParam(param.id)}
                className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="text"
                className="field-input text-xs flex-1"
                dir="ltr"
                placeholder={param.isVariable ? '{{variable_name}}' : 'قيمة ثابتة'}
                value={param.value}
                onChange={(e) => updateParam(param.id, 'value', e.target.value)}
              />
              <label className="flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={param.isVariable}
                  onChange={(e) => updateParam(param.id, 'isVariable', e.target.checked)}
                  className="rounded border-gray-300 text-teal-500 focus:ring-teal-500 w-3 h-3"
                />
                متغير
              </label>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SetVariableFields({ data, onChange }: { data: SetVariableNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <FieldGroup label="اسم المتغير (Key)">
        <input
          type="text"
          className="field-input font-mono"
          dir="ltr"
          placeholder="variable_name"
          value={data.key}
          onChange={(e) => onChange({ key: e.target.value } as Partial<SetVariableNodeData>)}
        />
      </FieldGroup>
      <FieldGroup label="القيمة (Value)" hint="يمكنك استخدام {{متغير}} للإشارة إلى متغير آخر">
        <input
          type="text"
          className="field-input"
          placeholder="{{patient_name}} أو قيمة ثابتة"
          value={data.value}
          onChange={(e) => onChange({ value: e.target.value } as Partial<SetVariableNodeData>)}
        />
      </FieldGroup>
    </>
  )
}

function TransferFields({ data, onChange }: { data: TransferNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <>
      <FieldGroup label="القسم">
        <select
          className="field-input"
          value={data.department}
          onChange={(e) => onChange({ department: e.target.value } as Partial<TransferNodeData>)}
        >
          <option value="">اختر القسم...</option>
          <option value="reception">الاستقبال</option>
          <option value="pharmacy">الصيدلية</option>
          <option value="lab">المختبر</option>
          <option value="radiology">الأشعة</option>
          <option value="emergency">الطوارئ</option>
          <option value="billing">المحاسبة</option>
          <option value="support">الدعم الفني</option>
        </select>
      </FieldGroup>
      <FieldGroup label="سبب التحويل">
        <textarea
          className="field-textarea"
          rows={3}
          placeholder="يحتاج المريض إلى مساعدة متخصصة..."
          value={data.reason}
          onChange={(e) => onChange({ reason: e.target.value } as Partial<TransferNodeData>)}
        />
      </FieldGroup>
    </>
  )
}

function EndFields({ data, onChange }: { data: EndNodeData; onChange: (p: Partial<FlowNodeData>) => void }) {
  return (
    <FieldGroup label="رسالة الوداع">
      <textarea
        className="field-textarea"
        rows={3}
        placeholder="شكراً لك! نتمنى لك يوماً سعيداً."
        value={data.closingMessage}
        onChange={(e) => onChange({ closingMessage: e.target.value } as Partial<EndNodeData>)}
      />
    </FieldGroup>
  )
}
