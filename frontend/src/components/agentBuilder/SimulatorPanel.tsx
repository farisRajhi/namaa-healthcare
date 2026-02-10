import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, RotateCcw, Bot, User } from 'lucide-react'
import { api } from '../../lib/api'

interface SimMessage {
  id: string
  sender: 'bot' | 'user'
  content: string
  timestamp: number
}

interface SimulatorPanelProps {
  flowId: string
  onClose: () => void
}

export default function SimulatorPanel({ flowId, onClose }: SimulatorPanelProps) {
  const [messages, setMessages] = useState<SimMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Start a new simulation session
  const startSession = useCallback(async () => {
    setMessages([])
    setInput('')
    setIsComplete(false)
    setIsLoading(true)

    try {
      const res = await api.post(`/api/agent-builder/flows/${flowId}/simulate`, {
        action: 'start',
      })
      const data = res.data?.data
      if (data) {
        setSessionId(data.sessionId || null)
        if (data.messages?.length) {
          setMessages(
            data.messages.map((m: { content: string; sender?: string }, i: number) => ({
              id: `bot-${Date.now()}-${i}`,
              sender: 'bot' as const,
              content: m.content || m.sender || '',
              timestamp: Date.now(),
            }))
          )
        } else if (data.greeting) {
          setMessages([
            {
              id: `bot-${Date.now()}`,
              sender: 'bot',
              content: data.greeting,
              timestamp: Date.now(),
            },
          ])
        }
      }
    } catch {
      setMessages([
        {
          id: `bot-${Date.now()}`,
          sender: 'bot',
          content: 'مرحباً! هذا وضع المحاكاة. (لا يوجد محرك تشغيل متصل بعد)',
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [flowId])

  // Auto-start on mount
  useEffect(() => {
    startSession()
  }, [startSession])

  // Send a message
  const handleSend = async () => {
    const text = input.trim()
    if (!text || isLoading || isComplete) return

    const userMsg: SimMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsLoading(true)

    try {
      const res = await api.post(`/api/agent-builder/flows/${flowId}/simulate`, {
        action: 'message',
        sessionId,
        text,
      })
      const data = res.data?.data
      if (data?.messages?.length) {
        const botMsgs: SimMessage[] = data.messages.map(
          (m: { content: string }, i: number) => ({
            id: `bot-${Date.now()}-${i}`,
            sender: 'bot' as const,
            content: m.content,
            timestamp: Date.now(),
          })
        )
        setMessages((prev) => [...prev, ...botMsgs])
      }
      if (data?.isComplete) {
        setIsComplete(true)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: 'bot',
          content: '⚠️ حدث خطأ في المحاكاة',
          timestamp: Date.now(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-80 border-s border-gray-200 bg-white flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2" dir="rtl">
          <Bot className="w-4 h-4 text-blue-500" />
          <h3 className="text-xs font-bold text-gray-700">محاكاة المحادثة</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startSession}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="إعادة تشغيل"
          >
            <RotateCcw className="w-3.5 h-3.5 text-gray-400" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="إغلاق"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3" dir="rtl">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-end gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.sender === 'bot' ? 'bg-blue-100' : 'bg-gray-100'
              }`}
            >
              {msg.sender === 'bot' ? (
                <Bot className="w-3 h-3 text-blue-500" />
              ) : (
                <User className="w-3 h-3 text-gray-500" />
              )}
            </div>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.sender === 'bot'
                  ? 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  : 'bg-blue-500 text-white rounded-br-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-end gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3 h-3 text-blue-500" />
            </div>
            <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="text-center py-2">
            <span className="text-[10px] bg-green-50 text-green-600 px-3 py-1 rounded-full font-medium">
              ✓ انتهت المحادثة
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2" dir="rtl">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isComplete ? 'انتهت المحادثة' : 'اكتب رسالة...'}
            disabled={isComplete || isLoading}
            className="flex-1 text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300 disabled:opacity-50 disabled:bg-gray-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isComplete || isLoading}
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
