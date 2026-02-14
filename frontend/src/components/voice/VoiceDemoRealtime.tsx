import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Volume2, Loader2, Wifi, WifiOff } from 'lucide-react'

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

// Audio worklet processor code as a string (will be created as a blob URL)
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
          // Convert Float32 to Int16
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

export default function VoiceDemoRealtime() {
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedDialect, setSelectedDialect] = useState<Dialect>('gulf')
  const [messages, setMessages] = useState<Message[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const playbackContextRef = useRef<AudioContext | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Audio playback queue
  const audioQueueRef = useRef<ArrayBuffer[]>([])
  const isPlayingRef = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentTranscript])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
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

      // Gemini returns PCM 16-bit at 24kHz
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
    try {
      const message = JSON.parse(event.data)

      switch (message.type) {
        case 'ready':
          setIsConnected(true)
          setIsConnecting(false)
          // AI will send its own greeting, don't add hardcoded message
          break

        case 'audio':
          // Decode base64 and queue for playback
          const binaryString = atob(message.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          audioQueueRef.current.push(bytes.buffer)
          playNextAudio()
          break

        case 'text':
          // AI finished speaking, add to messages
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            text: message.text,
          }])
          break

        case 'transcript':
          // User speech transcript
          if (message.isFinal) {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              role: 'user',
              text: message.text,
            }])
            setCurrentTranscript('')
          } else {
            setCurrentTranscript(message.text)
          }
          break

        case 'interrupted':
          // Clear audio queue on interruption
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
  }, [playNextAudio])

  const connect = async () => {
    setIsConnecting(true)
    setError(null)
    setMessages([])

    try {
      // Create WebSocket connection using current host (goes through Vite proxy in dev)
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/voice/demo/realtime`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        // Send start message with dialect
        ws.send(JSON.stringify({
          type: 'start',
          dialect: selectedDialect,
        }))
      }

      ws.onmessage = handleWebSocketMessage

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setError('فشل الاتصال بالخادم')
        setIsConnecting(false)
        setIsConnected(false)
      }

      ws.onclose = () => {
        setIsConnected(false)
        setIsRecording(false)
        stopRecording()
      }

    } catch (err) {
      console.error('Connection error:', err)
      setError('فشل الاتصال')
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
    setCurrentTranscript('')
  }

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('غير متصل')
      return
    }

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      mediaStreamRef.current = stream

      // Create audio context for 16kHz
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      // Create blob URL for the worklet
      const blob = new Blob([audioWorkletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)

      await audioContext.audioWorklet.addModule(workletUrl)
      URL.revokeObjectURL(workletUrl)

      // Create source and worklet node
      const source = audioContext.createMediaStreamSource(stream)
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
      workletNodeRef.current = workletNode

      // Handle audio data from worklet
      workletNode.port.onmessage = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // Convert ArrayBuffer to base64
          const bytes = new Uint8Array(event.data)
          let binary = ''
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)

          wsRef.current.send(JSON.stringify({
            type: 'audio',
            data: base64,
          }))
        }
      }

      source.connect(workletNode)
      // Don't connect to destination - we don't want to hear ourselves

      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('Error starting recording:', err)
      setError('لم نتمكن من الوصول إلى الميكروفون')
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
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
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
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold">المساعد الصوتي الحي</h3>
              <p className="text-sm text-primary-100 flex items-center gap-1">
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3" />
                    متصل - الوقت الفعلي
                  </>
                ) : isConnecting ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    جارٍ الاتصال...
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3" />
                    غير متصل
                  </>
                )}
              </p>
            </div>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm flex items-center gap-1">
            {dialectOptions.find(d => d.value === selectedDialect)?.flag}
            {dialectLabels[selectedDialect]}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="h-64 overflow-y-auto p-4 bg-gray-50">
        {!isConnected && !isConnecting ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-center">
            <Phone className="w-10 h-10 mb-3 text-gray-300" />
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
            <p className="text-xs text-gray-400 mt-3">محادثة فورية بالوقت الفعلي</p>
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
            {currentTranscript && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-500 rounded-tl-sm italic">
                  <p className="text-sm">{currentTranscript}...</p>
                </div>
              </div>
            )}
            {isPlaying && (
              <div className="flex justify-end">
                <div className="bg-primary-100 text-primary-600 rounded-2xl px-4 py-2 rounded-tr-sm flex items-center gap-2">
                  <Volume2 className="w-4 h-4 animate-pulse" />
                  <span className="text-sm">جارٍ التحدث...</span>
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

      {/* Controls */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center justify-center gap-4">
          {!isConnected && !isConnecting ? (
            <button
              onClick={connect}
              className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
            >
              <Phone className="w-7 h-7" />
            </button>
          ) : (
            <>
              <button
                onClick={disconnect}
                className="w-12 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-all"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              <button
                onClick={toggleRecording}
                disabled={isConnecting}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isRecording
                    ? 'bg-red-500 animate-pulse'
                    : isConnecting
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 hover:scale-105'
                } text-white`}
              >
                {isConnecting ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-7 h-7" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>

              <div className="w-12" />
            </>
          )}
        </div>

        {(isConnected || isConnecting) && (
          <p className="text-center text-sm text-gray-500 mt-3">
            {isConnecting
              ? 'جارٍ الاتصال...'
              : isRecording
                ? 'جارٍ الاستماع... اضغط لإيقاف الميكروفون'
                : 'اضغط على الميكروفون للتحدث'}
          </p>
        )}
      </div>
    </div>
  )
}
