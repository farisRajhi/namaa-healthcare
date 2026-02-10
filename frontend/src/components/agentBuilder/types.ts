// ═══════════════════════════════════════════════
// Agent Builder Flow Types — Unified type system
// ═══════════════════════════════════════════════

// ─── Node Types ───
export type FlowNodeType =
  | 'start'
  | 'message'
  | 'question'
  | 'condition'
  | 'aiResponse'
  | 'apiCall'
  | 'setVariable'
  | 'transfer'
  | 'wait'
  | 'end'

// ─── Shared Sub-types ───
export interface QuickReplyButton {
  id: string
  label: string
  value: string
}

export interface ConditionBranch {
  id: string
  label: string
  operator: string
  value: string
}

export interface ApiParam {
  id: string
  name: string
  value: string
  isVariable: boolean
}

// ─── Per-node Data Interfaces ───
export interface StartNodeData {
  [key: string]: unknown
  type: 'start'
  label: string
  greetingAr: string
  greetingEn: string
}

export interface MessageNodeData {
  [key: string]: unknown
  type: 'message'
  label: string
  messageText: string
  quickReplies: QuickReplyButton[]
}

export interface QuestionNodeData {
  [key: string]: unknown
  type: 'question'
  label: string
  questionText: string
  variableName: string
  validation: string
}

export interface ConditionNodeData {
  [key: string]: unknown
  type: 'condition'
  label: string
  conditionType: string
  field: string
  branches: ConditionBranch[]
}

export interface AiResponseNodeData {
  [key: string]: unknown
  type: 'aiResponse'
  label: string
  systemPrompt: string
}

export interface ApiCallNodeData {
  [key: string]: unknown
  type: 'apiCall'
  label: string
  action: string
  params: ApiParam[]
}

export interface SetVariableNodeData {
  [key: string]: unknown
  type: 'setVariable'
  label: string
  key: string
  value: string
}

export interface TransferNodeData {
  [key: string]: unknown
  type: 'transfer'
  label: string
  department: string
  reason: string
}

export interface WaitNodeData {
  [key: string]: unknown
  type: 'wait'
  label: string
  waitType: 'timer' | 'event'
  waitDurationMs: number
  waitEvent: string
}

export interface EndNodeData {
  [key: string]: unknown
  type: 'end'
  label: string
  closingMessage: string
}

// ─── Union type for all node data ───
export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | QuestionNodeData
  | ConditionNodeData
  | AiResponseNodeData
  | ApiCallNodeData
  | SetVariableNodeData
  | TransferNodeData
  | WaitNodeData
  | EndNodeData

// ─── Node Palette Definition ───
export interface NodePaletteItem {
  type: FlowNodeType
  label: string
  description: string
  icon: string
  color: string
}

export const NODE_PALETTE: NodePaletteItem[] = [
  { type: 'start', label: 'بداية', description: 'نقطة بداية المحادثة', icon: 'Play', color: '#22c55e' },
  { type: 'message', label: 'رسالة', description: 'إرسال رسالة للمستخدم', icon: 'MessageSquare', color: '#3b82f6' },
  { type: 'question', label: 'سؤال', description: 'طرح سؤال وحفظ الإجابة', icon: 'HelpCircle', color: '#a855f7' },
  { type: 'condition', label: 'شرط', description: 'تفريع حسب الشروط', icon: 'GitBranch', color: '#f97316' },
  { type: 'aiResponse', label: 'رد ذكي', description: 'رد تلقائي بالذكاء الاصطناعي', icon: 'Brain', color: '#14b8a6' },
  { type: 'apiCall', label: 'استدعاء API', description: 'استدعاء خدمة خارجية', icon: 'Globe', color: '#6b7280' },
  { type: 'setVariable', label: 'متغير', description: 'تعيين قيمة متغير', icon: 'Variable', color: '#78716c' },
  { type: 'transfer', label: 'تحويل', description: 'تحويل لموظف بشري', icon: 'PhoneForwarded', color: '#ef4444' },
  { type: 'wait', label: 'انتظار', description: 'انتظار مؤقت أو حدث خارجي', icon: 'Clock', color: '#d97706' },
  { type: 'end', label: 'نهاية', description: 'إنهاء المحادثة', icon: 'Square', color: '#dc2626' },
]

// ─── Flow Structure (for editor canvas, using @xyflow/react) ───
export interface FlowNodePosition {
  x: number
  y: number
}

export interface FlowNode {
  id: string
  type: string
  position: FlowNodePosition
  data: FlowNodeData
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  label?: string
}

// ─── Flow Draft / Definition ───
export interface FlowDraft {
  id: string
  name: string
  description: string
  status: 'draft' | 'published'
  nodes: FlowNode[]
  edges: FlowEdge[]
  createdAt: string
  updatedAt: string
}

export interface FlowDefinition {
  id?: string
  name: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  status?: 'draft' | 'published' | 'archived'
}

// ─── Simulator Types ───
export interface SimMessage {
  id: string
  sender: 'bot' | 'user'
  content: string
  buttons?: QuickReplyButton[]
  nodeId?: string
  timestamp: number
}

export interface SimState {
  currentNodeId: string | null
  variables: Record<string, string>
  messages: SimMessage[]
  pathHistory: string[]
  isComplete: boolean
  waitingForInput: boolean
}

// ─── Analytics Types ───
export interface FlowAnalyticsData {
  totalSessions: number
  completionRate: number
  averageSteps: number
  transferRate: number
  dropOffPoints: { nodeId: string; nodeLabel: string; count: number; percentage: number }[]
  popularPaths: { path: string[]; count: number; percentage: number }[]
  sessionsOverTime: { date: string; count: number }[]
  completionBreakdown: { name: string; value: number; color: string }[]
}

// ─── Helper: Default Node Data Factory ───
export function getDefaultNodeData(type: FlowNodeType): FlowNodeData {
  switch (type) {
    case 'start':
      return { type: 'start', label: 'بداية', greetingAr: 'مرحباً! كيف أقدر أساعدك؟', greetingEn: 'Hello! How can I help you?' }
    case 'message':
      return { type: 'message', label: 'رسالة', messageText: '', quickReplies: [] }
    case 'question':
      return { type: 'question', label: 'سؤال', questionText: '', variableName: '', validation: '' }
    case 'condition':
      return { type: 'condition', label: 'شرط', conditionType: 'keyword', field: '', branches: [{ id: '1', label: 'نعم', operator: 'equals', value: '' }, { id: '2', label: 'لا', operator: 'equals', value: '' }] }
    case 'aiResponse':
      return { type: 'aiResponse', label: 'رد ذكي', systemPrompt: '' }
    case 'apiCall':
      return { type: 'apiCall', label: 'استدعاء API', action: 'check_availability', params: [] }
    case 'setVariable':
      return { type: 'setVariable', label: 'متغير', key: '', value: '' }
    case 'transfer':
      return { type: 'transfer', label: 'تحويل', department: '', reason: '' }
    case 'wait':
      return { type: 'wait', label: 'انتظار', waitType: 'timer', waitDurationMs: 0, waitEvent: '' }
    case 'end':
      return { type: 'end', label: 'نهاية', closingMessage: 'شكراً لتواصلك معنا!' }
  }
}

// ─── Template Types ───
export interface FlowTemplate {
  id: string
  name: string
  icon: string
  description: string
  stepCount: number
  features: string[]
  flow: FlowDefinition
}
