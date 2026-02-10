import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { PhoneForwarded } from 'lucide-react'
import type { TransferNodeData } from '../types'

type TransferNodeType = Node<TransferNodeData>

const departmentLabels: Record<string, string> = {
  reception: 'الاستقبال',
  pharmacy: 'الصيدلية',
  lab: 'المختبر',
  radiology: 'الأشعة',
  emergency: 'الطوارئ',
  billing: 'المحاسبة',
  support: 'الدعم الفني',
}

function TransferNode({ data, selected }: NodeProps<TransferNodeType>) {
  const nodeData = data as TransferNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-red-500 shadow-red-100 shadow-lg' : 'border-red-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-t-[10px] border-b border-red-100">
        <div className="w-6 h-6 rounded-md bg-red-500 flex items-center justify-center flex-shrink-0">
          <PhoneForwarded className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-red-700">تحويل</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.department ? (
          <>
            <p className="text-xs font-semibold text-gray-700" dir="rtl">
              {departmentLabels[nodeData.department] || nodeData.department}
            </p>
            {nodeData.reason && (
              <p className="text-[10px] text-gray-500 mt-1 line-clamp-2" dir="rtl">
                {nodeData.reason}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">اختر القسم...</p>
        )}
      </div>

      {/* Terminal node — no output handle */}
    </div>
  )
}

export default memo(TransferNode)
