import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Globe } from 'lucide-react'
import type { ApiCallNodeData } from '../types'

type ApiCallNodeType = Node<ApiCallNodeData>

const actionLabels: Record<string, string> = {
  book_appointment: 'حجز موعد',
  check_availability: 'التحقق من التوفر',
  search_faq: 'بحث FAQ',
  refill_prescription: 'إعادة صرف وصفة',
  get_patient_info: 'بيانات المريض',
  cancel_appointment: 'إلغاء موعد',
}

function ApiCallNode({ data, selected }: NodeProps<ApiCallNodeType>) {
  const nodeData = data as ApiCallNodeData

  return (
    <div
      className={`
        bg-white rounded-xl shadow-md border-2 min-w-[200px] max-w-[260px]
        ${selected ? 'border-gray-500 shadow-gray-100 shadow-lg' : 'border-gray-200'}
        transition-all duration-150
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-[10px] border-b border-gray-200">
        <div className="w-6 h-6 rounded-md bg-gray-500 flex items-center justify-center flex-shrink-0">
          <Globe className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-gray-700">استدعاء API</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {nodeData.action ? (
          <p className="text-xs font-semibold text-gray-700" dir="rtl">
            {actionLabels[nodeData.action] || nodeData.action}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">اختر الإجراء...</p>
        )}

        {/* Params preview */}
        {nodeData.params && nodeData.params.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {nodeData.params.slice(0, 4).map((p) => (
              <span
                key={p.id}
                className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded font-mono"
              >
                {p.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-500 !border-2 !border-white"
      />
    </div>
  )
}

export default memo(ApiCallNode)
