import { type DragEvent } from 'react'
import {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Sparkles,
  Globe,
  Variable,
  PhoneForwarded,
  Clock,
  Square,
} from 'lucide-react'
import { NODE_PALETTE, type FlowNodeType } from './types'

const iconMap: Record<string, React.ElementType> = {
  Play,
  MessageSquare,
  HelpCircle,
  GitBranch,
  Brain: Sparkles,
  Globe,
  Variable,
  PhoneForwarded,
  Clock,
  Square,
}

export default function NodePalette() {
  const onDragStart = (event: DragEvent, nodeType: FlowNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-48 border-e border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      <div className="px-3 py-3 border-b border-gray-100">
        <h3 className="text-xs font-bold text-gray-700" dir="rtl">العناصر</h3>
        <p className="text-[10px] text-gray-400 mt-0.5" dir="rtl">اسحب لإضافة عنصر</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {NODE_PALETTE.map((item) => {
          const Icon = iconMap[item.icon] || MessageSquare
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-grab
                hover:bg-gray-50 active:cursor-grabbing active:bg-gray-100
                border border-transparent hover:border-gray-200
                transition-all duration-150 group"
              dir="rtl"
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ backgroundColor: item.color + '20' }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 leading-none">{item.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 truncate">{item.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
