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
    } catch (e) {
      // Fallback to heuristic reply
      const intent = inferIntent(trimmed);
      const replyText = replyForIntent(intent);
      const botMsg: Message = { id: generateId(), from: 'assistant', text: replyText, ts: now() };
      setMessages(prev => [...prev, botMsg]);
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

  return (
    <div className="fixed bottom-6 right-6 z-[60]">
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={ariaLabel}
        className="flex items-center justify-center h-12 w-12 rounded-full border border-teal text-teal bg-white dark:bg-charcoal shadow-lg hover:bg-teal hover:text-white transition-colors"
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
      </button>

      {/* Panel */}
      {open && (
        <div
          ref={panelRef}
          className="mt-3 w-[22rem] max-w-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-charcoal shadow-xl overflow-hidden"
          role="dialog"
          aria-label="Support chat panel"
        >
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Support</div>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Clear this conversation"
            >
              Clear
            </button>
          </div>

          <div ref={scrollRef} className="max-h-80 overflow-y-auto px-4 py-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-sm text-gray-600 dark:text-gray-300">Hi! How can I help you today?</div>
            )}
            {messages.map(m => (
              <div key={m.id} className={m.from === 'user' ? 'text-right' : 'text-left'}>
                <div className={
                  'inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ' +
                  (m.from === 'user'
                    ? 'bg-teal text-white'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200')
                }>
                  <div>{m.text}</div>
                  <div className="mt-1 text-[10px] opacity-75">{formatTime(m.ts)}</div>
                </div>
              </div>
            ))}
            {typing && (
              <div className="text-left">
                <div className="inline-block rounded-lg px-3 py-2 text-sm bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                  <span>Agent is typing</span>
                  {!prefersReducedMotion && (
                    <span className="inline-flex ml-1">
                      <span className="animate-pulse">.</span>
                      <span className="animate-pulse" style={{ animationDelay: '100ms' }}>.</span>
                      <span className="animate-pulse" style={{ animationDelay: '200ms' }}>.</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <form
            className="border-t border-gray-200 dark:border-gray-700 px-2 py-2 flex items-center gap-2"
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
              placeholder={`Type your message (max ${MAX_MESSAGE_WORDS} words)`}
              className="flex-1 bg-white dark:bg-charcoal text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none px-3 py-2 rounded border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-teal"
            />
            <button
              type="submit"
              disabled={typing || !input.trim()}
              className="px-3 py-2 rounded border border-teal text-teal hover:bg-teal hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-disabled={typing || !input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default SupportChat;
