var M=Object.defineProperty;var T=(l,o,d)=>o in l?M(l,o,{enumerable:!0,configurable:!0,writable:!0,value:d}):l[o]=d;var n=(l,o,d)=>T(l,typeof o!="symbol"?o+"":o,d);(function(){"use strict";const l={teal:{primary:"#0d9488",primaryDark:"#0f766e",primaryLight:"#ccfbf1"},blue:{primary:"#2563eb",primaryDark:"#1d4ed8",primaryLight:"#dbeafe"},green:{primary:"#16a34a",primaryDark:"#15803d",primaryLight:"#dcfce7"},purple:{primary:"#7c3aed",primaryDark:"#6d28d9",primaryLight:"#ede9fe"},red:{primary:"#dc2626",primaryDark:"#b91c1c",primaryLight:"#fee2e2"}},o={ar:{title:"مساعد نماء الذكي",placeholder:"اكتب رسالتك...",greeting:"مرحباً! كيف أقدر أساعدك؟",typing:"يكتب...",poweredBy:"مدعوم بتقنية نماء",quickActions:[{label:"حجز موعد",value:"أريد حجز موعد"},{label:"استفسار عام",value:"لدي استفسار عام"},{label:"إعادة صرف وصفة",value:"أحتاج إعادة صرف وصفة طبية"}],errorMsg:"عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.",connectionError:"عذراً، لم أتمكن من الاتصال. يرجى المحاولة لاحقاً.",rateLimited:"لقد وصلت للحد الأقصى من الرسائل في هذه الجلسة التجريبية."},en:{title:"Namaa AI Assistant",placeholder:"Type your message...",greeting:"Hello! How can I help you?",typing:"Typing...",poweredBy:"Powered by Namaa",quickActions:[{label:"Book Appointment",value:"I want to book an appointment"},{label:"General Inquiry",value:"I have a general inquiry"},{label:"Prescription Refill",value:"I need a prescription refill"}],errorMsg:"Sorry, an error occurred. Please try again.",connectionError:"Sorry, I couldn't connect. Please try again later.",rateLimited:"You have reached the message limit for this demo session."}},d='<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',u='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',b='<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',y='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" opacity="0.2"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-6h2v6zm4 0h-2v-6h2v6zm-2-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>';function w(){return typeof crypto<"u"&&crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,i=>{const e=Math.random()*16|0;return(i==="x"?e:e&3|8).toString(16)})}function v(i){const e=`namaa_widget_session_${i}`;let t=localStorage.getItem(e);return t||(t=w(),localStorage.setItem(e,t)),t}function k(i){const e=`namaa_widget_history_${i}`;try{const t=sessionStorage.getItem(e);return t?JSON.parse(t):[]}catch{return[]}}function E(i,e){const t=`namaa_widget_history_${i}`,a=e.slice(-20);sessionStorage.setItem(t,JSON.stringify(a))}async function S(i,e,t,a,s){try{const r=await(await fetch(`${i}/api/demo-chat/message`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:a,sessionId:t,conversationHistory:s})})).json();return r.error==="rate_limit"?{reply:r.message||"",error:!0}:r.error?{reply:r.message||"",error:!0}:{reply:r.response||r.reply||"",remaining:r.remainingMessages}}catch{throw new Error("connection_error")}}function $(i,e,t){const a=e==="bottom-left"?"left":"right",s=e==="bottom-left"?"right":"left";return`
    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans Arabic', sans-serif;
      direction: ${t?"rtl":"ltr"};
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
      ${a}: 24px;
      ${s}: auto;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: ${i.primary};
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
      50% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 0 0 12px ${i.primary}33; }
      100% { box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25); }
    }

    .namaa-fab-close {
      background: #6b7280;
    }

    /* ─── Chat Window ─── */
    .namaa-window {
      position: fixed;
      bottom: 100px;
      ${a}: 24px;
      ${s}: auto;
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
      background: ${i.primary};
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
      background: ${i.primary};
      color: white;
      align-self: flex-start;
      border-bottom-${t?"right":"left"}-radius: 4px;
    }

    .namaa-msg-user {
      background: #e5e7eb;
      color: #1f2937;
      align-self: flex-end;
      border-bottom-${t?"left":"right"}-radius: 4px;
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
      background: ${i.primary};
      border-radius: 16px;
      border-bottom-${t?"right":"left"}-radius: 4px;
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
      background: ${i.primaryLight};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${i.primary};
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
      border: 1.5px solid ${i.primary};
      background: white;
      color: ${i.primary};
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }

    .namaa-quick-btn:hover {
      background: ${i.primary};
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
      direction: ${t?"rtl":"ltr"};
      transition: border-color 0.2s;
      color: #1f2937;
    }

    .namaa-input::placeholder {
      color: #9ca3af;
    }

    .namaa-input:focus {
      border-color: ${i.primary};
      background: white;
    }

    .namaa-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${i.primary};
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
      background: ${i.primaryDark};
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
      color: ${i.primary};
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
        ${a}: 0;
        width: 100%;
        height: 100%;
        max-height: 100vh;
        border-radius: 0;
      }

      .namaa-fab {
        bottom: 16px;
        ${a}: 16px;
        width: 56px;
        height: 56px;
      }
    }
  `}class h{constructor(e){n(this,"config");n(this,"shadow");n(this,"container");n(this,"messages",[]);n(this,"conversationHistory",[]);n(this,"isOpen",!1);n(this,"isTyping",!1);n(this,"hasShownWelcome",!1);n(this,"sessionId");n(this,"theme");n(this,"t");n(this,"fabBtn");n(this,"windowEl");n(this,"messagesEl");n(this,"inputEl");n(this,"sendBtn");this.config=e,this.theme=l[e.theme]||l.teal,this.t=o[e.lang]||o.ar,this.sessionId=v(e.orgId),this.conversationHistory=k(e.orgId),this.container=document.createElement("div"),this.container.id="namaa-widget-root",document.body.appendChild(this.container),this.shadow=this.container.attachShadow({mode:"open"}),this.render(),this.bindEvents()}render(){const e=this.config.lang==="ar",t=document.createElement("style");t.textContent=$(this.theme,this.config.position,e),this.shadow.appendChild(t),this.fabBtn=document.createElement("button"),this.fabBtn.className="namaa-fab",this.fabBtn.setAttribute("aria-label",this.t.title),this.fabBtn.innerHTML=d,this.shadow.appendChild(this.fabBtn),this.windowEl=document.createElement("div"),this.windowEl.className="namaa-window",this.windowEl.setAttribute("dir",e?"rtl":"ltr"),this.windowEl.innerHTML=this.buildWindowHTML(),this.shadow.appendChild(this.windowEl),this.messagesEl=this.windowEl.querySelector(".namaa-messages"),this.inputEl=this.windowEl.querySelector(".namaa-input"),this.sendBtn=this.windowEl.querySelector(".namaa-send-btn")}buildWindowHTML(){return`
      <!-- Header -->
      <div class="namaa-header">
        <div class="namaa-header-info">
          <div class="namaa-header-logo">${y}</div>
          <div class="namaa-header-text">
            <h3>${this.t.title}</h3>
            <p>● ${this.config.lang==="ar"?"متصل الآن":"Online"}</p>
          </div>
        </div>
        <button class="namaa-header-close" aria-label="Close">${u}</button>
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
          <button class="namaa-send-btn" disabled aria-label="Send">${b}</button>
        </div>
      </div>

      <!-- Footer -->
      <div class="namaa-footer">
        ${this.t.poweredBy} ✦
      </div>
    `}bindEvents(){this.fabBtn.addEventListener("click",()=>this.toggle()),this.windowEl.querySelector(".namaa-header-close").addEventListener("click",()=>this.close()),this.inputEl.addEventListener("input",()=>{this.sendBtn.disabled=!this.inputEl.value.trim()||this.isTyping}),this.inputEl.addEventListener("keydown",t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),this.handleSend())}),this.sendBtn.addEventListener("click",()=>this.handleSend())}toggle(){this.isOpen?this.close():this.open()}open(){this.isOpen=!0,this.windowEl.classList.add("open"),this.fabBtn.innerHTML=u,this.fabBtn.classList.add("namaa-fab-close"),this.fabBtn.classList.remove("has-unread"),this.inputEl.focus(),this.hasShownWelcome||(this.showWelcome(),this.hasShownWelcome=!0)}close(){this.isOpen=!1,this.windowEl.classList.remove("open"),this.fabBtn.innerHTML=d,this.fabBtn.classList.remove("namaa-fab-close")}showWelcome(){if(this.conversationHistory.length>0){this.restoreMessages();return}const e=this.config.greeting||this.t.greeting;this.addMessage(e,"ai");const t=document.createElement("div");t.className="namaa-welcome",t.innerHTML=`
      <div class="namaa-quick-actions">
        ${this.t.quickActions.map(a=>`<button class="namaa-quick-btn" data-value="${a.value}">${a.label}</button>`).join("")}
      </div>
    `,this.messagesEl.appendChild(t),t.querySelectorAll(".namaa-quick-btn").forEach(a=>{a.addEventListener("click",()=>{const s=a.getAttribute("data-value")||"";t.remove(),this.inputEl.value=s,this.handleSend()})}),this.scrollToBottom()}restoreMessages(){for(const e of this.conversationHistory){const t=e.role==="user"?"user":"ai";this.addMessage(e.content,t,!1)}this.scrollToBottom()}addMessage(e,t,a=!0){const s={id:`msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,text:e,sender:t,timestamp:new Date};this.messages.push(s);const r=this.config.lang==="ar"?"ar-SA":"en-US",g=s.timestamp.toLocaleTimeString(r,{hour:"2-digit",minute:"2-digit"}),c=document.createElement("div");c.className=`namaa-msg namaa-msg-${t}`,c.innerHTML=`
      <div>${this.escapeHTML(e)}</div>
      <div class="namaa-msg-time">${g}</div>
    `,this.messagesEl.appendChild(c),a&&(this.conversationHistory.push({role:t==="user"?"user":"assistant",content:e}),E(this.config.orgId,this.conversationHistory)),this.scrollToBottom()}showTyping(){this.isTyping=!0,this.sendBtn.disabled=!0;const e=document.createElement("div");e.className="namaa-typing",e.id="namaa-typing-indicator",e.innerHTML=`
      <div class="namaa-typing-dot"></div>
      <div class="namaa-typing-dot"></div>
      <div class="namaa-typing-dot"></div>
    `,this.messagesEl.appendChild(e),this.scrollToBottom()}hideTyping(){this.isTyping=!1,this.sendBtn.disabled=!this.inputEl.value.trim();const e=this.messagesEl.querySelector("#namaa-typing-indicator");e&&e.remove()}async handleSend(){const e=this.inputEl.value.trim();if(!e||this.isTyping)return;const t=this.messagesEl.querySelector(".namaa-welcome");t&&t.remove(),this.inputEl.value="",this.sendBtn.disabled=!0,this.addMessage(e,"user"),this.showTyping();try{const a=await S(this.config.baseUrl,this.config.orgId,this.sessionId,e,this.conversationHistory.slice(0,-1));this.hideTyping(),a.error?this.addMessage(a.reply||this.t.errorMsg,"ai"):this.addMessage(a.reply,"ai")}catch{this.hideTyping(),this.addMessage(this.t.connectionError,"ai")}}scrollToBottom(){requestAnimationFrame(()=>{this.messagesEl.scrollTop=this.messagesEl.scrollHeight})}escapeHTML(e){const t=document.createElement("div");return t.textContent=e,t.innerHTML}}function B(){const i=document.querySelectorAll("script[data-org-id]"),e=i[i.length-1],a=document.currentScript||e,s=(a==null?void 0:a.getAttribute("data-org-id"))||"default",m=(a==null?void 0:a.getAttribute("data-theme"))||"teal",r=(a==null?void 0:a.getAttribute("data-lang"))||"ar",g=(a==null?void 0:a.getAttribute("data-position"))||"bottom-right",c=(a==null?void 0:a.getAttribute("data-greeting"))||"";let p="";if(a!=null&&a.src)try{p=new URL(a.src).origin}catch{p=""}const f=a==null?void 0:a.getAttribute("data-base-url");f&&(p=f);const x={orgId:s,theme:m,lang:r,position:g,greeting:c,baseUrl:p};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>new h(x)):new h(x)}window.NamaaWidget=h,B()})();
