/**
 * TawafudWidget – React wrapper component for the Tawafud embeddable chat widget.
 *
 * Renders the self-contained widget inline (without Shadow DOM) for use
 * inside the main React app. The standalone embeddable version (with Shadow DOM)
 * lives at frontend/src/widget/index.tsx and is compiled as widget.js.
 *
 * Usage inside the app:
 *   <TawafudWidget orgId="org123" lang="ar" theme="teal" />
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageCircle, X, Send } from 'lucide-react'
import { cn } from '../../lib/utils'

// ─── Types ────────────────────────────────────────────────────────────
export interface TawafudWidgetProps {
  orgId?: string
  lang?: 'ar' | 'en'
  theme?: 'teal' | 'blue' | 'green' | 'purple'
  position?: 'bottom-right' | 'bottom-left'
  greeting?: string
  baseUrl?: string
  /** If true, widget is always open (embedded mode) */
  embedded?: boolean
  className?: string
}

interface Message {
  id: string
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
}

interface ConversationEntry {
  role: 'user' | 'assistant'
  content: string
}

// ─── i18n ────────────────────────────────────────────────────────────
const T = {
  ar: {
    title: 'مساعد توافد الذكي',
    subtitle: 'متصل الآن',
    placeholder: 'اكتب رسالتك...',
    greeting: 'مرحباً! كيف أقدر أساعدك اليوم؟',
    typing: 'يكتب...',
    poweredBy: 'مدعوم بتقنية توافد',
    errorMsg: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
    quickActions: [
      { label: '📅 حجز موعد', value: 'أريد حجز موعد طبي' },
      { label: '❓ استفسار عام', value: 'لدي استفسار عام' },
      { label: '🚨 حالة طارئة', value: 'لدي حالة طارئة طبية' },
    ],
  },
  en: {
    title: 'Tawafud AI Assistant',
    subtitle: 'Online Now',
    placeholder: 'Type your message...',
    greeting: 'Hello! How can I help you today?',
    typing: 'Typing...',
    poweredBy: 'Powered by Tawafud',
    errorMsg: 'Sorry, an error occurred. Please try again.',
    quickActions: [
      { label: '📅 Book Appointment', value: 'I want to book a medical appointment' },
      { label: '❓ General Inquiry', value: 'I have a general inquiry' },
      { label: '🚨 Emergency', value: 'I have a medical emergency' },
    ],
  },
}

// ─── Theme Map ────────────────────────────────────────────────────────
const THEMES = {
  teal:   { bg: 'bg-primary-600',   hover: 'hover:bg-primary-700',   ring: 'ring-primary-300',   text: 'text-primary-600',   light: 'bg-primary-50',   border: 'border-primary-200'  },
  blue:   { bg: 'bg-blue-600',   hover: 'hover:bg-blue-700',   ring: 'ring-blue-300',   text: 'text-blue-600',   light: 'bg-blue-50',   border: 'border-blue-200'  },
  green:  { bg: 'bg-green-600',  hover: 'hover:bg-green-700',  ring: 'ring-green-300',  text: 'text-green-600',  light: 'bg-green-50',  border: 'border-green-200' },
  purple: { bg: 'bg-purple-600', hover: 'hover:bg-purple-700', ring: 'ring-purple-300', text: 'text-purple-600', light: 'bg-purple-50', border: 'border-purple-200'},
}

// ─── Generate ID ──────────────────────────────────────────────────────
function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ─── API ──────────────────────────────────────────────────────────────
async function sendMessage(
  baseUrl: string,
  sessionId: string,
  message: string,
  history: ConversationEntry[]
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/demo-chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId, conversationHistory: history }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.message || 'API error')
  return data.response || data.reply || ''
}

// ─── Component ────────────────────────────────────────────────────────
export default function TawafudWidget({
  orgId: _orgId = 'default',
  lang = 'ar',
  theme = 'teal',
  position = 'bottom-right',
  greeting,
  baseUrl = '',
  embedded = false,
  className,
}: TawafudWidgetProps) {
  const t = T[lang]
  const colors = THEMES[theme]
  const isRtl = lang === 'ar'
  const dir = isRtl ? 'rtl' : 'ltr'

  const [isOpen, setIsOpen] = useState(embedded)
  const [messages, setMessages] = useState<Message[]>([])
  const [history, setHistory] = useState<ConversationEntry[]>([])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sessionId = useRef(uid())

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isTyping, scrollToBottom])

  // Send initial greeting when opened
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greetingText = greeting || t.greeting
      setMessages([
        {
          id: uid(),
          text: greetingText,
          sender: 'ai',
          timestamp: new Date(),
        },
      ])
      setHistory([{ role: 'assistant', content: greetingText }])
    }
  }, [isOpen, greeting, t.greeting, messages.length])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  const addMessage = useCallback((text: string, sender: 'user' | 'ai') => {
    const msg: Message = { id: uid(), text, sender, timestamp: new Date() }
    setMessages((prev) => [...prev, msg])
    setHistory((prev) => [...prev, { role: sender === 'user' ? 'user' : 'assistant', content: text }])
  }, [])

  const handleSend = useCallback(
    async (text?: string) => {
      const message = (text || input).trim()
      if (!message || isTyping) return

      setInput('')
      setShowQuickActions(false)
      addMessage(message, 'user')
      setIsTyping(true)

      try {
        const reply = await sendMessage(baseUrl, sessionId.current, message, history)
        addMessage(reply, 'ai')
      } catch {
        addMessage(t.errorMsg, 'ai')
      } finally {
        setIsTyping(false)
      }
    },
    [input, isTyping, addMessage, baseUrl, history, t.errorMsg]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const positionClass =
    position === 'bottom-left'
      ? 'bottom-6 left-6'
      : 'bottom-6 right-6'

  const windowPositionClass =
    position === 'bottom-left'
      ? 'bottom-20 left-6'
      : 'bottom-20 right-6'

  // Embedded mode: render just the chat window inline
  if (embedded) {
    return (
      <div
        className={cn(
          'flex flex-col bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden',
          className
        )}
        dir={dir}
        lang={lang}
      >
        <ChatHeader t={t} colors={colors} />
        <ChatMessages
          messages={messages}
          isTyping={isTyping}
          isRtl={isRtl}
          colors={colors}
          showQuickActions={showQuickActions}
          quickActions={t.quickActions}
          onQuickAction={(v) => handleSend(v)}
          messagesEndRef={messagesEndRef}
        />
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={() => handleSend()}
          onKeyDown={handleKeyDown}
          isTyping={isTyping}
          placeholder={t.placeholder}
          isRtl={isRtl}
          colors={colors}
          inputRef={inputRef}
        />
        <div className="py-2 text-center text-xs text-gray-400 border-t border-gray-100">
          {t.poweredBy} ✦
        </div>
      </div>
    )
  }

  // Floating widget mode
  return (
    <div dir={dir} lang={lang}>
      {/* Chat Window */}
      <div
        className={cn(
          'fixed z-50 w-96 max-h-[calc(100vh-6rem)] flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden transition-all duration-300',
          windowPositionClass,
          isOpen
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none'
        )}
        style={{ maxWidth: 'calc(100vw - 3rem)' }}
      >
        <ChatHeader t={t} colors={colors} onClose={() => setIsOpen(false)} />
        <ChatMessages
          messages={messages}
          isTyping={isTyping}
          isRtl={isRtl}
          colors={colors}
          showQuickActions={showQuickActions}
          quickActions={t.quickActions}
          onQuickAction={(v) => {
            setShowQuickActions(false)
            handleSend(v)
          }}
          messagesEndRef={messagesEndRef}
        />
        <ChatInput
          input={input}
          setInput={setInput}
          onSend={() => handleSend()}
          onKeyDown={handleKeyDown}
          isTyping={isTyping}
          placeholder={t.placeholder}
          isRtl={isRtl}
          colors={colors}
          inputRef={inputRef}
        />
        <div className="py-2 text-center text-xs text-gray-400 border-t border-gray-100">
          {t.poweredBy} ✦
        </div>
      </div>

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'fixed z-50 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-all duration-300 hover:scale-110',
          positionClass,
          isOpen ? 'bg-gray-500 hover:bg-gray-600' : `${colors.bg} ${colors.hover}`
        )}
        aria-label={isOpen ? 'إغلاق المحادثة' : 'فتح المحادثة'}
      >
        {isOpen ? <X size={22} /> : <MessageCircle size={24} />}
      </button>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────

function ChatHeader({
  t,
  colors,
  onClose,
}: {
  t: typeof T['ar']
  colors: typeof THEMES['teal']
  onClose?: () => void
}) {
  return (
    <div className={cn('flex items-center justify-between px-5 py-4 text-white', colors.bg)}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
          <MessageCircle size={18} />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">{t.title}</p>
          <p className="text-xs opacity-80">● {t.subtitle}</p>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="إغلاق"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

function ChatMessages({
  messages,
  isTyping,
  isRtl,
  colors,
  showQuickActions,
  quickActions,
  onQuickAction,
  messagesEndRef,
}: {
  messages: Message[]
  isTyping: boolean
  isRtl: boolean
  colors: typeof THEMES['teal']
  showQuickActions: boolean
  quickActions: { label: string; value: string }[]
  onQuickAction: (v: string) => void
  messagesEndRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-3 min-h-0">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'flex flex-col max-w-[80%]',
            msg.sender === 'user' ? (isRtl ? 'self-start' : 'self-end') : (isRtl ? 'self-end' : 'self-start')
          )}
        >
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words',
              msg.sender === 'ai'
                ? cn(colors.bg, 'text-white', isRtl ? 'rounded-br-sm' : 'rounded-bl-sm')
                : 'bg-gray-200 text-gray-800 ' + (isRtl ? 'rounded-bl-sm' : 'rounded-br-sm')
            )}
          >
            {msg.text}
          </div>
          <p className="text-[10px] text-gray-400 mt-1 px-1">
            {msg.timestamp.toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      ))}

      {/* Quick actions */}
      {showQuickActions && messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {quickActions.map((qa) => (
            <button
              key={qa.value}
              onClick={() => onQuickAction(qa.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs border transition-all duration-200',
                colors.border,
                colors.text,
                'bg-white hover:text-white',
                `hover:${colors.bg}`
              )}
              style={{ transition: 'all 0.2s' }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Typing indicator */}
      {isTyping && (
        <div className={cn('flex items-center gap-1.5 px-4 py-3 rounded-2xl text-white w-fit', colors.bg, isRtl ? 'rounded-br-sm' : 'rounded-bl-sm')}>
          {[0, 150, 300].map((delay, i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

function ChatInput({
  input,
  setInput,
  onSend,
  onKeyDown,
  isTyping,
  placeholder,
  isRtl,
  colors,
  inputRef,
}: {
  input: string
  setInput: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  isTyping: boolean
  placeholder: string
  isRtl: boolean
  colors: typeof THEMES['teal']
  inputRef: React.RefObject<HTMLInputElement>
}) {
  return (
    <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        dir={isRtl ? 'rtl' : 'ltr'}
        disabled={isTyping}
        className="flex-1 px-4 py-2 rounded-full bg-gray-100 text-sm outline-none focus:ring-2 ring-offset-1 disabled:opacity-50 transition-all"
        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
      />
      <button
        onClick={onSend}
        disabled={!input.trim() || isTyping}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-all',
          input.trim() && !isTyping
            ? cn(colors.bg, colors.hover)
            : 'bg-gray-300 cursor-not-allowed'
        )}
        aria-label="إرسال"
      >
        <Send size={15} />
      </button>
    </div>
  )
}
