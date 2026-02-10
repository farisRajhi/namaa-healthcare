import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import type { ConditionNodeData } from '../types'

type ConditionNodeType = Node<ConditionNodeData>

const conditionTypeLabels: Record<string, string> = {
  intent: 'نية',
  keyword: 'كلمة مفتاحية',
  variable: 'متغير',
  contains: 'يحتوي',
}

function ConditionNode({ data, selected }: NodeProps<ConditionNodeType>) {
  const nodeData = data as ConditionNodeData
  const branches = nodeData.branches || []

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[220px] max-w-[280px]
        ${selected ? 'border-orange-500 shadow-orange-100 shadow-lg' : 'border-orange-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-t-[10px] border-b border-orange-100">
        <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center flex-shrink-0">
          <GitBranch className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-orange-700">شرط</span>
        {nodeData.conditionType && (
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full ms-auto">
            {conditionTypeLabels[nodeData.conditionType] || nodeData.conditionType}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.field ? (
          <p className="text-xs text-gray-600 font-mono" dir="ltr">
            {nodeData.field}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">حدد الشرط...</p>
        )}

        {/* Branches preview */}
        {branches.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {branches.map((b) => (
              <span
                key={b.id}
                className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full"
              >
                {b.label || '...'}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Multiple output handles for branches */}
      {branches.length > 0 ? (
        branches.map((branch, index) => (
          <Handle
            key={branch.id}
            type="source"
            position={Position.Bottom}
            id={branch.id}
            className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
            style={{
              left: `${((index + 1) / (branches.length + 1)) * 100}%`,
            }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-orange-500 !border-2 !border-white"
        />
      )}
    </div>
  )
}

export default memo(ConditionNode)
