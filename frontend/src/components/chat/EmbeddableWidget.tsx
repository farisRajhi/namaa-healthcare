import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageSquare, X, Minimize2, Send, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Message {
  id: string
  text: string
  sender: 'patient' | 'ai'
  timestamp: Date
}

interface QuickReply {
  label: string
  value: string
}

interface EmbeddableWidgetProps {
  orgId?: string
  language?: 'ar' | 'en'
  themeColor?: string
  apiUrl?: string
  position?: 'bottom-right' | 'bottom-left'
}

const defaultQuickReplies: Record<string, QuickReply[]> = {
  ar: [
    { label: 'حجز موعد', value: 'أريد حجز موعد' },
    { label: 'إلغاء موعد', value: 'أريد إلغاء موعدي' },
    { label: 'استفسار عام', value: 'لدي استفسار' },
    { label: 'وصفة طبية', value: 'أحتاج إعادة صرف وصفة' },
  ],
  en: [
    { label: 'Book Appointment', value: 'I want to book an appointment' },
    { label: 'Cancel Appointment', value: 'I want to cancel my appointment' },
    { label: 'General Inquiry', value: 'I have a question' },
    { label: 'Prescription Refill', value: 'I need a prescription refill' },
  ],
}

const translations = {
  ar: {
    title: 'المساعد الذكي',
    placeholder: 'اكتب رسالتك...',
    welcome: 'مرحباً! كيف يمكنني مساعدتك اليوم؟',
    typing: 'يكتب...',
  },
  en: {
    title: 'AI Assistant',
    placeholder: 'Type your message...',
    welcome: 'Hello! How can I help you today?',
    typing: 'Typing...',
  },
}

export default function EmbeddableWidget({
  orgId = '',
  language = 'ar',
  themeColor = '#16a34a',
  apiUrl = '',
  position = 'bottom-right',
}: EmbeddableWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const t = translations[language] || translations.en
  const quickReplies = defaultQuickReplies[language] || defaultQuickReplies.en
  const isRtl = language === 'ar'

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping])

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        text: t.welcome,
        sender: 'ai',
        timestamp: new Date(),
      }])
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus()
    }
  }, [isOpen, isMinimized])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      text: text.trim(),
      sender: 'patient',
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsTyping(true)

    try {
      const baseUrl = apiUrl || import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${baseUrl}/api/chat/widget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          orgId,
          language,
          conversationId,
        }),
      })

      const data = await res.json()

      if (data.conversationId) {
        setConversationId(data.conversationId)
      }

      const aiMessage: Message = {
        id: `msg-${Date.now()}-ai`,
        text: data.reply || (language === 'ar' ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.' : 'Sorry, an error occurred. Please try again.'),
        sender: 'ai',
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, aiMessage])
    } catch {
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        text: language === 'ar' ? 'عذراً، لم أتمكن من الاتصال. يرجى المحاولة لاحقاً.' : 'Sorry, I couldn\'t connect. Please try again later.',
        sender: 'ai',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }, [orgId, language, conversationId, apiUrl])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const handleQuickReply = (reply: QuickReply) => {
    sendMessage(reply.value)
  }

  const positionClasses = position === 'bottom-left'
    ? 'bottom-4 start-4'
    : 'bottom-4 end-4'

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed z-[9999] w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110',
          positionClasses
        )}
        style={{ backgroundColor: themeColor }}
        aria-label={t.title}
      >
        <MessageSquare className="h-6 w-6 text-white" />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <div className={cn('fixed z-[9999]', positionClasses)}>
        <button
          onClick={() => setIsMinimized(false)}
          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          style={{ backgroundColor: themeColor }}
        >
          <MessageSquare className="h-6 w-6 text-white" />
          {messages.length > 1 && (
            <span className="absolute -top-1 -end-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              !
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'fixed z-[9999] w-[380px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-white',
        positionClasses
      )}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between text-white flex-shrink-0"
        style={{ backgroundColor: themeColor }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white bg-opacity-20 flex items-center justify-center">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span className="font-semibold">{t.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex',
              msg.sender === 'patient' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                msg.sender === 'patient'
                  ? 'bg-gray-200 text-gray-900 rounded-ee-none'
                  : 'text-white rounded-es-none'
              )}
              style={msg.sender === 'ai' ? { backgroundColor: themeColor } : undefined}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
              <p className={cn(
                'text-[10px] mt-1',
                msg.sender === 'patient' ? 'text-gray-400' : 'text-white text-opacity-70'
              )}>
                {msg.timestamp.toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-es-none px-4 py-3 text-white"
              style={{ backgroundColor: themeColor }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Quick Replies */}
        {messages.length <= 1 && !isTyping && (
          <div className="flex flex-wrap gap-2 mt-2">
            {quickReplies.map((reply) => (
              <button
                key={reply.value}
                onClick={() => handleQuickReply(reply)}
                className="px-3 py-1.5 rounded-full border text-sm transition-colors hover:bg-gray-100"
                style={{ borderColor: themeColor, color: themeColor }}
              >
                {reply.label}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            className="flex-1 px-3 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-opacity-50"
            style={{ ['--tw-ring-color' as any]: themeColor }}
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: themeColor }}
          >
            {isTyping ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
