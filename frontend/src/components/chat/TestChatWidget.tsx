import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MessageSquare, MessageSquareOff, X, Plus, Loader2, Wifi, WifiOff } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatRequirements } from './ChatRequirements'
import { useWebSocketChat, WsChatMessage } from '../../hooks/useWebSocketChat'

interface RestMessage {
  messageId: string
  direction: 'in' | 'out'
  bodyText: string
  createdAt: string
}

interface ReadinessResponse {
  isReady: boolean
  requirements: {
    hasDepartment: boolean
    hasFacility: boolean
    hasProviderWithAvailability: boolean
  }
  counts: {
    departments: number
    facilities: number
  }
}

export default function TestChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [useWs, setUseWs] = useState(true) // try WebSocket first
  const [restMessages, setRestMessages] = useState<RestMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // ── WebSocket chat hook ──
  const {
    messages: wsMessages,
    sendMessage: wsSendMessage,
    isTyping,
    isConnected,
    disconnect: wsDisconnect,
    resetMessages,
  } = useWebSocketChat({
    conversationId: isOpen && useWs ? conversationId : undefined,
    onConversationId: (id) => {
      if (!conversationId) setConversationId(id)
    },
  })

  // Fall back to REST if WS never connects after 5 seconds
  useEffect(() => {
    if (!isOpen || !useWs) return
    const timer = setTimeout(() => {
      if (!isConnected) {
        setUseWs(false)
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [isOpen, useWs, isConnected])

  // ── Check readiness ──
  const { data: readiness, isLoading: isLoadingReadiness } = useQuery<ReadinessResponse>({
    queryKey: ['chat-readiness'],
    queryFn: () => api.get('/api/chat/readiness').then((r) => r.data),
    refetchInterval: 10000,
  })

  // ── REST fallback: Fetch conversation ──
  const { data: conversation, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['chat-conversation', conversationId],
    queryFn: () =>
      api.get(`/api/chat/conversation/${conversationId}`).then((r) => r.data as { messages: RestMessage[] }),
    enabled: !!conversationId && !useWs,
  })

  useEffect(() => {
    if (!useWs && conversation?.messages) {
      setRestMessages(conversation.messages)
    }
  }, [conversation, useWs])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [wsMessages, restMessages, isTyping])

  // ── REST fallback: Send message ──
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await api.post('/api/chat/message', { conversationId, message })
      return response.data as { conversationId: string; response: string }
    },
    onMutate: (message) => {
      const temp: RestMessage = {
        messageId: `temp-${Date.now()}`,
        direction: 'in',
        bodyText: message,
        createdAt: new Date().toISOString(),
      }
      setRestMessages((prev) => [...prev, temp])
    },
    onSuccess: (data) => {
      if (!conversationId && data.conversationId) setConversationId(data.conversationId)
      const aiMsg: RestMessage = {
        messageId: `ai-${Date.now()}`,
        direction: 'out',
        bodyText: data.response,
        createdAt: new Date().toISOString(),
      }
      setRestMessages((prev) => [...prev, aiMsg])
    },
    onError: () => {
      setRestMessages((prev) => prev.filter((m) => !m.messageId.startsWith('temp-')))
    },
  })

  // ── Start new conversation ──
  const newConversationMutation = useMutation({
    mutationFn: () => api.post('/api/chat/new').then((r) => r.data as { conversationId: string }),
    onSuccess: (data) => {
      wsDisconnect()
      resetMessages()
      setRestMessages([])
      setConversationId(data.conversationId)
      setUseWs(true) // try WS again for new conv
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
    },
  })

  // ── Unified message list ──
  const displayMessages: { id: string; direction: 'in' | 'out'; content: string; createdAt: string }[] =
    useWs
      ? wsMessages.map((m: WsChatMessage) => ({
          id: m.id,
          direction: m.sender === 'user' ? ('in' as const) : ('out' as const),
          content: m.content,
          createdAt: m.timestamp,
        }))
      : restMessages.map((m) => ({
          id: m.messageId,
          direction: m.direction,
          content: m.bodyText,
          createdAt: m.createdAt,
        }))

  // ── Send handler ──
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return
    if (useWs && isConnected) {
      wsSendMessage(inputValue)
    } else {
      if (sendMessageMutation.isPending) return
      sendMessageMutation.mutate(inputValue)
    }
    setInputValue('')
  }, [inputValue, useWs, isConnected, wsSendMessage, sendMessageMutation])

  const handleNewChat = () => {
    newConversationMutation.mutate()
  }

  const isReady = readiness?.isReady ?? false
  const isSending = !useWs && sendMessageMutation.isPending

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        disabled={isLoadingReadiness}
        className={cn(
          'fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-all z-40',
          isReady
            ? 'bg-primary-600 text-white hover:bg-primary-700 hover:shadow-xl'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        )}
        title={isReady ? 'Open test chat' : 'Complete setup to enable test chat'}
      >
        {isReady ? (
          <MessageSquare className="h-6 w-6" />
        ) : (
          <MessageSquareOff className="h-6 w-6" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary-600 text-white">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <span className="font-medium">Test Chat</span>
              {/* Connection status indicator */}
              {useWs && (
                <span
                  title={isConnected ? 'متصل (WebSocket)' : 'غير متصل'}
                  className="flex items-center"
                >
                  {isConnected ? (
                    <Wifi className="h-3.5 w-3.5 text-green-300" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-red-300" />
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {isReady && (
                <button
                  onClick={handleNewChat}
                  disabled={newConversationMutation.isPending}
                  className="p-1.5 hover:bg-primary-500 rounded transition-colors"
                  title="New conversation"
                >
                  {newConversationMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-primary-500 rounded transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          {!isReady ? (
            <div className="flex-1 p-4 overflow-y-auto">
              <ChatRequirements
                requirements={
                  readiness?.requirements || {
                    hasDepartment: false,
                    hasFacility: false,
                    hasProviderWithAvailability: false,
                  }
                }
              />
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
                {!useWs && isLoadingConversation ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : displayMessages.length === 0 && !isTyping ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p>Start a conversation to test your AI assistant.</p>
                    <p className="mt-1">
                      The AI knows about your services, providers, and availability.
                    </p>
                  </div>
                ) : (
                  <>
                    {displayMessages.map((message) => (
                      <ChatMessage
                        key={message.id}
                        direction={message.direction}
                        content={message.content}
                        createdAt={message.createdAt}
                      />
                    ))}
                    {/* Typing indicator */}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 text-gray-600 px-4 py-2 rounded-2xl rounded-bl-md text-sm flex items-center gap-2">
                          <span className="flex gap-1">
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                          <span>توافد تكتب...</span>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                isLoading={isSending || isTyping}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
