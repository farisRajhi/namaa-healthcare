import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Phone, PhoneOff, Mic, MicOff, X, Volume2, Loader2, Wifi } from 'lucide-react'
import { cn } from '../../lib/utils'

type Dialect = 'gulf' | 'egyptian' | 'levantine' | 'msa'

const dialectOptions: { value: Dialect; label: string; flag: string }[] = [
  { value: 'gulf', label: 'خليجي', flag: '🇸🇦' },
  { value: 'egyptian', label: 'مصري', flag: '🇪🇬' },
  { value: 'levantine', label: 'شامي', flag: '🇱🇧' },
  { value: 'msa', label: 'فصحى', flag: '📖' },
]

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface VoiceTestConfig {
  available: boolean
  configured: boolean
  stats: { departments: number; providers: number; services: number; allProviders?: number; allServices?: number }
}

const audioWorkletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input.length > 0) {
      const inputChannel = input[0];
      for (let i = 0; i < inputChannel.length; i++) {
        this.buffer[this.bufferIndex++] = inputChannel[i];
        if (this.bufferIndex >= this.bufferSize) {
          const int16Buffer = new Int16Array(this.bufferSize);
          for (let j = 0; j < this.bufferSize; j++) {
            const s = Math.max(-1, Math.min(1, this.buffer[j]));
            int16Buffer[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          this.port.postMessage(int16Buffer.buffer, [int16Buffer.buffer]);
          this.buffer = new Float32Array(this.bufferSize);
          this.bufferIndex = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export default function VoiceTestWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedDialect, setSelectedDialect] = useState<Dialect>('gulf')
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)

  const { data: config, isLoading: configLoading } = useQuery<VoiceTestConfig>({
    queryKey: ['voice-test-config'],
    queryFn: async () => {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/voice/test/config', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      const data = await res.json()
      // Voice test config loaded
      return data
    },
    refetchInterval: 10000,
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => { disconnect() }
  }, [])

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return
    isPlayingRef.current = true
    setIsPlaying(true)
    const audioData = audioQueueRef.current.shift()!
    try {
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 })
      }
      const ctx = playbackContextRef.current
      const int16Array = new Int16Array(audioData)
      const float32Array = new Float32Array(int16Array.length)
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0
      }
      const audioBuffer = ctx.createBuffer(1, float32Array.length, 24000)
      audioBuffer.getChannelData(0).set(float32Array)
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      source.connect(ctx.destination)
      source.onended = () => {
        isPlayingRef.current = false
        setIsPlaying(audioQueueRef.current.length > 0)
        playNextAudio()
      }
      source.start()
    } catch (err) {
      isPlayingRef.current = false
      setIsPlaying(false)
      playNextAudio()
    }
  }, [])

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    try {
      const message = JSON.parse(event.data)
      switch (message.type) {
        case 'connected':
          // Backend connected, sending start message
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const startMessage = { type: 'start', dialect: selectedDialect }
            // Sending start message
            wsRef.current.send(JSON.stringify(startMessage))
          }
          break
        case 'ready':
          setIsConnected(true)
          setIsConnecting(false)
          // AI will send its own greeting, don't add hardcoded message
          break
        case 'error':
          // Server error received
          setError(message.message || 'Connection error')
          setIsConnecting(false)
          setIsConnected(false)
          break
        case 'audio':
          const binaryString = atob(message.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
          audioQueueRef.current.push(bytes.buffer)
          playNextAudio()
          break
        case 'text':
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: message.text }])
          break
        case 'interrupted':
          audioQueueRef.current = []
          isPlayingRef.current = false
          setIsPlaying(false)
          break
      }
    } catch (err) {
      console.error('Error parsing message:', err)
    }
  }, [playNextAudio, selectedDialect])

  const connect = async () => {
    setIsConnecting(true)
    setError(null)
    setMessages([])
    try {
      const token = localStorage.getItem('token')
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/voice/test?token=${token}`
      // Connecting to WebSocket
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onopen = () => {
        // WebSocket opened, waiting for backend connected message
      }
      ws.onmessage = handleWebSocketMessage
      ws.onerror = () => {
        console.error('WebSocket connection error')
        setError('فشل الاتصال')
        setIsConnecting(false)
        setIsConnected(false)
      }
      ws.onclose = () => {
        // WebSocket closed
        setIsConnected(false)
        setIsRecording(false)
        stopRecording()
      }
    } catch {
      console.error('WebSocket connection failed')
      setError('فشل الاتصال')
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    stopRecording()
    if (wsRef.current) { wsRef.current.send(JSON.stringify({ type: 'stop' })); wsRef.current.close(); wsRef.current = null }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null }
    if (playbackContextRef.current) { playbackContextRef.current.close(); playbackContextRef.current = null }
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsConnected(false)
    setIsRecording(false)
    setIsPlaying(false)
  }

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { setError('غير متصل'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true } })
      mediaStreamRef.current = stream
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      const blob = new Blob([audioWorkletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)
      await audioContext.audioWorklet.addModule(workletUrl)
      URL.revokeObjectURL(workletUrl)
      const source = audioContext.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
      workletNodeRef.current = workletNode
      workletNode.port.onmessage = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const bytes = new Uint8Array(event.data)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
          wsRef.current.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
        }
      }
      source.connect(workletNode)
      setIsRecording(true)
      setError(null)
    } catch (err) {
      setError('لم نتمكن من الوصول للميكروفون')
    }
  }

  const stopRecording = () => {
    if (workletNodeRef.current) { workletNodeRef.current.disconnect(); workletNodeRef.current = null }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
    if (audioContextRef.current?.state !== 'closed') { audioContextRef.current?.close(); audioContextRef.current = null }
    setIsRecording(false)
  }

  const toggleRecording = () => { if (isRecording) stopRecording(); else startRecording() }

  const handleClose = () => {
    disconnect()
    setIsOpen(false)
  }

  const isReady = config?.configured ?? false

  return (
    <>
      {/* Floating button - positioned left of chat widget */}
      <button
        onClick={() => setIsOpen(true)}
        disabled={configLoading}
        className={cn(
          'fixed bottom-6 right-20 p-4 rounded-full shadow-lg transition-all z-40',
          isReady
            ? 'bg-green-600 text-white hover:bg-green-700 hover:shadow-xl'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        )}
        title={isReady ? 'Test voice assistant' : 'Complete setup to enable voice test'}
      >
        {isReady ? <Phone className="h-6 w-6" /> : <PhoneOff className="h-6 w-6" />}
      </button>

      {/* Voice panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-20 w-80 bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 border border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-green-600 text-white">
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              <span className="font-medium">Voice Test</span>
              {isConnected && (
                <span className="flex items-center gap-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
                  <Wifi className="h-3 w-3" /> Live
                </span>
              )}
            </div>
            <button onClick={handleClose} className="p-1.5 hover:bg-green-500 rounded">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isReady ? (
            <div className="p-4 text-center text-gray-500">
              <PhoneOff className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="font-medium text-gray-700">Setup Required</p>
              <p className="text-sm mt-1">
                {config?.stats ? (
                  <>
                    Missing: {[
                      config.stats.departments === 0 && 'departments',
                      config.stats.providers === 0 && 'active providers',
                      config.stats.services === 0 && 'active services',
                    ].filter(Boolean).join(', ')}
                  </>
                ) : (
                  'Add departments, providers & services first'
                )}
              </p>
              {config?.stats && (
                <div className="text-xs mt-2 text-gray-400 space-y-1">
                  <div>Departments: {config.stats.departments}</div>
                  <div>Providers: {config.stats.providers} active {config.stats.allProviders && config.stats.allProviders > config.stats.providers ? `(${config.stats.allProviders} total)` : ''}</div>
                  <div>Services: {config.stats.services} active {config.stats.allServices && config.stats.allServices > config.stats.services ? `(${config.stats.allServices} total)` : ''}</div>
                </div>
              )}
            </div>
          ) : !isConnected && !isConnecting ? (
            <div className="p-4">
              <p className="text-sm text-gray-600 mb-3 text-center">Select dialect:</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {dialectOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedDialect(opt.value)}
                    className={cn(
                      'flex items-center justify-center gap-2 px-3 py-2 rounded-lg border-2 text-sm',
                      selectedDialect === opt.value
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <span>{opt.flag}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={connect}
                className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Phone className="h-5 w-5" />
                Start Call
              </button>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="h-48 overflow-y-auto p-3 bg-gray-50 space-y-2">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-start' : 'justify-end')}>
                    <div className={cn(
                      'max-w-[85%] rounded-xl px-3 py-2 text-sm',
                      msg.role === 'user' ? 'bg-gray-200 text-gray-800' : 'bg-green-600 text-white'
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isPlaying && (
                  <div className="flex justify-end">
                    <div className="bg-green-100 text-green-600 rounded-xl px-3 py-2 flex items-center gap-2 text-sm">
                      <Volume2 className="h-4 w-4 animate-pulse" /> Speaking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {error && <div className="px-3 py-2 bg-red-50 text-red-600 text-xs text-center">{error}</div>}

              {/* Controls */}
              <div className="p-3 bg-white border-t flex items-center justify-center gap-3">
                <button
                  onClick={handleClose}
                  className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center"
                >
                  <PhoneOff className="h-5 w-5" />
                </button>
                <button
                  onClick={toggleRecording}
                  disabled={isConnecting}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center text-white',
                    isRecording ? 'bg-red-500 animate-pulse' : isConnecting ? 'bg-gray-300' : 'bg-green-600 hover:bg-green-700'
                  )}
                >
                  {isConnecting ? <Loader2 className="h-6 w-6 animate-spin" /> : isRecording ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </button>
                <div className="w-10" />
              </div>
              <p className="text-center text-xs text-gray-500 pb-2">
                {isConnecting ? 'Connecting...' : isRecording ? 'Listening...' : 'Tap mic to speak'}
              </p>
            </>
          )}
        </div>
      )}
    </>
  )
}
