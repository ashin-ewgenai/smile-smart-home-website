import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../../lib/hooks';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

// Self-contained Support Chat widget for Dashboard pages only
// - No external libraries
// - Uses Tailwind classes consistent with existing design
// - Persists state in localStorage under namespaced keys

type Message = {
  id: string;
  from: 'user' | 'assistant';
  text: string;
  ts: number; // epoch ms
};

const HISTORY_KEY = 'smile-chat-history';
const OPEN_KEY = 'smile-chat-open';
const SESSION_KEY = 'smile-chat-sessionId';
const UNREAD_KEY = 'smile-chat-unread';
const MAX_MESSAGE_WORDS = 40; // limit of words per message

function now() {
  return Date.now();
}

function formatTime(ts: number) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function truncateToWordLimit(text: string, maxWords = MAX_MESSAGE_WORDS): string {
  const words = text.trim().split(/\s+/);
  if (words.filter(Boolean).length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ');
}

function inferIntent(input: string): string {
  const q = input.toLowerCase();
  if (/price|pricing|cost|quote/.test(q)) return 'pricing';
  if (/service|offer|what.*do.*you.*do|capabilit/.test(q)) return 'services';
  if (/install|setup|configure|integration/.test(q)) return 'installation';
  if (/contact|phone|email|reach/.test(q)) return 'contact';
  if (/warranty|guarantee/.test(q)) return 'warranty';
  if (/support|hour|help|available/.test(q)) return 'hours';
  return 'fallback';
}

function replyForIntent(intent: string): string {
  switch (intent) {
    case 'pricing':
      return "We provide custom quotes based on your home and requirements. You can request a quote here: /contact or tap 'Get Quote' in the header.";
    case 'services':
      return "We design and install smart lighting, security, climate control and voice integrations. Explore more at /services.";
    case 'installation':
      return "Our team handles full installation and onboarding. We schedule a site visit, propose a plan, and set everything up for you.";
    case 'contact':
      return "You can reach us via the contact page at /contact. We'll respond promptly!";
    case 'warranty':
      return "We offer standard manufacturer warranties and optional extended coverage. Ask us about details during your quote.";
    case 'hours':
      return "Our support team is available Monday–Friday, 9am–6pm. Leave a message anytime and we'll follow up.";
    default:
      return "I can help with pricing, services, installation, and more. For detailed assistance, visit /contact and we'll get back to you.";
  }
}

const SupportChat: React.FC = () => {
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [unread, setUnread] = useState<number>(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setMessages(JSON.parse(h));
      const o = localStorage.getItem(OPEN_KEY);
      if (o) setOpen(JSON.parse(o));
      const sid = localStorage.getItem(SESSION_KEY);
      if (sid) setSessionId(sid);
      const ur = localStorage.getItem(UNREAD_KEY);
      if (ur) setUnread(Number(ur) || 0);
    } catch {}
  }, []);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(open));
    } catch {}
  }, [open]);

  // Reset unread when opened
  useEffect(() => {
    if (open && unread > 0) {
      setUnread(0);
      try { localStorage.setItem(UNREAD_KEY, '0'); } catch {}
    }
  }, [open]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Escape to close and focus trap handling
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') {
        setOpen(false);
      }
      if (e.key === 'Tab' && panelRef.current) {
        // very small focus trap: keep focus within panel
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length > 0) {
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          const active = document.activeElement as HTMLElement | null;
          if (e.shiftKey && active === first) {
            last.focus();
            e.preventDefault();
          } else if (!e.shiftKey && active === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const send = async () => {
    const trimmed = truncateToWordLimit(input).trim();
    if (!trimmed || typing) return;
    const userMsg: Message = { id: generateId(), from: 'user', text: trimmed, ts: now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setTyping(true);
    
    // Build minimal message history for backend
    const history = messages
      .slice(-10)
      .map(m => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }));
    const payload = {
      messages: [
        { role: 'system', content: 'You are Smile Smart Home support assistant. Be concise and helpful.' },
        ...history,
        { role: 'user', content: trimmed },
      ],
      sessionId: sessionId || undefined,
    };

    try {
      const chatFn = httpsCallable(functions, 'chatWithOpenAI');
      const res = await chatFn(payload as any);
      const reply = (res?.data as any)?.reply as string | undefined;
      const newSid = (res?.data as any)?.sessionId as string | undefined;
      if (newSid && newSid !== sessionId) {
        setSessionId(newSid);
        try { localStorage.setItem(SESSION_KEY, newSid); } catch {}
      }
      const text = reply && typeof reply === 'string' ? reply : 'Sorry, I could not generate a reply right now.';
      const botMsg: Message = { id: generateId(), from: 'assistant', text, ts: now() };
      setMessages(prev => [...prev, botMsg]);
      if (!open) {
        setUnread(u => {
          const n = u + 1;
          try { localStorage.setItem(UNREAD_KEY, String(n)); } catch {}
          return n;
        });
      }
    } catch (e) {
      // Fallback to heuristic reply
      const intent = inferIntent(trimmed);
      const replyText = replyForIntent(intent);
      const botMsg: Message = { id: generateId(), from: 'assistant', text: replyText, ts: now() };
      setMessages(prev => [...prev, botMsg]);
      if (!open) {
        setUnread(u => {
          const n = u + 1;
          try { localStorage.setItem(UNREAD_KEY, String(n)); } catch {}
          return n;
        });
      }
    } finally {
      setTyping(false);
    }
  };

  const toggleOpen = () => setOpen(v => !v);

  const ariaLabel = open ? 'Close support chat' : 'Open support chat';

  const handleClear = () => {
    setMessages([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
    setInput('');
    setTyping(false);
  };

  // Quick replies based on common intents
  const quickReplies = useMemo(
    () => [
      { label: 'Get a quote', text: 'I want a pricing quote.' },
      { label: 'Our services', text: 'What services do you offer?' },
      { label: 'Installation', text: 'How does installation work?' },
      { label: 'Contact', text: 'How can I contact the team?' },
      { label: 'Warranty', text: 'Do you provide warranty?' },
      { label: 'Working hours', text: 'What are your support hours?' }
    ],
    []
  );

  const showQuickReplies = useMemo(() => {
    if (messages.length === 0) return true;
    const last = messages[messages.length - 1];
    return last.from === 'assistant' && !typing;
  }, [messages, typing]);

  const handleQuickReply = (text: string) => {
    setInput(text);
    // small delay for UX before send
    setTimeout(() => send(), 0);
  };

  const handleInputKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  // Word count for conditional helper text
  const wordCount = useMemo(() => {
    const words = input.trim().split(/\s+/).filter(Boolean);
    return input.trim().length === 0 ? 0 : words.length;
  }, [input]);

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={ariaLabel}
        className="relative flex items-center justify-center h-12 w-12 rounded-full shadow-lg text-white bg-gradient-to-br from-teal to-gray-800 hover:opacity-90 transition-opacity"
      >
        {!open ? (
          // chat bubble icon (SVG, no extra libs)
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a4 4 0 0 1-4 4H7l-4 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
          </svg>
        ) : (
          // close icon
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-teal text-[10px] font-semibold grid place-items-center border border-teal shadow">
            {unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="mt-3 w-[26rem] max-w-sm rounded-xl border border-gray-200/70 dark:border-gray-700/60 bg-white dark:bg-gray-800 shadow-xl overflow-hidden animate-scale-in ring-1 ring-gray-200 dark:ring-gray-700"
          role="dialog"
          aria-label="Support chat panel"
        >
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal/10 to-transparent flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-teal text-white grid place-items-center shadow">
                {/* bot avatar icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 2a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v2h1a2 2 0 0 1 2 2v5a4 4 0 0 1-4 4h-1.18a2 2 0 0 1-1.79 1.11H9.97A2 2 0 0 1 8.18 21H7a4 4 0 0 1-4-4v-5a2 2 0 0 1 2-2h1V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1Zm-5 9v2h2v-2H7Zm10 0h-2v2h2v-2Z"/>
                </svg>
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">Smile Support</div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300 inline-flex items-center gap-1">
                  <span className="relative inline-flex h-2 w-2">
                    <span className="absolute inline-flex h-2 w-2 rounded-full bg-teal opacity-75"></span>
                  </span>
                  We're online
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Clear this conversation"
              >
                Clear
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="max-h-[28rem] overflow-y-auto px-4 py-3 space-y-3 bg-soft-gray/40 dark:bg-gray-900/20 animate-fade-in">
            {messages.length === 0 && (
              <div className="text-sm text-gray-700 dark:text-gray-200">
                Hi! How can I help you today? Select a quick option below or type your question.
              </div>
            )}
            {messages.map(m => (
              <div key={m.id} className={m.from === 'user' ? 'flex justify-end' : 'flex items-start gap-2'}>
                {m.from === 'assistant' && (
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-gray-100 text-teal grid place-items-center dark:bg-gray-800">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M12 2a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v2h1a2 2 0 0 1 2 2v5a4 4 0 0 1-4 4h-1.18a2 2 0 0 1-1.79 1.11H9.97A2 2 0 0 1 8.18 21H7a4 4 0 0 1-4-4v-5a2 2 0 0 1 2-2h1V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1Z"/>
                    </svg>
                  </div>
                )}
                <div className={
                  'relative inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow ' +
                  (m.from === 'user'
                    ? 'bg-teal text-white rounded-br-sm'
                    : 'bg-white text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded-bl-sm border border-gray-100 dark:border-gray-700')
                }>
                  <div>{m.text}</div>
                  <div className="mt-1 text-[10px] opacity-75">{formatTime(m.ts)}</div>
                  {/* Tail */}
                  <span className={
                    'absolute bottom-0 w-2 h-2 rotate-45 ' +
                    (m.from === 'user' ? 'right-0 translate-x-1 bg-teal' : 'left-0 -translate-x-1 bg-white dark:bg-gray-700 border-b border-l border-gray-100 dark:border-gray-700')
                  }></span>
                </div>
              </div>
            ))}
            {typing && (
              <div className="text-left">
                <div className="inline-block rounded-2xl px-3 py-2 text-sm bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700">
                  <span className="inline-flex items-center gap-2">
                    <span>Agent is typing</span>
                    {!prefersReducedMotion && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse"></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '120ms' }}></span>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '240ms' }}></span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {showQuickReplies && (
              <div className="pt-1 flex flex-wrap gap-2">
                {quickReplies.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => handleQuickReply(q.text)}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-teal/60 text-teal hover:bg-teal hover:text-white transition-colors"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Footer CTA removed per request */}
          </div>

          <form
            className="border-t border-gray-200 dark:border-gray-700 px-2 py-2 flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                const limited = truncateToWordLimit(val);
                setInput(limited);
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="Type your message"
              className="flex-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-teal"
            />
            
            {wordCount >= MAX_MESSAGE_WORDS && (
              <span className="text-[11px] text-gray-500 whitespace-nowrap mr-1">Max {MAX_MESSAGE_WORDS} words</span>
            )}
            <button
              type="submit"
              disabled={typing || !input.trim()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-teal text-teal hover:bg-teal hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-disabled={typing || !input.trim()}
            >
              <span>Send</span>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M3.4 20.6 22 12 3.4 3.4 3 10l10 2-10 2z"/>
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default SupportChat;
