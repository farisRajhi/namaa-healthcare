/**
 * Namaa (نماء) Embeddable Chat Widget
 * 
 * Self-contained widget that can be embedded on any website via:
 * <script src="https://namaa.ai/widget.js" data-org-id="org123"></script>
 * 
 * Uses Shadow DOM for complete CSS isolation.
 * Zero external dependencies — all styles are inline.
 */

// ─── Types ───────────────────────────────────────────────────────────
interface WidgetConfig {
  orgId: string
  theme: string
  lang: 'ar' | 'en'
  position: 'bottom-right' | 'bottom-left'
  greeting: string
  baseUrl: string
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

// ─── Theme Colors ────────────────────────────────────────────────────
const THEMES: Record<string, { primary: string; primaryDark: string; primaryLight: string }> = {
  teal:   { primary: '#0d9488', primaryDark: '#0f766e', primaryLight: '#ccfbf1' },
  blue:   { primary: '#2563eb', primaryDark: '#1d4ed8', primaryLight: '#dbeafe' },
  green:  { primary: '#16a34a', primaryDark: '#15803d', primaryLight: '#dcfce7' },
  purple: { primary: '#7c3aed', primaryDark: '#6d28d9', primaryLight: '#ede9fe' },
  red:    { primary: '#dc2626', primaryDark: '#b91c1c', primaryLight: '#fee2e2' },
}

// ─── Translations ────────────────────────────────────────────────────
const i18n = {
  ar: {
    title: 'مساعد نماء الذكي',
    placeholder: 'اكتب رسالتك...',
    greeting: 'مرحباً! كيف أقدر أساعدك؟',
    typing: 'يكتب...',
    poweredBy: 'مدعوم بتقنية نماء',
    quickActions: [
      { label: 'حجز موعد', value: 'أريد حجز موعد' },
      { label: 'استفسار عام', value: 'لدي استفسار عام' },
      { label: 'إعادة صرف وصفة', value: 'أحتاج إعادة صرف وصفة طبية' },
    ],
    errorMsg: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.',
    connectionError: 'عذراً، لم أتمكن من الاتصال. يرجى المحاولة لاحقاً.',
    rateLimited: 'لقد وصلت للحد الأقصى من الرسائل في هذه الجلسة التجريبية.',
  },
  en: {
    title: 'Namaa AI Assistant',
    placeholder: 'Type your message...',
    greeting: 'Hello! How can I help you?',
    typing: 'Typing...',
    poweredBy: 'Powered by Namaa',
    quickActions: [
      { label: 'Book Appointment', value: 'I want to book an appointment' },
      { label: 'General Inquiry', value: 'I have a general inquiry' },
      { label: 'Prescription Refill', value: 'I need a prescription refill' },
    ],
    errorMsg: 'Sorry, an error occurred. Please try again.',
    connectionError: 'Sorry, I couldn\'t connect. Please try again later.',
    rateLimited: 'You have reached the message limit for this demo session.',
  },
}

// ─── SVG Icons (inline) ─────────────────────────────────────────────
const ICON_CHAT = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const ICON_SEND = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`
const ICON_NAMAA = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-2-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>`

// ─── Utility Functions ───────────────────────────────────────────────
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getSessionId(orgId: string): string {
  const key = `namaa_widget_session_${orgId}`
  let sessionId = localStorage.getItem(key)
  if (!sessionId) {
    sessionId = generateUUID()
    localStorage.setItem(key, sessionId)
  }
  return sessionId
}

function getConversationHistory(orgId: string): ConversationEntry[] {
  const key = `namaa_widget_history_${orgId}`
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveConversationHistory(orgId: string, history: ConversationEntry[]): void {
  const key = `namaa_widget_history_${orgId}`
  // Keep last 20 entries
  const trimmed = history.slice(-20)
  sessionStorage.setItem(key, JSON.stringify(trimmed))
}

// ─── API Client ──────────────────────────────────────────────────────
async function sendMessage(
  baseUrl: string,
  _orgId: string,
  sessionId: string,
  message: string,
  conversationHistory: ConversationEntry[]
): Promise<{ reply: string; remaining?: number; error?: boolean }> {
  try {
    const res = await fetch(`${baseUrl}/api/demo-chat/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        sessionId,
        conversationHistory,
      }),
    })

    const data = await res.json()

    if (data.error === 'rate_limit') {
      return { reply: data.message || '', error: true }
    }

    if (data.error) {
      return { reply: data.message || '', error: true }
    }

    return {
      reply: data.response || data.reply || '',
      remaining: data.remainingMessages,
    }
  } catch {
    throw new Error('connection_error')
  }
}

// ─── Widget CSS ──────────────────────────────────────────────────────
function buildStyles(theme: typeof THEMES['teal'], position: string, isRtl: boolean): string {
  const positionSide = position === 'bottom-left' ? 'left' : 'right'
  const oppositeSide = position === 'bottom-left' ? 'right' : 'left'

  return `
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif;
      direction: ${isRtl ? 'rtl' : 'ltr'};
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ─── Floating Button ─── */
    .namaa-fab {
      position: fixed;
      bottom: 24px;
      ${positionSide}: 24px;
      ${oppositeSide}: auto;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${theme.primary};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
      z-index: 2147483647;
    }

    .namaa-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(0, 0, 0, 0.3);
    }

    .namaa-fab.has-unread {
      animation: namaa-pulse 2s infinite;
    }

    @keyframes namaa-pulse {
      0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); }
      50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 12px ${theme.primary}33; }
      100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); }
    }

    .namaa-fab-close {
      background: #6b7280;
    }

    /* ─── Chat Window ─── */
    .namaa-window {
      position: fixed;
      bottom: 100px;
      ${positionSide}: 24px;
      ${oppositeSide}: auto;
      width: 400px;
      height: 600px;
      max-height: calc(100vh - 130px);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483646;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }

    .namaa-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* ─── Header ─── */
    .namaa-header {
      background: ${theme.primary};
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .namaa-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .namaa-header-logo {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      flex-shrink: 0;
    }

    .namaa-header-text h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      line-height: 1.3;
    }

    .namaa-header-text p {
      font-size: 12px;
      opacity: 0.8;
      margin: 0;
      line-height: 1.3;
    }

    .namaa-header-close {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: white;
      cursor: pointer;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }

    .namaa-header-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* ─── Messages Area ─── */
    .namaa-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .namaa-messages::-webkit-scrollbar {
      width: 6px;
    }

    .namaa-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .namaa-messages::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    /* ─── Message Bubbles ─── */
    .namaa-msg {
      max-width: 80%;
      padding: 10px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.6;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .namaa-msg-ai {
      background: ${theme.primary};
      color: white;
      align-self: ${isRtl ? 'flex-start' : 'flex-start'};
      border-bottom-${isRtl ? 'right' : 'left'}-radius: 4px;
    }

    .namaa-msg-user {
      background: #e5e7eb;
      color: #1f2937;
      align-self: ${isRtl ? 'flex-end' : 'flex-end'};
      border-bottom-${isRtl ? 'left' : 'right'}-radius: 4px;
    }

    .namaa-msg-time {
      font-size: 10px;
      opacity: 0.6;
      margin-top: 4px;
    }

    /* ─── Typing Indicator ─── */
    .namaa-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: ${theme.primary};
      border-radius: 16px;
      border-bottom-${isRtl ? 'right' : 'left'}-radius: 4px;
      align-self: flex-start;
      max-width: 70px;
    }

    .namaa-typing-dot {
      width: 8px;
      height: 8px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 50%;
      animation: namaa-bounce 1.4s ease-in-out infinite;
    }

    .namaa-typing-dot:nth-child(2) { animation-delay: 0.16s; }
    .namaa-typing-dot:nth-child(3) { animation-delay: 0.32s; }

    @keyframes namaa-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }

    /* ─── Welcome Screen ─── */
    .namaa-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      text-align: center;
      gap: 20px;
    }

    .namaa-welcome-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${theme.primaryLight};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${theme.primary};
    }

    .namaa-welcome-icon svg {
      width: 32px;
      height: 32px;
    }

    .namaa-welcome h4 {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }

    .namaa-welcome p {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }

    .namaa-quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .namaa-quick-btn {
      padding: 8px 16px;
      border-radius: 20px;
      border: 1.5px solid ${theme.primary};
      background: white;
      color: ${theme.primary};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .namaa-quick-btn:hover {
      background: ${theme.primary};
      color: white;
    }

    /* ─── Input Area ─── */
    .namaa-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: white;
      flex-shrink: 0;
    }

    .namaa-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .namaa-input {
      flex: 1;
      padding: 10px 16px;
      border-radius: 24px;
      border: 1.5px solid #e5e7eb;
      background: #f9fafb;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      direction: ${isRtl ? 'rtl' : 'ltr'};
      transition: border-color 0.2s;
      color: #1f2937;
    }

    .namaa-input::placeholder {
      color: #9ca3af;
    }

    .namaa-input:focus {
      border-color: ${theme.primary};
      background: white;
    }

    .namaa-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${theme.primary};
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, opacity 0.2s;
      flex-shrink: 0;
    }

    .namaa-send-btn:hover {
      background: ${theme.primaryDark};
    }

    .namaa-send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ─── Footer ─── */
    .namaa-footer {
      padding: 8px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
      background: white;
      border-top: 1px solid #f3f4f6;
      flex-shrink: 0;
    }

    .namaa-footer a {
      color: ${theme.primary};
      text-decoration: none;
      font-weight: 500;
    }

    .namaa-footer a:hover {
      text-decoration: underline;
    }

    /* ─── Mobile Responsive ─── */
    @media (max-width: 480px) {
      .namaa-window {
        bottom: 0;
        ${positionSide}: 0;
        width: 100%;
        height: 100%;
        max-height: 100vh;
        border-radius: 0;
      }

      .namaa-fab {
        bottom: 16px;
        ${positionSide}: 16px;
        width: 56px;
        height: 56px;
      }
    }
  `
}

// ─── Widget Class ────────────────────────────────────────────────────
class NamaaWidget {
  private config: WidgetConfig
  private shadow: ShadowRoot
  private container: HTMLDivElement
  private messages: Message[] = []
  private conversationHistory: ConversationEntry[] = []
  private isOpen = false
  private isTyping = false
  private hasShownWelcome = false
  private sessionId: string
  private theme: typeof THEMES['teal']
  private t: typeof i18n['ar']

  // DOM references
  private fabBtn!: HTMLButtonElement
  private windowEl!: HTMLDivElement
  private messagesEl!: HTMLDivElement
  private inputEl!: HTMLInputElement
  private sendBtn!: HTMLButtonElement

  constructor(config: WidgetConfig) {
    this.config = config
    this.theme = THEMES[config.theme] || THEMES.teal
    this.t = i18n[config.lang] || i18n.ar
    this.sessionId = getSessionId(config.orgId)
    this.conversationHistory = getConversationHistory(config.orgId)

    // Create shadow DOM container
    this.container = document.createElement('div')
    this.container.id = 'namaa-widget-root'
    document.body.appendChild(this.container)
    this.shadow = this.container.attachShadow({ mode: 'open' })

    this.render()
    this.bindEvents()
  }

  private render(): void {
    const isRtl = this.config.lang === 'ar'

    // Inject styles
    const styleEl = document.createElement('style')
    styleEl.textContent = buildStyles(this.theme, this.config.position, isRtl)
    this.shadow.appendChild(styleEl)

    // ─── FAB Button ───
    this.fabBtn = document.createElement('button')
    this.fabBtn.className = 'namaa-fab'
    this.fabBtn.setAttribute('aria-label', this.t.title)
    this.fabBtn.innerHTML = ICON_CHAT
    this.shadow.appendChild(this.fabBtn)

    // ─── Chat Window ───
    this.windowEl = document.createElement('div')
    this.windowEl.className = 'namaa-window'
    this.windowEl.setAttribute('dir', isRtl ? 'rtl' : 'ltr')
    this.windowEl.innerHTML = this.buildWindowHTML()
    this.shadow.appendChild(this.windowEl)

    // Cache DOM references
    this.messagesEl = this.windowEl.querySelector('.namaa-messages')!
    this.inputEl = this.windowEl.querySelector('.namaa-input')!
    this.sendBtn = this.windowEl.querySelector('.namaa-send-btn')!
  }

  private buildWindowHTML(): string {
    return `
      <!-- Header -->
      <div class="namaa-header">
        <div class="namaa-header-info">
          <div class="namaa-header-logo">${ICON_NAMAA}</div>
          <div class="namaa-header-text">
            <h3>${this.t.title}</h3>
            <p>● ${this.config.lang === 'ar' ? 'متصل الآن' : 'Online'}</p>
          </div>
        </div>
        <button class="namaa-header-close" aria-label="Close">${ICON_CLOSE}</button>
      </div>

      <!-- Messages Area -->
      <div class="namaa-messages"></div>

      <!-- Input Area -->
      <div class="namaa-input-area">
        <div class="namaa-input-row">
          <input 
            type="text" 
            class="namaa-input" 
            placeholder="${this.t.placeholder}"
            autocomplete="off"
          />
          <button class="namaa-send-btn" disabled aria-label="Send">${ICON_SEND}</button>
        </div>
      </div>

      <!-- Footer -->
      <div class="namaa-footer">
        ${this.t.poweredBy} ✦
      </div>
    `
  }

  private bindEvents(): void {
    // FAB click → toggle
    this.fabBtn.addEventListener('click', () => this.toggle())

    // Close button
    const closeBtn = this.windowEl.querySelector('.namaa-header-close')!
    closeBtn.addEventListener('click', () => this.close())

    // Input changes
    this.inputEl.addEventListener('input', () => {
      this.sendBtn.disabled = !this.inputEl.value.trim() || this.isTyping
    })

    // Enter to send
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.handleSend()
      }
    })

    // Send button click
    this.sendBtn.addEventListener('click', () => this.handleSend())
  }

  private toggle(): void {
    if (this.isOpen) {
      this.close()
    } else {
      this.open()
    }
  }

  private open(): void {
    this.isOpen = true
    this.windowEl.classList.add('open')
    this.fabBtn.innerHTML = ICON_CLOSE
    this.fabBtn.classList.add('namaa-fab-close')
    this.fabBtn.classList.remove('has-unread')
    this.inputEl.focus()

    if (!this.hasShownWelcome) {
      this.showWelcome()
      this.hasShownWelcome = true
    }
  }

  private close(): void {
    this.isOpen = false
    this.windowEl.classList.remove('open')
    this.fabBtn.innerHTML = ICON_CHAT
    this.fabBtn.classList.remove('namaa-fab-close')
  }

  private showWelcome(): void {
    // If there's already conversation history, restore messages instead
    if (this.conversationHistory.length > 0) {
      this.restoreMessages()
      return
    }

    const greeting = this.config.greeting || this.t.greeting

    // Add AI greeting message
    this.addMessage(greeting, 'ai')

    // Render quick action buttons
    const welcomeDiv = document.createElement('div')
    welcomeDiv.className = 'namaa-welcome'
    welcomeDiv.innerHTML = `
      <div class="namaa-quick-actions">
        ${this.t.quickActions.map(
          (a) => `<button class="namaa-quick-btn" data-value="${a.value}">${a.label}</button>`
        ).join('')}
      </div>
    `

    this.messagesEl.appendChild(welcomeDiv)

    // Bind quick action clicks
    welcomeDiv.querySelectorAll('.namaa-quick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = (btn as HTMLElement).getAttribute('data-value') || ''
        // Remove welcome div
        welcomeDiv.remove()
        this.inputEl.value = value
        this.handleSend()
      })
    })

    this.scrollToBottom()
  }

  private restoreMessages(): void {
    // Restore from conversation history
    for (const entry of this.conversationHistory) {
      const sender = entry.role === 'user' ? 'user' : 'ai'
      this.addMessage(entry.content, sender, false)
    }
    this.scrollToBottom()
  }

  private addMessage(text: string, sender: 'user' | 'ai', save = true): void {
    const msg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      sender,
      timestamp: new Date(),
    }
    this.messages.push(msg)

    const isRtl = this.config.lang === 'ar'
    const locale = isRtl ? 'ar-SA' : 'en-US'
    const timeStr = msg.timestamp.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })

    const bubble = document.createElement('div')
    bubble.className = `namaa-msg namaa-msg-${sender}`
    bubble.innerHTML = `
      <div>${this.escapeHTML(text)}</div>
      <div class="namaa-msg-time">${timeStr}</div>
    `
    this.messagesEl.appendChild(bubble)

    if (save) {
      this.conversationHistory.push({
        role: sender === 'user' ? 'user' : 'assistant',
        content: text,
      })
      saveConversationHistory(this.config.orgId, this.conversationHistory)
    }

    this.scrollToBottom()
  }

  private showTyping(): void {
    this.isTyping = true
    this.sendBtn.disabled = true

    const typingEl = document.createElement('div')
    typingEl.className = 'namaa-typing'
    typingEl.id = 'namaa-typing-indicator'
    typingEl.innerHTML = `
      <div class="namaa-typing-dot"></div>
      <div class="namaa-typing-dot"></div>
      <div class="namaa-typing-dot"></div>
    `
    this.messagesEl.appendChild(typingEl)
    this.scrollToBottom()
  }

  private hideTyping(): void {
    this.isTyping = false
    this.sendBtn.disabled = !this.inputEl.value.trim()

    const typingEl = this.messagesEl.querySelector('#namaa-typing-indicator')
    if (typingEl) typingEl.remove()
  }

  private async handleSend(): Promise<void> {
    const text = this.inputEl.value.trim()
    if (!text || this.isTyping) return

    // Remove any welcome/quick-actions div
    const welcomeEl = this.messagesEl.querySelector('.namaa-welcome')
    if (welcomeEl) welcomeEl.remove()

    this.inputEl.value = ''
    this.sendBtn.disabled = true

    this.addMessage(text, 'user')
    this.showTyping()

    try {
      const result = await sendMessage(
        this.config.baseUrl,
        this.config.orgId,
        this.sessionId,
        text,
        this.conversationHistory.slice(0, -1) // exclude the message we just added
      )

      this.hideTyping()

      if (result.error) {
        this.addMessage(result.reply || this.t.errorMsg, 'ai')
      } else {
        this.addMessage(result.reply, 'ai')
      }
    } catch {
      this.hideTyping()
      this.addMessage(this.t.connectionError, 'ai')
    }
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight
    })
  }

  private escapeHTML(str: string): string {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }
}

// ─── Auto-Init ───────────────────────────────────────────────────────
function init(): void {
  // Find the script tag that loaded us
  const scripts = document.querySelectorAll('script[data-org-id]')
  const scriptTag = scripts[scripts.length - 1] as HTMLScriptElement | undefined

  // Also check for current script
  const currentScript = document.currentScript as HTMLScriptElement | null
  const tag = currentScript || scriptTag

  const orgId = tag?.getAttribute('data-org-id') || 'default'
  const theme = tag?.getAttribute('data-theme') || 'teal'
  const lang = (tag?.getAttribute('data-lang') || 'ar') as 'ar' | 'en'
  const position = (tag?.getAttribute('data-position') || 'bottom-right') as 'bottom-right' | 'bottom-left'
  const greeting = tag?.getAttribute('data-greeting') || ''

  // Determine base URL (same origin as the script, or current page)
  let baseUrl = ''
  if (tag?.src) {
    try {
      const url = new URL(tag.src)
      baseUrl = url.origin
    } catch {
      baseUrl = ''
    }
  }

  // Allow override via data attribute
  const customBaseUrl = tag?.getAttribute('data-base-url')
  if (customBaseUrl) {
    baseUrl = customBaseUrl
  }

  const config: WidgetConfig = {
    orgId,
    theme,
    lang,
    position,
    greeting,
    baseUrl,
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new NamaaWidget(config))
  } else {
    new NamaaWidget(config)
  }
}

// ─── Expose globally for programmatic use ────────────────────────────
;(window as any).NamaaWidget = NamaaWidget

init()
