import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { MessageSquare, MessageSquareOff, X, Plus, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import { ChatRequirements } from './ChatRequirements'

interface Message {
  messageId: string
  direction: 'in' | 'out'
  bodyText: string
  createdAt: string
}

interface Conversation {
  conversationId: string
  messages: Message[]
  lastActivityAt: string
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
  const [messages, setMessages] = useState<Message[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Check readiness
  const { data: readiness, isLoading: isLoadingReadiness } = useQuery<ReadinessResponse>({
    queryKey: ['chat-readiness'],
    queryFn: () => api.get('/api/chat/readiness').then((r) => r.data),
    refetchInterval: 10000, // Refresh every 10 seconds to detect changes
  })

  // Fetch conversation when we have an ID
  const { data: conversation, isLoading: isLoadingConversation } = useQuery<Conversation>({
    queryKey: ['chat-conversation', conversationId],
    queryFn: () =>
      api.get(`/api/chat/conversation/${conversationId}`).then((r) => r.data),
    enabled: !!conversationId,
  })

  // Update messages when conversation loads
  useEffect(() => {
    if (conversation?.messages) {
      setMessages(conversation.messages)
    }
  }, [conversation])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await api.post('/api/chat/message', {
        conversationId,
        message,
      })
      return response.data
    },
    onMutate: (message) => {
      // Optimistically add user message
      const tempMessage: Message = {
        messageId: `temp-${Date.now()}`,
        direction: 'in',
        bodyText: message,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, tempMessage])
    },
    onSuccess: (data) => {
      // Update conversation ID if new
      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId)
      }
      // Add AI response
      const aiMessage: Message = {
        messageId: `ai-${Date.now()}`,
        direction: 'out',
        bodyText: data.response,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, aiMessage])
    },
    onError: () => {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => !m.messageId.startsWith('temp-')))
    },
  })

  // Start new conversation mutation
  const newConversationMutation = useMutation({
    mutationFn: () => api.post('/api/chat/new').then((r) => r.data),
    onSuccess: (data) => {
      setConversationId(data.conversationId)
      setMessages([])
      queryClient.invalidateQueries({ queryKey: ['chat-conversations'] })
    },
  })

  const handleSend = () => {
    if (!inputValue.trim() || sendMessageMutation.isPending) return
    sendMessageMutation.mutate(inputValue)
    setInputValue('')
  }

  const handleNewChat = () => {
    newConversationMutation.mutate()
  }

  const isReady = readiness?.isReady ?? false

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
              <ChatRequirements requirements={readiness?.requirements || {
                hasDepartment: false,
                hasFacility: false,
                hasProviderWithAvailability: false,
              }} />
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50">
                {isLoadingConversation ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <MessageSquare className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <p>Start a conversation to test your AI assistant.</p>
                    <p className="mt-1">
                      The AI knows about your services, providers, and availability.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <ChatMessage
                      key={message.messageId}
                      direction={message.direction}
                      content={message.bodyText}
                      createdAt={message.createdAt}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={handleSend}
                isLoading={sendMessageMutation.isPending}
              />
            </>
          )}
        </div>
      )}
    </>
  )
}
