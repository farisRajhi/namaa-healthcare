// ─────────────────────────────────────────────────────────
// Agent Builder — Node Type Definitions
// All possible node types in the visual no-code editor
// ─────────────────────────────────────────────────────────

export enum NodeType {
  START = 'start',              // Entry point — triggers on conversation start
  MESSAGE = 'message',          // Send a message to the patient (text, with optional buttons)
  QUESTION = 'question',        // Ask the patient something and wait for response
  CONDITION = 'condition',      // Branch based on condition (intent, keyword, variable)
  AI_RESPONSE = 'aiResponse',   // Let AI generate a free-form response with guardrails
  API_CALL = 'apiCall',         // Call an internal API (book appointment, check availability, etc.)
  SET_VARIABLE = 'setVariable', // Set a flow variable from the conversation
  TRANSFER = 'transfer',        // Transfer to human agent or department
  WAIT = 'wait',                // Wait for external event (callback, timer)
  END = 'end',                  // End the conversation
  INSTRUCTION = 'instruction',  // LLM instruction node — customizes AI behavior (not a flow step)
}

/** Categories for INSTRUCTION nodes */
export type InstructionCategory =
  | 'greeting'          // How to greet patients
  | 'tone'              // Tone and style of responses
  | 'business_rule'     // Business-specific rules the AI must follow
  | 'escalation'        // When to escalate/transfer to human
  | 'booking_flow'      // How the booking process should work
  | 'faq_override'      // Custom FAQ answers
  | 'custom'            // Free-form custom instruction

export type ConditionType = 'intent' | 'keyword' | 'variable' | 'contains'
export type ConditionOperator = 'equals' | 'contains' | 'greater' | 'less' | 'exists'

export interface ButtonOption {
  label: string
  labelAr?: string
  value: string
}

export interface ConditionData {
  type: ConditionType
  field?: string
  operator?: ConditionOperator
  value?: string
}

export interface BranchOption {
  label: string
  value: string
}

/** Data associated with each node */
export interface FlowNodeData {
  label: string
  labelAr?: string

  // MESSAGE node
  message?: string
  messageAr?: string
  buttons?: ButtonOption[]

  // QUESTION node
  question?: string
  questionAr?: string
  variableName?: string        // store answer in this variable

  // CONDITION node
  condition?: ConditionData
  branches?: BranchOption[]    // named output branches

  // AI_RESPONSE node
  aiPrompt?: string            // system prompt addition

  // API_CALL node
  apiAction?: string           // which action (book_appointment, check_availability, search_faq, etc.)
  apiParams?: Record<string, string>  // parameter mapping from variables

  // SET_VARIABLE node
  variableKey?: string
  variableValue?: string       // can reference other vars with {{varName}}

  // TRANSFER node
  department?: string
  transferReason?: string

  // WAIT node
  waitType?: 'timer' | 'event'
  waitDurationMs?: number
  waitEvent?: string

  // END node
  endMessage?: string
  endMessageAr?: string

  // INSTRUCTION node — LLM behavior customization
  instructionCategory?: InstructionCategory
  instructionText?: string       // Instruction in English
  instructionTextAr?: string     // Instruction in Arabic
  instructionPriority?: number   // Higher = more important (1-10, default 5)
}

/** A node in the visual flow */
export interface FlowNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: FlowNodeData
}

/** An edge connecting two nodes */
export interface FlowEdge {
  id: string
  source: string          // Source node ID
  target: string          // Target node ID
  sourceHandle?: string   // For condition nodes: which branch
  label?: string
}

/** Result after executing a single node */
export interface NodeResult {
  /** Messages to send to the user */
  messages: FlowMessage[]
  /** Whether the engine should wait for user input */
  waitForInput: boolean
  /** Which branch was selected (for condition nodes) */
  selectedBranch?: string
  /** Updated variables */
  variables?: Record<string, any>
  /** Session status change */
  statusChange?: 'completed' | 'transferred' | 'abandoned'
  /** Transfer details */
  transferInfo?: {
    department: string
    reason?: string
    summary?: string
  }
}

/** A message produced by the flow engine */
export interface FlowMessage {
  text: string
  textAr?: string
  buttons?: ButtonOption[]
  isAiGenerated?: boolean
}

/** Response from the flow engine after processing */
export interface FlowResponse {
  sessionId: string
  messages: FlowMessage[]
  status: 'active' | 'completed' | 'transferred' | 'abandoned' | 'waiting'
  currentNodeId: string | null
  variables: Record<string, any>
  transferInfo?: {
    department: string
    reason?: string
    summary?: string
  }
}

/** State snapshot of a flow session */
export interface FlowState {
  sessionId: string
  flowId: string
  flowName: string
  currentNodeId: string
  status: string
  variables: Record<string, any>
  history: string[]
  startedAt: Date
  completedAt: Date | null
}
