import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { HelpCircle } from 'lucide-react'
import type { QuestionNodeData } from '../types'

type QuestionNodeType = Node<QuestionNodeData>

function QuestionNode({ data, selected }: NodeProps<QuestionNodeType>) {
  const nodeData = data as QuestionNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-purple-500 shadow-purple-100 shadow-lg' : 'border-purple-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 rounded-t-[10px] border-b border-purple-100">
        <div className="w-6 h-6 rounded-md bg-purple-500 flex items-center justify-center flex-shrink-0">
          <HelpCircle className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-purple-700">سؤال</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.questionText ? (
          <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed" dir="rtl">
            {nodeData.questionText}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">اكتب السؤال...</p>
        )}

        {/* Variable Badge */}
        {nodeData.variableName && (
          <div className="mt-2">
            <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-mono">
              {'{{' + nodeData.variableName + '}}'}
            </span>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(QuestionNode)
