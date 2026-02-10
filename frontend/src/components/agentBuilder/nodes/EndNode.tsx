import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Square } from 'lucide-react'

function EndNode({ selected }: NodeProps) {
  return (
    <div
      className={`
        flex flex-col items-center gap-1.5
        ${selected ? 'scale-110' : ''}
        transition-transform duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />
      <div
        className={`
          w-16 h-16 rounded-full flex items-center justify-center
          bg-gradient-to-br from-red-400 to-red-600
          shadow-lg
          ${selected ? 'ring-4 ring-red-300 ring-offset-2' : ''}
        `}
      >
        <Square className="w-6 h-6 text-white fill-white" />
      </div>
      <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
        نهاية
      </span>
    </div>
  )
}

export default memo(EndNode)
