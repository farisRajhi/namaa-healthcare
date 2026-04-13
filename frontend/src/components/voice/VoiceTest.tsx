import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Mic, MicOff, Phone, PhoneOff, Volume2, Loader2, Wifi, WifiOff, Settings, AlertTriangle, CheckCircle } from 'lucide-react'

type Dialect = 'gulf' | 'egyptian' | 'levantine' | 'msa'

const dialectOptions: { value: Dialect; label: string; labelAr: string; flag: string }[] = [
  { value: 'gulf', label: 'Gulf', labelAr: 'خليجي', flag: '🇸🇦' },
  { value: 'egyptian', label: 'Egyptian', labelAr: 'مصري', flag: '🇪🇬' },
  { value: 'levantine', label: 'Levantine', labelAr: 'شامي', flag: '🇱🇧' },
  { value: 'msa', label: 'MSA', labelAr: 'فصحى', flag: '📖' },
]

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
}

interface VoiceTestConfig {
  available: boolean
  configured: boolean
  stats: {
    departments: number
    providers: number
    services: number
  }
  dialects: { value: string; label: string; labelEn: string }[]
}

// Audio worklet processor code
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

export default function VoiceTest() {
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

  // Fetch voice test configuration
  const { data: config, isLoading: configLoading } = useQuery<VoiceTestConfig>({
    queryKey: ['voice-test-config'],
    queryFn: async () => {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/voice/test/config', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      return res.json()
    },
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
      console.error('Error playing audio:', err)
      isPlayingRef.current = false
      setIsPlaying(false)
      playNextAudio()
    }
  }, [])

  const handleWebSocketMessage = useCallback((event: MessageEvent) => {
    // WebSocket message received
    try {
      const message = JSON.parse(event.data)
      // Parsed message
      switch (message.type) {
        case 'connected':
          // Backend connected, sending start message
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const startMessage = { type: 'start', dialect: selectedDialect }
            // Sending delayed start message
            wsRef.current.send(JSON.stringify(startMessage))
          }
          break
        case 'ready':
          setIsConnected(true)
          setIsConnecting(false)
          // AI will send its own greeting, don't add hardcoded message
          break
        case 'audio':
          const binaryString = atob(message.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          audioQueueRef.current.push(bytes.buffer)
          playNextAudio()
          break
        case 'text':
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            text: message.text,
          }])
          break
        case 'interrupted':
          audioQueueRef.current = []
          isPlayingRef.current = false
          setIsPlaying(false)
          break
        case 'error':
          setError(message.message)
          break
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err)
    }
  }, [playNextAudio, selectedDialect])

  const connect = async () => {
    setIsConnecting(true)
    setError(null)
    setMessages([])

    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Not authenticated')
        return
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/voice/test?token=${token}`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // WebSocket opened - wait for backend to send "connected" first
      }
      ws.onmessage = handleWebSocketMessage
      ws.onerror = () => {
        console.error('[VoiceTest] WebSocket error')
        setError('Connection failed')
        setIsConnecting(false)
        setIsConnected(false)
      }
      ws.onclose = () => {
        // WebSocket closed
        setIsConnected(false)
        setIsRecording(false)
        stopRecording()
      }
    } catch (err) {
      console.error('Connection error:', err)
      setError('Connection failed')
      setIsConnecting(false)
    }
  }

  const disconnect = () => {
    stopRecording()
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }))
      wsRef.current.close()
      wsRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (playbackContextRef.current) {
      playbackContextRef.current.close()
      playbackContextRef.current = null
    }
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsConnected(false)
    setIsRecording(false)
    setIsPlaying(false)
  }

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
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
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          wsRef.current.send(JSON.stringify({ type: 'audio', data: btoa(binary) }))
        }
      }
      source.connect(workletNode)
      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('Error starting recording:', err)
      setError('Could not access microphone')
    }
  }

  const stopRecording = () => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsRecording(false)
  }

  const toggleRecording = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  if (configLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
        <p className="text-gray-600">Loading voice test configuration...</p>
      </div>
    )
  }

  if (!config?.configured) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Setup Required</h3>
            <p className="text-gray-600 mb-4">
              To test the voice assistant with your data, you need to configure:
            </p>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                {config?.stats.departments ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Settings className="w-4 h-4 text-gray-400" />
                )}
                <span>Departments ({config?.stats.departments || 0})</span>
              </li>
              <li className="flex items-center gap-2">
                {config?.stats.services ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Settings className="w-4 h-4 text-gray-400" />
                )}
                <span>Services ({config?.stats.services || 0})</span>
              </li>
              <li className="flex items-center gap-2">
                {config?.stats.providers ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <Settings className="w-4 h-4 text-gray-400" />
                )}
                <span>Providers ({config?.stats.providers || 0})</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">Test Voice Assistant</h3>
              <p className="text-sm text-primary-100 flex items-center gap-1">
                {isConnected ? (
                  <><Wifi className="w-3 h-3" /> Connected - Real-time</>
                ) : isConnecting ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Connecting...</>
                ) : (
                  <><WifiOff className="w-3 h-3" /> Disconnected</>
                )}
              </p>
            </div>
          </div>
          <div className="text-sm text-primary-100">
            <span className="bg-white/20 px-2 py-1 rounded">
              {config?.stats.providers} providers | {config?.stats.services} services
            </span>
          </div>
        </div>
      </div>

      {/* Dialect selector */}
      {!isConnected && !isConnecting && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Dialect</label>
          <div className="grid grid-cols-4 gap-2">
            {dialectOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedDialect(option.value)}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 transition-all ${
                  selectedDialect === option.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="text-lg">{option.flag}</span>
                <span className="text-xs font-medium">{option.labelAr}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="h-64 overflow-y-auto p-4 bg-gray-50">
        {messages.length === 0 && !isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
            <Phone className="w-10 h-10 mb-3 text-gray-300" />
            <p className="font-medium text-gray-700">Ready to test</p>
            <p className="text-sm text-gray-500 mt-1">
              The AI will use your actual data (providers, services, schedules)
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-gray-200 text-gray-800 rounded-tl-sm'
                      : 'bg-primary-600 text-white rounded-tr-sm'
                  }`}
                >
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            ))}
            {isPlaying && (
              <div className="flex justify-end">
                <div className="bg-primary-100 text-primary-600 rounded-2xl px-4 py-2 rounded-tr-sm flex items-center gap-2">
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">Speaking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm text-center">{error}</div>
      )}

      {/* Controls */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center justify-center gap-4">
          {!isConnected && !isConnecting ? (
            <button
              onClick={connect}
              className="w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
            >
              <Phone className="w-6 h-6" />
            </button>
          ) : (
            <>
              <button
                onClick={disconnect}
                className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
              <button
                onClick={toggleRecording}
                disabled={isConnecting}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isRecording
                    ? 'bg-red-500 animate-pulse'
                    : isConnecting
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 hover:scale-105'
                } text-white`}
              >
                {isConnecting ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-6 h-6" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
              <div className="w-10" />
            </>
          )}
        </div>
        {(isConnected || isConnecting) && (
          <p className="text-center text-sm text-gray-500 mt-3">
            {isConnecting ? 'Connecting...' : isRecording ? 'Listening... Click to stop' : 'Click microphone to speak'}
          </p>
        )}
      </div>
    </div>
  )
}
