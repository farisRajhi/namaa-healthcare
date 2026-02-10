import { useState, useEffect, useRef, useCallback } from 'react'

export interface WsChatMessage {
  id: string
  content: string
  sender: 'user' | 'ai'
  timestamp: string
}

interface ServerMessage {
  type: 'message' | 'typing' | 'history' | 'error'
  // message fields
  id?: string
  content?: string
  sender?: 'user' | 'ai'
  timestamp?: string
  // typing fields
  isTyping?: boolean
  // history fields
  conversationId?: string
  messages?: WsChatMessage[]
  // error fields
  message?: string
}

interface UseWebSocketChatOptions {
  /** If null/undefined, a new conversation is created server-side */
  conversationId?: string | null
  /** Called when server assigns a conversationId (for new conversations) */
  onConversationId?: (id: string) => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000]

export function useWebSocketChat(options: UseWebSocketChatOptions = {}) {
  const { conversationId, onConversationId } = options

  const [messages, setMessages] = useState<WsChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intentionalClose = useRef(false)
  const resolvedConversationId = useRef<string | null>(conversationId ?? null)
  const onConversationIdRef = useRef(onConversationId)
  onConversationIdRef.current = onConversationId

  // Build WebSocket URL relative to current page
  const buildWsUrl = useCallback(() => {
    const token = localStorage.getItem('token')
    if (!token) return null

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host // includes port
    let url = `${proto}//${host}/api/chat/ws?token=${encodeURIComponent(token)}`
    const cid = resolvedConversationId.current
    if (cid) {
      url += `&conversationId=${encodeURIComponent(cid)}`
    }
    return url
  }, [])

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    const url = buildWsUrl()
    if (!url) {
      setError('No auth token found')
      return
    }

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)
      reconnectAttempt.current = 0
    }

    ws.onmessage = (event) => {
      let data: ServerMessage
      try {
        data = JSON.parse(event.data as string) as ServerMessage
      } catch {
        return
      }

      switch (data.type) {
        case 'history': {
          if (data.conversationId && !resolvedConversationId.current) {
            resolvedConversationId.current = data.conversationId
            onConversationIdRef.current?.(data.conversationId)
          }
          if (data.messages) {
            setMessages(data.messages)
          }
          break
        }
        case 'message': {
          if (data.id && data.content != null && data.sender && data.timestamp) {
            const msg: WsChatMessage = {
              id: data.id,
              content: data.content,
              sender: data.sender,
              timestamp: data.timestamp,
            }
            setMessages((prev) => [...prev, msg])
          }
          break
        }
        case 'typing': {
          setIsTyping(!!data.isTyping)
          break
        }
        case 'error': {
          setError(data.message ?? 'Unknown error')
          break
        }
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null

      if (!intentionalClose.current) {
        // Auto-reconnect with exponential back-off
        const delay = RECONNECT_DELAYS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)]
        reconnectAttempt.current += 1
        reconnectTimer.current = setTimeout(() => {
          connect()
        }, delay)
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror; nothing extra needed
    }
  }, [buildWsUrl])

  // Connect on mount / when conversationId changes
  useEffect(() => {
    resolvedConversationId.current = conversationId ?? null
    intentionalClose.current = false
    connect()

    return () => {
      intentionalClose.current = true
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      setIsConnected(false)
    }
  }, [conversationId, connect])

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected')
      return
    }

    // Optimistically add user message
    const optimistic: WsChatMessage = {
      id: `opt-${Date.now()}`,
      content,
      sender: 'user',
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimistic])

    wsRef.current.send(JSON.stringify({ type: 'message', content }))
  }, [])

  const disconnect = useCallback(() => {
    intentionalClose.current = true
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsConnected(false)
  }, [])

  const resetMessages = useCallback(() => {
    setMessages([])
    setIsTyping(false)
    setError(null)
  }, [])

  return {
    messages,
    sendMessage,
    isTyping,
    isConnected,
    error,
    disconnect,
    resetMessages,
  }
}
