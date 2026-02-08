import { cn } from '../../lib/utils'

interface ChatMessageProps {
  direction: 'in' | 'out'
  content: string
  createdAt?: string
}

export function ChatMessage({ direction, content, createdAt }: ChatMessageProps) {
  const isUser = direction === 'in'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] px-4 py-2 rounded-2xl text-sm',
          isUser
            ? 'bg-primary-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {createdAt && (
          <p
            className={cn(
              'text-xs mt-1',
              isUser ? 'text-primary-200' : 'text-gray-400'
            )}
          >
            {new Date(createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </div>
  )
}
