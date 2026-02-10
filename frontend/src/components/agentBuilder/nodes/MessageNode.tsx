import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { MessageSquare } from 'lucide-react'
import type { MessageNodeData } from '../types'

type MessageNodeType = Node<MessageNodeData>

function MessageNode({ data, selected }: NodeProps<MessageNodeType>) {
  const nodeData = data as MessageNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-blue-500 shadow-blue-100 shadow-lg' : 'border-blue-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-t-[10px] border-b border-blue-100">
        <div className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-blue-700">رسالة</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.messageText ? (
          <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed" dir="rtl">
            {nodeData.messageText}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">اكتب نص الرسالة...</p>
        )}

        {/* Quick Replies Preview */}
        {nodeData.quickReplies && nodeData.quickReplies.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {nodeData.quickReplies.slice(0, 3).map((btn) => (
              <span
                key={btn.id}
                className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"
              >
                {btn.label || '...'}
              </span>
            ))}
            {nodeData.quickReplies.length > 3 && (
              <span className="text-[10px] text-gray-400">+{nodeData.quickReplies.length - 3}</span>
            )}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(MessageNode)
