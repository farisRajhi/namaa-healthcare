import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  BackgroundVariant,
  type OnConnect,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Save,
  Upload,
  PlayCircle,
  ArrowRight,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

import {
  StartNode,
  MessageNode,
  QuestionNode,
  ConditionNode,
  AiResponseNode,
  ApiCallNode,
  SetVariableNode,
  TransferNode,
  WaitNode,
  EndNode,
} from '../components/agentBuilder/nodes'
import PropertiesPanel from '../components/agentBuilder/PropertiesPanel'
import NodePalette from '../components/agentBuilder/NodePalette'
import SimulatorPanel from '../components/agentBuilder/SimulatorPanel'
import { getDefaultNodeData, type FlowNodeData, type FlowNodeType } from '../components/agentBuilder/types'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Register custom node types
const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  question: QuestionNode,
  condition: ConditionNode,
  aiResponse: AiResponseNode,
  apiCall: ApiCallNode,
  setVariable: SetVariableNode,
  transfer: TransferNode,
  wait: WaitNode,
  end: EndNode,
}

// Default start flow
const defaultNodes: Node[] = [
  {
    id: 'start-1',
    type: 'start',
    position: { x: 400, y: 50 },
    data: getDefaultNodeData('start'),
  },
]

const defaultEdges: Edge[] = []

// Validation: which types can have outputs
const terminalTypes = new Set(['end', 'transfer'])

export default function AgentBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const orgId = user?.org?.id
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  // Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)

  // UI state
  const [flowName, setFlowName] = useState('تدفق جديد')
  const [flowDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [isEditingName, setIsEditingName] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [showSimulator, setShowSimulator] = useState(false)
  const [flowId, setFlowId] = useState<string | null>(id && id !== 'new' ? id : null)

  // History for undo/redo
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([
    { nodes: defaultNodes, edges: defaultEdges },
  ])
  const [historyIndex, setHistoryIndex] = useState(0)

  // Push to history on changes
  const pushHistory = useCallback(() => {
    setHistory((prev) => {
      const newHist = prev.slice(0, historyIndex + 1)
      newHist.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) })
      if (newHist.length > 50) newHist.shift()
      return newHist
    })
    setHistoryIndex((prev) => Math.min(prev + 1, 50))
  }, [nodes, edges, historyIndex])

  // Load flow from API
  useEffect(() => {
    if (id && id !== 'new') {
      api.get(`/api/agent-builder/flows/${id}`)
        .then((res) => {
          const flow = res.data?.data
          if (flow) {
            setNodes(flow.nodes?.length ? flow.nodes : defaultNodes)
            setEdges(flow.edges?.length ? flow.edges : defaultEdges)
            setFlowName(flow.nameAr || flow.name || 'تدفق جديد')
            setFlowId(flow.id)
          }
        })
        .catch(() => {
          // Flow not found — stay on defaults
        })
    }
  }, [id, setNodes, setEdges])

  // Save helper — uses backend API
  const doSave = useCallback(
    async (auto: boolean) => {
      if (!orgId) return
      setIsSaving(true)
      try {
        if (flowId) {
          // Update existing flow
          await api.put(`/api/agent-builder/flows/${flowId}`, {
            name: flowName,
            nameAr: flowName,
            description: flowDescription,
            nodes,
            edges,
          })
        } else {
          // Create new flow
          const res = await api.post('/api/agent-builder/flows', {
            name: flowName,
            nameAr: flowName,
            description: flowDescription,
            nodes,
            edges,
          })
          const newId = res.data?.data?.id
          if (newId) {
            setFlowId(newId)
            if (!auto) {
              navigate(`/dashboard/agent-builder/${newId}`, { replace: true })
            }
          }
        }
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } catch {
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
      setIsSaving(false)
    },
    [flowId, orgId, flowName, flowDescription, nodes, edges, navigate]
  )

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (flowId) doSave(true)
    }, 30000)
    return () => clearInterval(interval)
  }, [flowId, doSave])

  // Connection handler
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source)
      if (sourceNode && terminalTypes.has(sourceNode.type || '')) return

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#0891b2', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#0891b2' },
          },
          eds
        )
      )
      pushHistory()
    },
    [nodes, setEdges, pushHistory]
  )

  // Drop handler for drag-and-drop from palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow') as FlowNodeType
      if (!type || !rfInstance || !reactFlowWrapper.current) return

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = rfInstance.screenToFlowPosition({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      })

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: getDefaultNodeData(type),
      }

      setNodes((nds) => [...nds, newNode])
      pushHistory()
    },
    [rfInstance, setNodes, pushHistory]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  // Node selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node as Node<FlowNodeData>)
    },
    []
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Update node data from properties panel
  const onUpdateNode = useCallback(
    (nodeId: string, data: FlowNodeData) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data } : n))
      )
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data } : prev
      )
    },
    [setNodes]
  )

  // Validation
  const validateFlow = useCallback((): string[] => {
    const errors: string[] = []
    const hasStart = nodes.some((n) => n.type === 'start')
    const hasEnd = nodes.some((n) => n.type === 'end' || n.type === 'transfer')

    if (!hasStart) errors.push('يجب أن يحتوي التدفق على عنصر بداية')
    if (!hasEnd) errors.push('يجب أن يحتوي التدفق على عنصر نهاية أو تحويل')

    const connectedNodeIds = new Set<string>()
    edges.forEach((e) => {
      connectedNodeIds.add(e.source)
      connectedNodeIds.add(e.target)
    })
    const disconnected = nodes.filter((n) => !connectedNodeIds.has(n.id) && nodes.length > 1)
    if (disconnected.length > 0) {
      errors.push(`هناك ${disconnected.length} عنصر(عناصر) غير متصلة`)
    }

    return errors
  }, [nodes, edges])

  // Publish — calls backend /publish endpoint
  const handlePublish = useCallback(async () => {
    const errors = validateFlow()
    setValidationErrors(errors)
    if (errors.length > 0) return

    // Save first, then publish
    await doSave(false)
    if (flowId) {
      try {
        await api.post(`/api/agent-builder/flows/${flowId}/publish`)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }
  }, [validateFlow, doSave, flowId])

  // Undo/Redo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setNodes(history[newIndex].nodes)
      setEdges(history[newIndex].edges)
    }
  }, [historyIndex, history, setNodes, setEdges])

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setNodes(history[newIndex].nodes)
      setEdges(history[newIndex].edges)
    }
  }, [historyIndex, history, setNodes, setEdges])

  // Delete selected
  const deleteSelected = useCallback(() => {
    const selectedNodes = nodes.filter((n) => n.selected)
    const selectedEdges = edges.filter((e) => e.selected)
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return

    setNodes((nds) => nds.filter((n) => !n.selected))
    setEdges((eds) => {
      const removedIds = new Set(selectedNodes.map((n) => n.id))
      return eds.filter((e) => !e.selected && !removedIds.has(e.source) && !removedIds.has(e.target))
    })
    setSelectedNode(null)
    pushHistory()
  }, [nodes, edges, setNodes, setEdges, pushHistory])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        doSave(false)
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, doSave, deleteSelected])

  // Mini-map node color
  const miniMapNodeColor = useMemo(
    () => (node: Node) => {
      const colors: Record<string, string> = {
        start: '#22c55e',
        message: '#3b82f6',
        question: '#a855f7',
        condition: '#f97316',
        aiResponse: '#0891b2',
        apiCall: '#6b7280',
        setVariable: '#78716c',
        transfer: '#ef4444',
        wait: '#d97706',
        end: '#dc2626',
      }
      return colors[node.type || ''] || '#94a3b8'
    },
    []
  )

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50 z-50">
      {/* Header */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/dashboard/agent-builder')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowRight className="w-4 h-4 text-gray-600" />
        </button>

        <div className="flex-1 min-w-0">
          {isEditingName ? (
            <input
              autoFocus
              type="text"
              className="text-sm font-bold text-gray-800 border border-teal-300 rounded px-2 py-1 w-64 outline-none focus:ring-2 focus:ring-teal-200"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              onBlur={() => setIsEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
              dir="rtl"
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="text-sm font-bold text-gray-800 hover:text-teal-600 transition-colors text-start"
              dir="rtl"
            >
              {flowName}
            </button>
          )}
        </div>

        {saveStatus === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            تم الحفظ
          </span>
        )}

        {validationErrors.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{validationErrors.length} خطأ</span>
          </div>
        )}

        <div className="flex items-center gap-1 border-e border-gray-200 pe-3 me-1">
          <button onClick={undo} disabled={historyIndex <= 0} className="toolbar-btn" title="تراجع">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="toolbar-btn" title="إعادة">
            <Redo2 className="w-4 h-4" />
          </button>
          <button onClick={() => rfInstance?.zoomIn()} className="toolbar-btn" title="تكبير">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={() => rfInstance?.zoomOut()} className="toolbar-btn" title="تصغير">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={() => rfInstance?.fitView()} className="toolbar-btn" title="ملائمة">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={deleteSelected} className="toolbar-btn text-red-500 hover:text-red-600 hover:bg-red-50" title="حذف">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => doSave(false)}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          حفظ
        </button>
        <button
          onClick={handlePublish}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          نشر
        </button>
        <button
          onClick={() => setShowSimulator(!showSimulator)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            showSimulator
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
          title="اختبار"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          اختبار
        </button>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette />

        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRfInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            snapToGrid
            snapGrid={[20, 20]}
            fitView
            deleteKeyCode={null}
            className="bg-gray-50"
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#0891b2', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#0891b2' },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
            <Controls
              showInteractive={false}
              className="!bg-white !border !border-gray-200 !rounded-xl !shadow-lg"
            />
            <MiniMap
              nodeColor={miniMapNodeColor}
              className="!bg-white !border !border-gray-200 !rounded-xl !shadow-lg"
              maskColor="rgba(0,0,0,0.08)"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>

        {showSimulator && flowId ? (
          <SimulatorPanel flowId={flowId} onClose={() => setShowSimulator(false)} />
        ) : (
          <PropertiesPanel
            selectedNode={selectedNode}
            onUpdateNode={onUpdateNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Validation errors toast */}
      {validationErrors.length > 0 && (
        <div className="absolute bottom-20 start-1/2 -translate-x-1/2 bg-amber-50 border border-amber-200 rounded-xl shadow-lg px-4 py-3 max-w-md z-50" dir="rtl">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">أخطاء التحقق</span>
            <button
              className="ms-auto text-amber-400 hover:text-amber-600"
              onClick={() => setValidationErrors([])}
            >
              ✕
            </button>
          </div>
          <ul className="space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i} className="text-xs text-amber-600 flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-amber-400" />
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
