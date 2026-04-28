var B=Object.defineProperty;var H=(d,r,l)=>r in d?B(d,r,{enumerable:!0,configurable:!0,writable:!0,value:l}):d[r]=l;var s=(d,r,l)=>H(d,typeof r!="symbol"?r+"":r,l);(function(){"use strict";const d={teal:{primary:"#0d9488",primaryDark:"#0f766e",primaryLight:"#ccfbf1"},blue:{primary:"#2563eb",primaryDark:"#1d4ed8",primaryLight:"#dbeafe"},green:{primary:"#16a34a",primaryDark:"#15803d",primaryLight:"#dcfce7"},purple:{primary:"#7c3aed",primaryDark:"#6d28d9",primaryLight:"#ede9fe"},red:{primary:"#dc2626",primaryDark:"#b91c1c",primaryLight:"#fee2e2"}},r={ar:{title:"مساعد توافد الذكي",placeholder:"اكتب رسالتك...",greeting:"مرحباً! كيف أقدر أساعدك؟",typing:"يكتب...",poweredBy:"مدعوم بتقنية توافد",quickActions:[{label:"حجز موعد",value:"أريد حجز موعد"},{label:"استفسار عام",value:"لدي استفسار عام"}],errorMsg:"عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.",connectionError:"عذراً، لم أتمكن من الاتصال. يرجى المحاولة لاحقاً.",rateLimited:"لقد وصلت للحد الأقصى من الرسائل في هذه الجلسة التجريبية."},en:{title:"Tawafud AI Assistant",placeholder:"Type your message...",greeting:"Hello! How can I help you?",typing:"Typing...",poweredBy:"Powered by Tawafud",quickActions:[{label:"Book Appointment",value:"I want to book an appointment"},{label:"General Inquiry",value:"I have a general inquiry"}],errorMsg:"Sorry, an error occurred. Please try again.",connectionError:"Sorry, I couldn't connect. Please try again later.",rateLimited:"You have reached the message limit for this demo session."}},l='<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',m='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',y='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',v='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-2-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>';function k(){return typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,a=>{const t=Math.random()*16|0;return(a==="x"?t:t&3|8).toString(16)})}function E(a){const t=`tawafud_widget_session_${a}`;let e=localStorage.getItem(t);return e||(e=k(),localStorage.setItem(t,e)),e}function S(a){const t=`tawafud_widget_history_${a}`;try{const e=sessionStorage.getItem(t);return e?JSON.parse(e):[]}catch{return[]}}function $(a,t){const e=`tawafud_widget_history_${a}`,i=t.slice(-20);sessionStorage.setItem(e,JSON.stringify(i))}async function T(a,t,e,i,n){try{const o=await(await fetch(`${a}/api/demo-chat/message`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:i,sessionId:e,conversationHistory:n})})).json();return o.error==="rate_limit"?{reply:o.message||"",error:!0}:o.error?{reply:o.message||"",error:!0}:{reply:o.response||o.reply||"",remaining:o.remainingMessages}}catch{throw new Error("connection_error")}}function L(a,t,e){const i=t==="bottom-left"?"left":"right",n=t==="bottom-left"?"right":"left";return`
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif;
      direction: ${e?"rtl":"ltr"};
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
    .tawafud-fab {
      position: fixed;
      bottom: 24px;
      ${i}: 24px;
      ${n}: auto;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${a.primary};
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

    .tawafud-fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 28px rgba(0, 0, 0, 0.3);
    }

    .tawafud-fab.has-unread {
      animation: tawafud-pulse 2s infinite;
    }

    @keyframes tawafud-pulse {
      0% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); }
      50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 12px ${a.primary}33; }
      100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); }
    }

    .tawafud-fab-close {
      background: #6b7280;
    }

    /* ─── Chat Window ─── */
    .tawafud-window {
      position: fixed;
      bottom: 100px;
      ${i}: 24px;
      ${n}: auto;
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

    .tawafud-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: all;
    }

    /* ─── Header ─── */
    .tawafud-header {
      background: ${a.primary};
      color: white;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .tawafud-header-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .tawafud-header-logo {
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

    .tawafud-header-text h3 {
      font-size: 15px;
      font-weight: 600;
      margin: 0;
      line-height: 1.3;
    }

    .tawafud-header-text p {
      font-size: 12px;
      opacity: 0.8;
      margin: 0;
      line-height: 1.3;
    }

    .tawafud-header-close {
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

    .tawafud-header-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    /* ─── Messages Area ─── */
    .tawafud-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .tawafud-messages::-webkit-scrollbar {
      width: 6px;
    }

    .tawafud-messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .tawafud-messages::-webkit-scrollbar-thumb {
      background: #d1d5db;
      border-radius: 3px;
    }

    /* ─── Message Bubbles ─── */
    .tawafud-msg {
      max-width: 80%;
      padding: 10px 16px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.6;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .tawafud-msg-ai {
      background: ${a.primary};
      color: white;
      align-self: flex-start;
      border-bottom-${e?"right":"left"}-radius: 4px;
    }

    .tawafud-msg-user {
      background: #e5e7eb;
      color: #1f2937;
      align-self: flex-end;
      border-bottom-${e?"left":"right"}-radius: 4px;
    }

    .tawafud-msg-time {
      font-size: 10px;
      opacity: 0.6;
      margin-top: 4px;
    }

    /* ─── Typing Indicator ─── */
    .tawafud-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: ${a.primary};
      border-radius: 16px;
      border-bottom-${e?"right":"left"}-radius: 4px;
      align-self: flex-start;
      max-width: 70px;
    }

    .tawafud-typing-dot {
      width: 8px;
      height: 8px;
      background: rgba(255, 255, 255, 0.6);
      border-radius: 50%;
      animation: tawafud-bounce 1.4s ease-in-out infinite;
    }

    .tawafud-typing-dot:nth-child(2) { animation-delay: 0.16s; }
    .tawafud-typing-dot:nth-child(3) { animation-delay: 0.32s; }

    @keyframes tawafud-bounce {
      0%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-6px); }
    }

    /* ─── Welcome Screen ─── */
    .tawafud-welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      text-align: center;
      gap: 20px;
    }

    .tawafud-welcome-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${a.primaryLight};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${a.primary};
    }

    .tawafud-welcome-icon svg {
      width: 32px;
      height: 32px;
    }

    .tawafud-welcome h4 {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin: 0;
    }

    .tawafud-welcome p {
      font-size: 14px;
      color: #6b7280;
      margin: 0;
    }

    .tawafud-quick-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }

    .tawafud-quick-btn {
      padding: 8px 16px;
      border-radius: 20px;
      border: 1.5px solid ${a.primary};
      background: white;
      color: ${a.primary};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .tawafud-quick-btn:hover {
      background: ${a.primary};
      color: white;
    }

    /* ─── Input Area ─── */
    .tawafud-input-area {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: white;
      flex-shrink: 0;
    }

    .tawafud-input-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tawafud-input {
      flex: 1;
      padding: 10px 16px;
      border-radius: 24px;
      border: 1.5px solid #e5e7eb;
      background: #f9fafb;
      font-size: 14px;
      font-family: inherit;
      outline: none;
      direction: ${e?"rtl":"ltr"};
      transition: border-color 0.2s;
      color: #1f2937;
    }

    .tawafud-input::placeholder {
      color: #9ca3af;
    }

    .tawafud-input:focus {
      border-color: ${a.primary};
      background: white;
    }

    .tawafud-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${a.primary};
      border: none;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, opacity 0.2s;
      flex-shrink: 0;
    }

    .tawafud-send-btn:hover {
      background: ${a.primaryDark};
    }

    .tawafud-send-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* ─── Footer ─── */
    .tawafud-footer {
      padding: 8px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
      background: white;
      border-top: 1px solid #f3f4f6;
      flex-shrink: 0;
    }

    .tawafud-footer a {
      color: ${a.primary};
      text-decoration: none;
      font-weight: 500;
    }

    .tawafud-footer a:hover {
      text-decoration: underline;
    }

    /* ─── Mobile Responsive ─── */
    @media (max-width: 480px) {
      .tawafud-window {
        bottom: 0;
        ${i}: 0;
        width: 100%;
        height: 100%;
        max-height: 100vh;
        border-radius: 0;
      }

      .tawafud-fab {
        bottom: 16px;
        ${i}: 16px;
        width: 56px;
        height: 56px;
      }
    }
  `}class u{constructor(t){s(this,"config");s(this,"shadow");s(this,"container");s(this,"messages",[]);s(this,"conversationHistory",[]);s(this,"isOpen",!1);s(this,"isTyping",!1);s(this,"hasShownWelcome",!1);s(this,"sessionId");s(this,"theme");s(this,"t");s(this,"fabBtn");s(this,"windowEl");s(this,"messagesEl");s(this,"inputEl");s(this,"sendBtn");this.config=t,this.theme=d[t.theme]||d.teal,this.t=r[t.lang]||r.ar,this.sessionId=E(t.orgId),this.conversationHistory=S(t.orgId),this.container=document.createElement("div"),this.container.id="tawafud-widget-root",document.body.appendChild(this.container),this.shadow=this.container.attachShadow({mode:"open"}),this.render(),this.bindEvents()}render(){const t=this.config.lang==="ar",e=document.createElement("style");e.textContent=L(this.theme,this.config.position,t),this.shadow.appendChild(e),this.fabBtn=document.createElement("button"),this.fabBtn.className="tawafud-fab",this.fabBtn.setAttribute("aria-label",this.t.title),this.fabBtn.innerHTML=l,this.shadow.appendChild(this.fabBtn),this.windowEl=document.createElement("div"),this.windowEl.className="tawafud-window",this.windowEl.setAttribute("dir",t?"rtl":"ltr"),this.windowEl.innerHTML=this.buildWindowHTML(),this.shadow.appendChild(this.windowEl),this.messagesEl=this.windowEl.querySelector(".tawafud-messages"),this.inputEl=this.windowEl.querySelector(".tawafud-input"),this.sendBtn=this.windowEl.querySelector(".tawafud-send-btn")}buildWindowHTML(){return`
      <!-- Header -->
      <div class="tawafud-header">
        <div class="tawafud-header-info">
          <div class="tawafud-header-logo">${v}</div>
          <div class="tawafud-header-text">
            <h3>${this.escapeHTML(this.t.title)}</h3>
            <p>● ${this.config.lang==="ar"?"متصل الآن":"Online"}</p>
          </div>
        </div>
        <button class="tawafud-header-close" aria-label="Close">${m}</button>
      </div>

      <!-- Messages Area -->
      <div class="tawafud-messages"></div>

      <!-- Input Area -->
      <div class="tawafud-input-area">
        <div class="tawafud-input-row">
          <input 
            type="text" 
            class="tawafud-input" 
            placeholder="${this.t.placeholder}"
            autocomplete="off"
          />
          <button class="tawafud-send-btn" disabled aria-label="Send">${y}</button>
        </div>
      </div>

      <!-- Footer -->
      <div class="tawafud-footer">
        ${this.t.poweredBy} ✦
      </div>
    `}bindEvents(){this.fabBtn.addEventListener("click",()=>this.toggle()),this.windowEl.querySelector(".tawafud-header-close").addEventListener("click",()=>this.close()),this.inputEl.addEventListener("input",()=>{this.sendBtn.disabled=!this.inputEl.value.trim()||this.isTyping}),this.inputEl.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),this.handleSend())}),this.sendBtn.addEventListener("click",()=>this.handleSend())}toggle(){this.isOpen?this.close():this.open()}open(){this.isOpen=!0,this.windowEl.classList.add("open"),this.fabBtn.innerHTML=m,this.fabBtn.classList.add("tawafud-fab-close"),this.fabBtn.classList.remove("has-unread"),this.inputEl.focus(),this.hasShownWelcome||(this.showWelcome(),this.hasShownWelcome=!0)}close(){this.isOpen=!1,this.windowEl.classList.remove("open"),this.fabBtn.innerHTML=l,this.fabBtn.classList.remove("tawafud-fab-close")}showWelcome(){if(this.conversationHistory.length>0){this.restoreMessages();return}const t=this.config.greeting||this.t.greeting;this.addMessage(t,"ai");const e=document.createElement("div");e.className="tawafud-welcome",e.innerHTML=`
      <div class="tawafud-quick-actions">
        ${this.t.quickActions.map(i=>`<button class="tawafud-quick-btn" data-value="${this.escapeHTML(i.value)}">${this.escapeHTML(i.label)}</button>`).join("")}
      </div>
    `,this.messagesEl.appendChild(e),e.querySelectorAll(".tawafud-quick-btn").forEach(i=>{i.addEventListener("click",()=>{const n=i.getAttribute("data-value")||"";e.remove(),this.inputEl.value=n,this.handleSend()})}),this.scrollToBottom()}restoreMessages(){for(const t of this.conversationHistory){const e=t.role==="user"?"user":"ai";this.addMessage(t.content,e,!1)}this.scrollToBottom()}addMessage(t,e,i=!0){const n={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,text:t,sender:e,timestamp:new Date};this.messages.push(n);const o=this.config.lang==="ar"?"ar-SA":"en-US",f=n.timestamp.toLocaleTimeString(o,{hour:"2-digit",minute:"2-digit"}),c=document.createElement("div");c.className=`tawafud-msg tawafud-msg-${e}`,c.innerHTML=`
      <div>${this.escapeHTML(t)}</div>
      <div class="tawafud-msg-time">${f}</div>
    `,this.messagesEl.appendChild(c),i&&(this.conversationHistory.push({role:e==="user"?"user":"assistant",content:t}),$(this.config.orgId,this.conversationHistory)),this.scrollToBottom()}showTyping(){this.isTyping=!0,this.sendBtn.disabled=!0;const t=document.createElement("div");t.className="tawafud-typing",t.id="tawafud-typing-indicator",t.innerHTML=`
      <div class="tawafud-typing-dot"></div>
      <div class="tawafud-typing-dot"></div>
      <div class="tawafud-typing-dot"></div>
    `,this.messagesEl.appendChild(t),this.scrollToBottom()}hideTyping(){this.isTyping=!1,this.sendBtn.disabled=!this.inputEl.value.trim();const t=this.messagesEl.querySelector("#tawafud-typing-indicator");t&&t.remove()}async handleSend(){const t=this.inputEl.value.trim();if(!t||this.isTyping)return;const e=this.messagesEl.querySelector(".tawafud-welcome");e&&e.remove(),this.inputEl.value="",this.sendBtn.disabled=!0,this.addMessage(t,"user"),this.showTyping();try{const i=await T(this.config.baseUrl,this.config.orgId,this.sessionId,t,this.conversationHistory.slice(0,-1));this.hideTyping(),i.error?this.addMessage(i.reply||this.t.errorMsg,"ai"):this.addMessage(i.reply,"ai")}catch{this.hideTyping(),this.addMessage(this.t.connectionError,"ai")}}scrollToBottom(){requestAnimationFrame(()=>{this.messagesEl.scrollTop=this.messagesEl.scrollHeight})}escapeHTML(t){const e=document.createElement("div");return e.textContent=t,e.innerHTML}}function M(){const a=document.querySelectorAll("script[data-org-id]"),t=a[a.length-1],i=document.currentScript||t,n=(i==null?void 0:i.getAttribute("data-org-id"))||"default",p=(i==null?void 0:i.getAttribute("data-theme"))||"teal",o=(i==null?void 0:i.getAttribute("data-lang"))||"ar",f=(i==null?void 0:i.getAttribute("data-position"))||"bottom-right",c=(i==null?void 0:i.getAttribute("data-greeting"))||"";let h="";if(i!=null&&i.src)try{h=new URL(i.src).origin}catch{h=""}const g=i==null?void 0:i.getAttribute("data-base-url");if(g)try{const w=new URL(g);["tawafud.com","localhost"].some(b=>w.hostname===b||w.hostname.endsWith("."+b))&&(h=g)}catch{}const x={orgId:n,theme:p,lang:o,position:f,greeting:c,baseUrl:h};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>new u(x)):new u(x)}window.TawafudWidget=u,M()})();
