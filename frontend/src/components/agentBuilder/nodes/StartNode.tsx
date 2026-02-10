import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Play } from 'lucide-react'
import type { StartNodeData } from '../types'

function StartNode({ selected }: NodeProps) {
  return (
    <div
      className={`
        flex flex-col items-center gap-1.5
        ${selected ? 'scale-110' : ''}
        transition-transform duration-150
      `}
    >
      <div
        className={`
          w-16 h-16 rounded-full flex items-center justify-center
          bg-gradient-to-br from-green-400 to-green-600
          shadow-lg
          ${selected ? 'ring-4 ring-green-300 ring-offset-2' : ''}
        `}
      >
        <Play className="w-7 h-7 text-white fill-white" />
      </div>
      <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
        بداية
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
    </div>
  )
}

// Make TypeScript happy - we use the data type in the type system
export type { StartNodeData }

export default memo(StartNode)
