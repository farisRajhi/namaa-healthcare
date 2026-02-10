import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Variable } from 'lucide-react'
import type { SetVariableNodeData } from '../types'

type SetVariableNodeType = Node<SetVariableNodeData>

function SetVariableNode({ data, selected }: NodeProps<SetVariableNodeType>) {
  const nodeData = data as SetVariableNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[180px] max-w-[240px]
        ${selected ? 'border-stone-500 shadow-stone-100 shadow-lg' : 'border-stone-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-stone-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-t-[10px] border-b border-stone-200">
        <div className="w-6 h-6 rounded-md bg-stone-500 flex items-center justify-center flex-shrink-0">
          <Variable className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-stone-700">متغير</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.key ? (
          <p className="text-xs font-mono text-gray-600" dir="ltr">
            <span className="text-stone-700 font-semibold">{nodeData.key}</span>
            <span className="text-gray-400 mx-1">=</span>
            <span className="text-stone-500">{nodeData.value || '...'}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">key = value</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-stone-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(SetVariableNode)
