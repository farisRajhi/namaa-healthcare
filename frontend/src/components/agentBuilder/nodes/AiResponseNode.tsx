import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Sparkles } from 'lucide-react'
import type { AiResponseNodeData } from '../types'

type AiResponseNodeType = Node<AiResponseNodeData>

function AiResponseNode({ data, selected }: NodeProps<AiResponseNodeType>) {
  const nodeData = data as AiResponseNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-primary-500 shadow-primary-100 shadow-lg' : 'border-primary-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary-50 rounded-t-[10px] border-b border-primary-100">
        <div className="w-6 h-6 rounded-md bg-primary-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-primary-700">رد ذكي</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded-full ms-auto">
          AI
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.systemPrompt ? (
          <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed" dir="rtl">
            {nodeData.systemPrompt}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">تعليمات للذكاء الاصطناعي...</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(AiResponseNode)
