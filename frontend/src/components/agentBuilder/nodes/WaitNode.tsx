import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Clock } from 'lucide-react'
import type { WaitNodeData } from '../types'

type WaitNodeType = Node<WaitNodeData>

function WaitNode({ data, selected }: NodeProps<WaitNodeType>) {
  const nodeData = data as WaitNodeData

  const formatDuration = (ms: number) => {
    if (!ms) return ''
    const sec = Math.floor(ms / 1000)
    if (sec < 60) return `${sec} ثانية`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} دقيقة`
    const hr = Math.floor(min / 60)
    return `${hr} ساعة`
  }

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-amber-500 shadow-amber-100 shadow-lg' : 'border-amber-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-t-[10px] border-b border-amber-100">
        <div className="w-6 h-6 rounded-md bg-amber-500 flex items-center justify-center flex-shrink-0">
          <Clock className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-amber-700">انتظار</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.waitType === 'timer' ? (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400">مؤقت</p>
            <p className="text-xs text-gray-600 font-medium" dir="rtl">
              {nodeData.waitDurationMs ? formatDuration(nodeData.waitDurationMs) : 'لم يتم التحديد'}
            </p>
          </div>
        ) : nodeData.waitType === 'event' ? (
          <div className="space-y-1">
            <p className="text-[10px] text-gray-400">حدث خارجي</p>
            <p className="text-xs text-gray-600 font-mono" dir="ltr">
              {nodeData.waitEvent || '...'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 italic">حدد نوع الانتظار...</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(WaitNode)
