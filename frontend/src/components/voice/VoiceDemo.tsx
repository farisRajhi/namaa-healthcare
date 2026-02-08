import { useState, useRef, useEffect } from 'react'
import { Mic, MicOff, Phone, PhoneOff, Volume2, Loader2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  dialect?: string
}

type Dialect = 'gulf' | 'egyptian' | 'levantine' | 'msa'

const dialectOptions: { value: Dialect; label: string; flag: string }[] = [
  { value: 'gulf', label: 'خليجي', flag: '🇸🇦' },
  { value: 'egyptian', label: 'مصري', flag: '🇪🇬' },
  { value: 'levantine', label: 'شامي', flag: '🇱🇧' },
  { value: 'msa', label: 'فصحى', flag: '📖' },
]

const greetings: Record<Dialect, string> = {
  gulf: 'السلام عليكم، حياك الله! شلونك؟ كيف أقدر أساعدك اليوم؟',
  egyptian: 'أهلاً وسهلاً! إزيك؟ عايز تحجز موعد ولا عندك استفسار؟',
  levantine: 'أهلين فيك! كيفك؟ شو بتحب أساعدك؟',
  msa: 'السلام عليكم، أهلاً وسهلاً بك. كيف يمكنني مساعدتك اليوم؟',
}

export default function VoiceDemo() {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedDialect, setSelectedDialect] = useState<Dialect>('gulf')
  const [detectedDialect, setDetectedDialect] = useState<string>('msa')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Start a simulated call
  const startCall = async () => {
    setIsCallActive(true)
    setMessages([])
    setError(null)
    setDetectedDialect(selectedDialect)

    // Add greeting message in selected dialect
    const greeting: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      text: greetings[selectedDialect],
      dialect: selectedDialect,
    }
    setMessages([greeting])

    // Play greeting audio
    await playTTS(greeting.text, selectedDialect)
  }

  // End the call
  const endCall = () => {
    setIsCallActive(false)
    setIsRecording(false)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
  }

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((track) => track.stop())
        await processAudio(audioBlob)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      setError(null)
    } catch (err) {
      console.error('Error accessing microphone:', err)
      setError('لم نتمكن من الوصول إلى الميكروفون. يرجى السماح بالوصول.')
    }
  }

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  // Process recorded audio
  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)

    try {
      // Convert blob to base64
      const reader = new FileReader()
      const base64Audio = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1]
          resolve(base64)
        }
        reader.readAsDataURL(audioBlob)
      })

      // Send to backend
      const response = await fetch('/api/voice/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: base64Audio,
          dialect: selectedDialect,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.text,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to process audio')
      }

      const data = await response.json()

      // Add user message
      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        text: data.transcription,
        dialect: data.dialect,
      }
      setMessages((prev) => [...prev, userMessage])
      setDetectedDialect(data.dialect || 'msa')

      // Add AI response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: data.response,
        dialect: data.dialect,
      }
      setMessages((prev) => [...prev, aiMessage])

      // Play AI response
      if (data.audioBase64) {
        await playAudioBase64(data.audioBase64)
      } else {
        await playTTS(data.response, data.dialect || 'msa')
      }
    } catch (err) {
      console.error('Error processing audio:', err)
      setError('حدث خطأ أثناء معالجة الصوت. حاول مرة أخرى.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Play audio from base64
  const playAudioBase64 = async (base64Audio: string) => {
    setIsPlaying(true)
    try {
      const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`)
      audioRef.current = audio
      audio.onended = () => setIsPlaying(false)
      await audio.play()
    } catch (err) {
      console.error('Error playing audio:', err)
      setIsPlaying(false)
    }
  }

  // Fallback TTS using browser's speech synthesis
  const playTTS = async (text: string, dialect: string) => {
    setIsPlaying(true)
    try {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'ar-SA'
      utterance.rate = 0.9
      utterance.onend = () => setIsPlaying(false)
      speechSynthesis.speak(utterance)
    } catch (err) {
      console.error('Error with TTS:', err)
      setIsPlaying(false)
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
              <h3 className="font-semibold">جرب المساعد الصوتي</h3>
              <p className="text-sm text-primary-100">
                {isCallActive ? 'المكالمة نشطة' : 'اضغط للبدء'}
              </p>
            </div>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm flex items-center gap-1">
            {dialectOptions.find(d => d.value === (isCallActive ? detectedDialect : selectedDialect))?.flag}
            {dialectLabels[isCallActive ? detectedDialect : selectedDialect]}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="h-64 overflow-y-auto p-4 bg-gray-50">
        {!isCallActive ? (
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
            <p className="text-xs text-gray-400 mt-3">سيتحدث المساعد باللهجة المختارة</p>
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
            {isProcessing && (
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

      {/* Controls */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="flex items-center justify-center gap-4">
          {!isCallActive ? (
            <button
              onClick={startCall}
              className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-105"
            >
              <Phone className="w-7 h-7" />
            </button>
          ) : (
            <>
              <button
                onClick={endCall}
                className="w-12 h-12 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md transition-all"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isProcessing || isPlaying}
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isRecording
                    ? 'bg-red-500 scale-110'
                    : isProcessing || isPlaying
                      ? 'bg-gray-300 cursor-not-allowed'
                      : 'bg-primary-600 hover:bg-primary-700 hover:scale-105'
                } text-white`}
              >
                {isProcessing ? (
                  <Loader2 className="w-7 h-7 animate-spin" />
                ) : isPlaying ? (
                  <Volume2 className="w-7 h-7 animate-pulse" />
                ) : isRecording ? (
                  <MicOff className="w-7 h-7" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>

              <div className="w-12" /> {/* Spacer for symmetry */}
            </>
          )}
        </div>

        {isCallActive && (
          <p className="text-center text-sm text-gray-500 mt-3">
            {isRecording
              ? 'جارٍ التسجيل... أفلت للإرسال'
              : isProcessing
                ? 'جارٍ المعالجة...'
                : isPlaying
                  ? 'جارٍ التشغيل...'
                  : 'اضغط مع الاستمرار للتحدث'}
          </p>
        )}
      </div>
    </div>
  )
}
