import { Check, Circle } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ChatRequirementsProps {
  requirements: {
    hasDepartment: boolean
    hasFacility: boolean
    hasProviderWithAvailability: boolean
  }
}

export function ChatRequirements({ requirements }: ChatRequirementsProps) {
  const items = [
    {
      label: 'Add at least 1 department (section)',
      completed: requirements.hasDepartment,
    },
    {
      label: 'Add at least 1 facility (clinic)',
      completed: requirements.hasFacility,
    },
    {
      label: 'Add at least 1 provider with availability',
      completed: requirements.hasProviderWithAvailability,
    },
  ]

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
      <h4 className="font-medium text-amber-800 mb-3">
        Complete setup to enable test chat
      </h4>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm">
            {item.completed ? (
              <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
            )}
            <span
              className={cn(
                item.completed ? 'text-green-700' : 'text-gray-600'
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
