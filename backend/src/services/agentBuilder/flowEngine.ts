// ─────────────────────────────────────────────────────────
// Agent Builder — Flow Execution Engine
// Executes visual flows node-by-node, handling branching,
// variable substitution, API calls, and AI responses.
// ─────────────────────────────────────────────────────────

import { PrismaClient, AgentFlow, AgentFlowSession } from '@prisma/client'
import {
  NodeType,
  FlowNode,
  FlowEdge,
  FlowNodeData,
  NodeResult,
  FlowMessage,
  FlowResponse,
  FlowState,
  ConditionData,
} from './nodeTypes.js'

const MAX_STEPS = 50  // Prevent infinite loops

export class FlowEngine {
  constructor(private prisma: PrismaClient) {}

  // ────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────

  /** Start a new flow session */
  async startFlow(flowId: string, conversationId?: string): Promise<FlowResponse> {
    const flow = await this.prisma.agentFlow.findUnique({ where: { agentFlowId: flowId } })
    if (!flow) throw new Error(`Flow not found: ${flowId}`)

    const nodes = flow.nodes as unknown as FlowNode[]
    const startNode = nodes.find(n => n.type === NodeType.START)
    if (!startNode) throw new Error('Flow has no START node')

    // Create session
    const session = await this.prisma.agentFlowSession.create({
      data: {
        flowId,
        conversationId: conversationId ?? null,
        currentNodeId: startNode.id,
        variables: {},
        history: [startNode.id],
        status: 'active',
      },
    })

    // Execute from START node forward (START auto-advances)
    return this.executeFromNode(session.sessionId, flow, startNode, undefined)
  }

  /** Process user input and advance the flow */
  async processInput(sessionId: string, userMessage: string): Promise<FlowResponse> {
    const session = await this.prisma.agentFlowSession.findUnique({
      where: { sessionId },
      include: { flow: true },
    })
    if (!session) throw new Error(`Session not found: ${sessionId}`)
    if (session.status !== 'active') {
      return {
        sessionId,
        messages: [],
        status: session.status as FlowResponse['status'],
        currentNodeId: session.currentNodeId,
        variables: (session.variables as Record<string, any>) ?? {},
      }
    }

    const flow = session.flow
    const nodes = flow.nodes as unknown as FlowNode[]
    const currentNode = nodes.find(n => n.id === session.currentNodeId)
    if (!currentNode) {
      return this.endSessionWithError(session, 'Current node not found in flow')
    }

    // If current node is a QUESTION, process the answer
    if (currentNode.type === NodeType.QUESTION) {
      const variables = { ...((session.variables as Record<string, any>) ?? {}) }
      if (currentNode.data.variableName) {
        variables[currentNode.data.variableName] = userMessage
      }
      variables['_lastInput'] = userMessage

      // Update variables
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { variables },
      })

      // Advance to next node
      const nextNodeId = await this.resolveNextNode(currentNode.id, flow, { messages: [], waitForInput: false, variables })
      if (!nextNodeId) {
        return this.endSessionWithError(session, 'No next node after question')
      }

      const nextNode = nodes.find(n => n.id === nextNodeId)
      if (!nextNode) {
        return this.endSessionWithError(session, `Next node not found: ${nextNodeId}`)
      }

      // Update session to next node
      const history = [...((session.history as string[]) ?? []), nextNodeId]
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { currentNodeId: nextNodeId, history, variables },
      })

      // Reload session with updated variables
      const updatedSession = await this.prisma.agentFlowSession.findUnique({
        where: { sessionId },
        include: { flow: true },
      })

      return this.executeFromNode(sessionId, flow, nextNode, userMessage, updatedSession!)
    }

    // If current node is a WAIT, treat input as the wake-up event
    if (currentNode.type === NodeType.WAIT) {
      const nextNodeId = await this.resolveNextNode(currentNode.id, flow, { messages: [], waitForInput: false })
      if (!nextNodeId) {
        return this.endSessionWithError(session, 'No next node after wait')
      }
      const nextNode = nodes.find(n => n.id === nextNodeId)
      if (!nextNode) {
        return this.endSessionWithError(session, `Next node not found: ${nextNodeId}`)
      }
      const history = [...((session.history as string[]) ?? []), nextNodeId]
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { currentNodeId: nextNodeId, history },
      })
      return this.executeFromNode(sessionId, flow, nextNode, userMessage)
    }

    // For AI_RESPONSE nodes that are waiting for context, process input
    if (currentNode.type === NodeType.AI_RESPONSE) {
      const variables = { ...((session.variables as Record<string, any>) ?? {}), _lastInput: userMessage }
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { variables },
      })
      return this.executeFromNode(sessionId, flow, currentNode, userMessage)
    }

    // Default: try to advance based on input
    const variables = { ...((session.variables as Record<string, any>) ?? {}), _lastInput: userMessage }
    await this.prisma.agentFlowSession.update({
      where: { sessionId },
      data: { variables },
    })
    const nextNodeId = await this.resolveNextNode(currentNode.id, flow, {
      messages: [],
      waitForInput: false,
      variables,
    })
    if (!nextNodeId) {
      return {
        sessionId,
        messages: [{ text: 'I\'m not sure how to proceed. Let me transfer you to a human agent.', textAr: 'لست متأكداً كيف أتابع. دعني أحولك إلى موظف.' }],
        status: 'active',
        currentNodeId: currentNode.id,
        variables,
      }
    }
    const nextNode = nodes.find(n => n.id === nextNodeId)
    if (!nextNode) {
      return this.endSessionWithError(session, `Next node not found: ${nextNodeId}`)
    }
    const history = [...((session.history as string[]) ?? []), nextNodeId]
    await this.prisma.agentFlowSession.update({
      where: { sessionId },
      data: { currentNodeId: nextNodeId, history },
    })
    return this.executeFromNode(sessionId, flow, nextNode, userMessage)
  }

  /** Get current session state */
  async getSessionState(sessionId: string): Promise<FlowState> {
    const session = await this.prisma.agentFlowSession.findUnique({
      where: { sessionId },
      include: { flow: true },
    })
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    return {
      sessionId: session.sessionId,
      flowId: session.flowId,
      flowName: session.flow.name,
      currentNodeId: session.currentNodeId,
      status: session.status,
      variables: (session.variables as Record<string, any>) ?? {},
      history: (session.history as string[]) ?? [],
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    }
  }

  // ────────────────────────────────────────────────────────
  // Internal execution
  // ────────────────────────────────────────────────────────

  /** Execute from a given node and auto-advance through non-waiting nodes */
  private async executeFromNode(
    sessionId: string,
    flow: AgentFlow,
    startNode: FlowNode,
    userMessage?: string,
    existingSession?: AgentFlowSession & { flow: AgentFlow },
  ): Promise<FlowResponse> {
    const nodes = flow.nodes as unknown as FlowNode[]
    const allMessages: FlowMessage[] = []
    let currentNode: FlowNode | null = startNode
    let stepCount = 0
    let lastResult: NodeResult | null = null

    // Load current session variables
    let session = existingSession ?? await this.prisma.agentFlowSession.findUnique({
      where: { sessionId },
      include: { flow: true },
    })
    if (!session) throw new Error(`Session not found during execution: ${sessionId}`)
    let variables = { ...((session.variables as Record<string, any>) ?? {}) }

    while (currentNode && stepCount < MAX_STEPS) {
      stepCount++

      // Execute the current node
      const result = await this.executeNode(currentNode, variables, userMessage)
      lastResult = result

      // Collect messages
      allMessages.push(...result.messages)

      // Merge variables
      if (result.variables) {
        variables = { ...variables, ...result.variables }
      }

      // If the node changed session status
      if (result.statusChange) {
        await this.prisma.agentFlowSession.update({
          where: { sessionId },
          data: {
            status: result.statusChange,
            variables,
            completedAt: result.statusChange === 'completed' || result.statusChange === 'transferred' ? new Date() : undefined,
          },
        })
        return {
          sessionId,
          messages: allMessages,
          status: result.statusChange,
          currentNodeId: currentNode.id,
          variables,
          transferInfo: result.transferInfo,
        }
      }

      // If the node wants to wait for input, stop here
      if (result.waitForInput) {
        await this.prisma.agentFlowSession.update({
          where: { sessionId },
          data: {
            currentNodeId: currentNode.id,
            variables,
          },
        })
        return {
          sessionId,
          messages: allMessages,
          status: 'active',
          currentNodeId: currentNode.id,
          variables,
        }
      }

      // Resolve next node
      const nextNodeId = await this.resolveNextNode(currentNode.id, flow, result)
      if (!nextNodeId) {
        // No next node — implicit end
        await this.prisma.agentFlowSession.update({
          where: { sessionId },
          data: {
            status: 'completed',
            variables,
            completedAt: new Date(),
          },
        })
        return {
          sessionId,
          messages: allMessages,
          status: 'completed',
          currentNodeId: currentNode.id,
          variables,
        }
      }

      const nextNode = nodes.find(n => n.id === nextNodeId)
      if (!nextNode) {
        await this.prisma.agentFlowSession.update({
          where: { sessionId },
          data: { status: 'completed', variables, completedAt: new Date() },
        })
        return {
          sessionId,
          messages: allMessages,
          status: 'completed',
          currentNodeId: currentNode.id,
          variables,
        }
      }

      // Update session
      const history = [...((session.history as string[]) ?? []), nextNodeId]
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { currentNodeId: nextNodeId, history, variables },
      })
      // Re-read session
      session = await this.prisma.agentFlowSession.findUnique({
        where: { sessionId },
        include: { flow: true },
      })
      if (!session) throw new Error('Session lost during execution')

      currentNode = nextNode
      userMessage = undefined  // Only pass userMessage on first iteration
    }

    // Max steps exceeded — safety stop
    if (stepCount >= MAX_STEPS) {
      await this.prisma.agentFlowSession.update({
        where: { sessionId },
        data: { status: 'abandoned', variables, completedAt: new Date() },
      })
      allMessages.push({
        text: 'Sorry, something went wrong with this conversation. Please try again.',
        textAr: 'عذراً، حدث خطأ في المحادثة. يرجى المحاولة مرة أخرى.',
      })
      return {
        sessionId,
        messages: allMessages,
        status: 'abandoned',
        currentNodeId: currentNode?.id ?? null,
        variables,
      }
    }

    return {
      sessionId,
      messages: allMessages,
      status: 'completed',
      currentNodeId: null,
      variables,
    }
  }

  /** Execute a single node and return its result */
  private async executeNode(
    node: FlowNode,
    variables: Record<string, any>,
    userMessage?: string,
  ): Promise<NodeResult> {
    const data = node.data

    switch (node.type) {
      case NodeType.START: {
        const messages: FlowMessage[] = []
        if (data.message) {
          messages.push({
            text: this.substituteVariables(data.message, variables),
            textAr: data.messageAr ? this.substituteVariables(data.messageAr, variables) : undefined,
          })
        }
        return { messages, waitForInput: false }
      }

      case NodeType.MESSAGE: {
        const messages: FlowMessage[] = []
        if (data.message) {
          messages.push({
            text: this.substituteVariables(data.message, variables),
            textAr: data.messageAr ? this.substituteVariables(data.messageAr, variables) : undefined,
            buttons: data.buttons,
          })
        }
        // If message has buttons, wait for the user to pick one
        return { messages, waitForInput: !!data.buttons?.length }
      }

      case NodeType.QUESTION: {
        const messages: FlowMessage[] = []
        if (data.question) {
          messages.push({
            text: this.substituteVariables(data.question, variables),
            textAr: data.questionAr ? this.substituteVariables(data.questionAr, variables) : undefined,
          })
        }
        // Always wait for user response on a QUESTION
        return { messages, waitForInput: true }
      }

      case NodeType.CONDITION: {
        if (!data.condition) {
          return { messages: [], waitForInput: false, selectedBranch: 'default' }
        }
        const branch = this.evaluateCondition(data.condition, variables, userMessage ?? '')
        return { messages: [], waitForInput: false, selectedBranch: branch }
      }

      case NodeType.AI_RESPONSE: {
        // Generate an AI response using the flow context
        const aiMessage = await this.generateAiResponse(data, variables, userMessage)
        return {
          messages: [{ text: aiMessage, isAiGenerated: true }],
          waitForInput: false,
        }
      }

      case NodeType.API_CALL: {
        const result = await this.executeApiAction(
          data.apiAction ?? '',
          data.apiParams ?? {},
          variables,
        )
        const updatedVars: Record<string, any> = { ...variables, _apiResult: result }
        // If there's a variable key, store the result
        if (data.variableKey) {
          updatedVars[data.variableKey] = result
        }
        return { messages: [], waitForInput: false, variables: updatedVars }
      }

      case NodeType.SET_VARIABLE: {
        if (data.variableKey && data.variableValue !== undefined) {
          const value = this.substituteVariables(data.variableValue, variables)
          return {
            messages: [],
            waitForInput: false,
            variables: { [data.variableKey]: value },
          }
        }
        return { messages: [], waitForInput: false }
      }

      case NodeType.TRANSFER: {
        const messages: FlowMessage[] = []
        const reason = data.transferReason
          ? this.substituteVariables(data.transferReason, variables)
          : 'Patient requested transfer'
        messages.push({
          text: `Transferring you to ${data.department ?? 'a human agent'}. Reason: ${reason}`,
          textAr: `جارٍ تحويلك إلى ${data.department ?? 'موظف'}. السبب: ${reason}`,
        })
        return {
          messages,
          waitForInput: false,
          statusChange: 'transferred',
          transferInfo: {
            department: data.department ?? 'general',
            reason,
            summary: this.buildTransferSummary(variables),
          },
        }
      }

      case NodeType.WAIT: {
        return { messages: [], waitForInput: true }
      }

      case NodeType.END: {
        const messages: FlowMessage[] = []
        if (data.endMessage) {
          messages.push({
            text: this.substituteVariables(data.endMessage, variables),
            textAr: data.endMessageAr ? this.substituteVariables(data.endMessageAr, variables) : undefined,
          })
        }
        return { messages, waitForInput: false, statusChange: 'completed' }
      }

      default:
        return { messages: [], waitForInput: false }
    }
  }

  /** Resolve the next node based on edges and the current result */
  private async resolveNextNode(
    currentNodeId: string,
    flow: AgentFlow,
    result: NodeResult,
  ): Promise<string | null> {
    const edges = flow.edges as unknown as FlowEdge[]
    const outgoingEdges = edges.filter(e => e.source === currentNodeId)

    if (outgoingEdges.length === 0) return null

    // If there's a selected branch (from CONDITION), match it
    if (result.selectedBranch) {
      const branchEdge = outgoingEdges.find(
        e => e.sourceHandle === result.selectedBranch || e.label === result.selectedBranch,
      )
      if (branchEdge) return branchEdge.target

      // Fallback: look for a "default" or "else" branch
      const defaultEdge = outgoingEdges.find(
        e => e.sourceHandle === 'default' || e.sourceHandle === 'else' || e.label === 'default' || e.label === 'else',
      )
      if (defaultEdge) return defaultEdge.target
    }

    // Default: take the first edge
    return outgoingEdges[0].target
  }

  /** Evaluate a condition and return the matching branch name */
  private evaluateCondition(
    condition: ConditionData,
    variables: Record<string, any>,
    userMessage: string,
  ): string {
    const { type, field, operator, value } = condition

    switch (type) {
      case 'keyword': {
        // Check if user message contains the keyword value
        const keywords = (value ?? '').toLowerCase().split(',').map(k => k.trim())
        const msg = userMessage.toLowerCase()
        for (const kw of keywords) {
          if (kw && msg.includes(kw)) return kw
        }
        return 'default'
      }

      case 'contains': {
        const searchText = (value ?? '').toLowerCase()
        if (userMessage.toLowerCase().includes(searchText)) return 'yes'
        return 'no'
      }

      case 'variable': {
        const fieldValue = field ? variables[field] : undefined
        if (!operator || !value) return fieldValue ? 'yes' : 'no'

        switch (operator) {
          case 'equals':
            return String(fieldValue).toLowerCase() === value.toLowerCase() ? 'yes' : 'no'
          case 'contains':
            return String(fieldValue).toLowerCase().includes(value.toLowerCase()) ? 'yes' : 'no'
          case 'greater':
            return Number(fieldValue) > Number(value) ? 'yes' : 'no'
          case 'less':
            return Number(fieldValue) < Number(value) ? 'yes' : 'no'
          case 'exists':
            return fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? 'yes' : 'no'
          default:
            return 'default'
        }
      }

      case 'intent': {
        // Simple intent matching via keywords in user message
        const msg = userMessage.toLowerCase()
        const intentMap: Record<string, string[]> = {
          book_appointment: ['حجز', 'موعد', 'احجز', 'appointment', 'book', 'schedule'],
          cancel_appointment: ['إلغاء', 'الغاء', 'cancel'],
          reschedule: ['تغيير', 'تعديل', 'إعادة جدولة', 'reschedule', 'change'],
          faq: ['سؤال', 'استفسار', 'question', 'ask', 'info'],
          transfer: ['موظف', 'بشري', 'تحويل', 'human', 'agent', 'transfer'],
          greeting: ['مرحبا', 'السلام', 'أهلا', 'hello', 'hi', 'hey'],
          hours: ['ساعات', 'أوقات', 'دوام', 'hours', 'open', 'close'],
        }

        // Check if value specifies which intents to check
        const targetIntents = value ? value.split(',').map(i => i.trim()) : Object.keys(intentMap)

        for (const intent of targetIntents) {
          const keywords = intentMap[intent] ?? [intent]
          for (const kw of keywords) {
            if (msg.includes(kw)) return intent
          }
        }
        return 'default'
      }

      default:
        return 'default'
    }
  }

  /** Execute an internal API action */
  private async executeApiAction(
    action: string,
    params: Record<string, string>,
    variables: Record<string, any>,
  ): Promise<any> {
    // Resolve parameter values from variables
    const resolvedParams: Record<string, string> = {}
    for (const [key, val] of Object.entries(params)) {
      resolvedParams[key] = this.substituteVariables(val, variables)
    }

    switch (action) {
      case 'check_availability': {
        // Query available appointment slots
        try {
          const providers = await this.prisma.provider.findMany({
            where: {
              active: true,
              ...(resolvedParams.departmentId ? { departmentId: resolvedParams.departmentId } : {}),
            },
            take: 5,
            include: { department: true, facility: true },
          })
          return {
            success: true,
            providers: providers.map(p => ({
              id: p.providerId,
              name: p.displayName,
              department: p.department?.name,
              facility: p.facility?.name,
            })),
          }
        } catch {
          return { success: false, error: 'Could not check availability' }
        }
      }

      case 'search_faq': {
        try {
          const query = resolvedParams.query ?? variables._lastInput ?? ''
          const faqs = await this.prisma.faqEntry.findMany({
            where: {
              isActive: true,
              OR: [
                { questionAr: { contains: query, mode: 'insensitive' } },
                { questionEn: { contains: query, mode: 'insensitive' } },
                { answerAr: { contains: query, mode: 'insensitive' } },
                { answerEn: { contains: query, mode: 'insensitive' } },
              ],
            },
            take: 3,
            orderBy: { priority: 'desc' },
          })
          return {
            success: true,
            results: faqs.map(f => ({
              question: f.questionAr,
              answer: f.answerAr,
            })),
          }
        } catch {
          return { success: false, error: 'Could not search FAQ' }
        }
      }

      case 'get_operating_hours': {
        try {
          const configs = await this.prisma.facilityConfig.findMany({ take: 1 })
          if (configs.length > 0) {
            return { success: true, hours: configs[0].businessHours }
          }
          return { success: true, hours: null }
        } catch {
          return { success: false, error: 'Could not get operating hours' }
        }
      }

      case 'book_appointment': {
        // In simulation mode, just return success
        return {
          success: true,
          message: 'Appointment booking initiated',
          messageAr: 'تم بدء حجز الموعد',
          data: resolvedParams,
        }
      }

      default:
        return { success: false, error: `Unknown API action: ${action}` }
    }
  }

  /** Generate an AI response using flow context */
  private async generateAiResponse(
    data: FlowNodeData,
    variables: Record<string, any>,
    userMessage?: string,
  ): Promise<string> {
    // In production, this would call OpenAI/Gemini with the system prompt
    // For now, provide a contextual fallback
    const prompt = data.aiPrompt
      ? this.substituteVariables(data.aiPrompt, variables)
      : 'You are a helpful medical receptionist.'

    // Simple template-based response for now
    const lastInput = userMessage ?? variables._lastInput ?? ''
    if (lastInput) {
      return `شكراً لتواصلك معنا. سأساعدك في "${lastInput}". كيف يمكنني خدمتك؟`
    }
    return 'مرحباً! كيف يمكنني مساعدتك اليوم؟'
  }

  /** Substitute {{variableName}} placeholders in text */
  private substituteVariables(text: string, variables: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const val = variables[key]
      if (val === undefined || val === null) return match
      if (typeof val === 'object') return JSON.stringify(val)
      return String(val)
    })
  }

  /** Build a transfer summary from session variables */
  private buildTransferSummary(variables: Record<string, any>): string {
    const parts: string[] = []
    for (const [key, value] of Object.entries(variables)) {
      if (key.startsWith('_')) continue
      parts.push(`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    }
    return parts.join(', ') || 'No additional context'
  }

  /** End session with an error message */
  private async endSessionWithError(
    session: AgentFlowSession & { flow: AgentFlow },
    error: string,
  ): Promise<FlowResponse> {
    await this.prisma.agentFlowSession.update({
      where: { sessionId: session.sessionId },
      data: { status: 'abandoned', completedAt: new Date() },
    })
    return {
      sessionId: session.sessionId,
      messages: [{
        text: 'Sorry, something went wrong. Please try again or contact us directly.',
        textAr: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.',
      }],
      status: 'abandoned',
      currentNodeId: session.currentNodeId,
      variables: (session.variables as Record<string, any>) ?? {},
    }
  }
}
