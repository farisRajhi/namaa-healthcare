import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { MessageSquare, RotateCcw, Loader2, Send, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

type Dialect = 'gulf' | 'egyptian' | 'levantine' | 'msa'

const dialectOptions: { value: Dialect; label: string; flag: string }[] = [
  { value: 'gulf', label: 'خليجي', flag: '🇸🇦' },
  { value: 'egyptian', label: 'مصري', flag: '🇪🇬' },
  { value: 'levantine', label: 'شامي', flag: '🇱🇧' },
  { value: 'msa', label: 'فصحى', flag: '📖' },
]

// Demo API client
const demoApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

// Generate or retrieve session ID
function getSessionId(): string {
  const key = 'demo_chat_session_id'
  let sessionId = localStorage.getItem(key)
  if (!sessionId) {
    sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
    localStorage.setItem(key, sessionId)
  }
  return sessionId
}

// Example prompts by dialect
const EXAMPLE_PROMPTS: Record<Dialect, string[]> = {
  gulf: ['شلون أحجز موعد؟', 'شنو الخدمات عندكم؟', 'أبي موعد أسنان'],
  egyptian: ['عايز أحجز معاد', 'إيه الخدمات اللي عندكم؟', 'عايز دكتور أسنان'],
  levantine: ['كيف فيني أحجز موعد؟', 'شو الخدمات يلي عندكن؟', 'بدي موعد أسنان'],
  msa: ['كيف أحجز موعداً؟', 'ما هي الخدمات المتاحة؟', 'أريد موعد أسنان'],
}

export default function DemoChatEmbed() {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [remainingMessages, setRemainingMessages] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState(() => getSessionId())
  const [selectedDialect, setSelectedDialect] = useState<Dialect>('gulf')
  const [isChatStarted, setIsChatStarted] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (messageText?: string) => {
    const text = messageText || inputValue.trim()
    if (!text || isLoading) return

    setInputValue('')
    setError(null)
    setIsChatStarted(true)

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await demoApi.post('/api/demo-chat/message', {
        sessionId,
        message: text,
        conversationHistory,
        dialect: selectedDialect,
      })

      const data = response.data

      if (data.error === 'rate_limit') {
        setError(data.message)
        setRemainingMessages(0)
      } else if (data.error) {
        setError(data.message || 'An error occurred')
      } else {
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, aiMessage])
        setRemainingMessages(data.remainingMessages)
      }
    } catch (err) {
      setError('Failed to send message. Please try again.')
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id))
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewChat = async () => {
    try {
      const newSessionId = crypto.randomUUID()
      localStorage.setItem('demo_chat_session_id', newSessionId)
      await demoApi.post('/api/demo-chat/new', { sessionId: newSessionId })
      setSessionId(newSessionId)
      setMessages([])
      setError(null)
      setRemainingMessages(null)
      setIsChatStarted(false)
    } catch (err) {
      setError('Failed to start new conversation')
    }
  }

  const handleExampleClick = (prompt: string) => {
    handleSend(prompt)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (inputValue.trim() && !isLoading) {
        handleSend()
      }
    }
  }

  const dialectLabels: Record<string, string> = {
    gulf: 'خليجي',
    egyptian: 'مصري',
    levantine: 'شامي',
    msa: 'فصحى',
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto">
      {/* Header - matching VoiceDemo style */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">جرب المحادثة النصية</h3>
              <p className="text-sm text-primary-100">
                {isChatStarted ? 'المحادثة نشطة' : 'اختر اللهجة للبدء'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 px-3 py-1 rounded-full text-sm flex items-center gap-1">
              {dialectOptions.find(d => d.value === selectedDialect)?.flag}
              {dialectLabels[selectedDialect]}
            </span>
            {isChatStarted && (
              <button
                onClick={handleNewChat}
                className="bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors"
                title="محادثة جديدة"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages area - matching VoiceDemo height */}
      <div className="h-64 overflow-y-auto p-4 bg-gray-50">
        {!isChatStarted ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
            <MessageSquare className="w-10 h-10 mb-3 text-gray-300" />
            <p className="font-medium text-gray-700 mb-3">اختر اللهجة المفضلة</p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {dialectOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedDialect(option.value)}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                    selectedDialect === option.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{option.flag}</span>
                  <span className="text-sm font-medium">{option.label}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 mb-2">جرب أحد الأسئلة:</p>
            <div className="space-y-1.5 w-full max-w-xs">
              {EXAMPLE_PROMPTS[selectedDialect].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleExampleClick(prompt)}
                  className="block w-full text-start px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex', message.role === 'user' ? 'justify-start' : 'justify-end')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2',
                    message.role === 'user'
                      ? 'bg-gray-200 text-gray-800 rounded-tl-sm'
                      : 'bg-primary-600 text-white rounded-tr-sm'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-end">
                <div className="bg-primary-100 text-primary-600 rounded-2xl px-4 py-2 rounded-tr-sm">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm text-center">{error}</div>
      )}

      {/* Rate limit CTA */}
      {remainingMessages === 0 && (
        <div className="px-4 py-3 bg-primary-50 border-t border-primary-100 text-center">
          <p className="text-sm text-primary-700 mb-2">انتهت الرسائل التجريبية!</p>
          <Link
            to="/register"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            سجل للحصول على وصول غير محدود
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>
      )}

      {/* Input - matching VoiceDemo controls style */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالتك..."
            disabled={remainingMessages === 0 || isLoading}
            className="flex-1 px-4 py-3 text-sm border-2 border-gray-200 rounded-full focus:outline-none focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-400 transition-colors"
          />
          <button
            onClick={() => handleSend()}
            disabled={remainingMessages === 0 || isLoading || !inputValue.trim()}
            className="w-12 h-12 bg-primary-600 hover:bg-primary-700 text-white rounded-full flex items-center justify-center shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 disabled:hover:scale-100"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
        {remainingMessages !== null && remainingMessages > 0 && (
          <p className="text-center text-xs text-gray-400 mt-2">
            {remainingMessages} رسائل متبقية
          </p>
        )}
      </div>
    </div>
  )
}
