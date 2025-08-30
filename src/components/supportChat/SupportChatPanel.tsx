import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, functions, storage } from '../../lib/firebase';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { triageChat } from '../../lib/chatbot';

interface SupportChatPanelProps {
  open: boolean;
  onClose: () => void;
  // New: enforce existing ticket for chatbot workflow
  ticketId?: string; // if undefined, chat will prompt user to raise a ticket first (bot mode)
  raiseTicketsHref?: string; // optional link target for the "Raise Tickets" page
}

type ChatMsg = {
  id?: string;
  role: 'user' | 'agent' | 'assistant';
  content?: string;
  imageUrl?: string;
  showTicketCTA?: boolean;
  ts: number;
  uploading?: boolean;
};

const SupportChatPanel: React.FC<SupportChatPanelProps> = ({ open, onClose, ticketId: providedTicketId, raiseTicketsHref }) => {
  const [uid, setUid] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // Global status kept if needed for future banners, but routing is claim-only
  const [statusOnline, setStatusOnline] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const msgsUnsubRef = useRef<null | (() => void)>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const botNeedsTicket = !claimed && !providedTicketId;

  const sessionId = useMemo(() => (uid ? `live_${uid}` : null), [uid]);
  // Offline (bot) local storage keys
  const OFFLINE_HISTORY_KEY = 'smile-chat-history';
  const OFFLINE_SESSION_KEY = 'smile-chat-sessionId';

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      const u = user?.uid || null;
      setUid(u);
      setIsAuthenticated(!!u);
    });
    return () => unsubAuth();
  }, []);

  // Read support availability (informational only)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'support_status', 'global'), (snap) => {
      setStatusOnline(Boolean(snap.data()?.online));
    });
    return () => unsub();
  }, []);

  // Read per-user claim. If claimed, AI must be disabled and messages go to Firestore live chat
  useEffect(() => {
    if (!uid) {
      setClaimed(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'support_claims', uid), (snap) => {
      // Only set claimed if the document exists AND online is true
      setClaimed(snap.exists() && Boolean(snap.data()?.online));
    });
    return () => unsub();
  }, [uid]);

  // Online (human) vs Offline (bot) mode handling
  useEffect(() => {
    // Ensure any previous listener is removed
    if (msgsUnsubRef.current) {
      try { msgsUnsubRef.current(); } catch {}
      msgsUnsubRef.current = null;
    }
    async function setupOnline() {
      if (!open || !uid || !sessionId) return;
      const sessionRef = doc(db, 'chat_sessions', sessionId);
      const snap = await getDoc(sessionRef);
      if (!snap.exists()) {
        await setDoc(sessionRef, {
          ownerUid: uid,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: 'ai',
          type: 'ai',
        }, { merge: true });
      }
      const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
      msgsUnsubRef.current = onSnapshot(query(msgsCol, orderBy('ts', 'asc')), (qSnap) => {
        const list: ChatMsg[] = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setMessages(list);
        setTimeout(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }, 0);
        setLoading(false);
      });
    }
    function setupOffline() {
      // Load offline history from localStorage
      try {
        const h = localStorage.getItem(OFFLINE_HISTORY_KEY);
        if (h) setMessages(JSON.parse(h));
        else setMessages([]);
      } catch { setMessages([]); }
      setLoading(false);
    }
    // Tear down previous already handled above
    setLoading(true);
    if (claimed) {
      setupOnline();
    } else {
      // For AI mode, we need to load from Firestore if authenticated, not localStorage
      if (isAuthenticated && uid && sessionId) {
        setupOnline();
      } else {
        setupOffline();
      }
    }
    return () => {
      if (msgsUnsubRef.current) {
        try { msgsUnsubRef.current(); } catch {}
        msgsUnsubRef.current = null;
      }
    };
  }, [open, uid, sessionId, claimed, isAuthenticated]);

  const send = async () => {
    const content = input.trim();
    if (!content) return;
    setInput('');

    if (claimed) {
      // Human online: send to Firestore live chat
      if (!uid || !sessionId) return;
      const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
      await addDoc(msgsCol, { role: 'user', content, ts: Date.now() });
      await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
      return;
    }

    // If authenticated user, use chatWithOpenAI for proper Firestore storage
    if (isAuthenticated) {
      const userMsg: ChatMsg = { role: 'user', content, ts: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      
      try {
        // Get last 5 messages for context (excluding current user message)
        const recentMessages = messages.slice(-4).map(msg => ({
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: msg.content || ''
        }));
        
        const payload = {
          messages: [
            ...recentMessages,
            { role: 'user', content },
          ],
          sessionId: sessionId, // Use consistent session ID for admin dashboard
        };
        const call = httpsCallable(functions, 'chatWithOpenAI');
        const res = await call(payload);
        const reply = (res?.data as any)?.reply as string | undefined;
        
        // Check if AI detected a complaint and show ticket CTA
        if (reply?.startsWith('COMPLAINT_DETECTED:')) {
          const cleanReply = reply.replace('COMPLAINT_DETECTED:', '').trim();
          const botMsg: ChatMsg = { role: 'assistant', content: cleanReply, ts: Date.now() };
          setMessages((prev) => [...prev, botMsg]);
          
          // Show ticket creation CTA
          const ctaMsg: ChatMsg = { 
            role: 'agent', 
            content: '🎫 It looks like you have a support issue. Would you like to create a support ticket for faster assistance?', 
            ts: Date.now() + 1,
            showTicketCTA: true
          };
          setMessages((prev) => [...prev, ctaMsg]);
        } else if (reply?.includes('Please upload an image of your device')) {
          // AI is requesting device image for serial number extraction
          const botMsg: ChatMsg = { role: 'assistant', content: reply, ts: Date.now() };
          setMessages((prev) => [...prev, botMsg]);
          
          // Show image upload prompt
          const imageMsg: ChatMsg = { 
            role: 'agent', 
            content: '📷 Please click the image button below to upload a photo of your device showing the serial number.', 
            ts: Date.now() + 1
          };
          setMessages((prev) => [...prev, imageMsg]);
        } else {
          const botMsg: ChatMsg = { role: 'assistant', content: reply || 'Sorry, I could not generate a reply right now.', ts: Date.now() };
          setMessages((prev) => [...prev, botMsg]);
        }
      } catch (error) {
        console.error('Chat error:', error);
        const errMsg: ChatMsg = { role: 'agent', content: 'Sorry, something went wrong. Please try again later.', ts: Date.now() };
        setMessages((prev) => [...prev, errMsg]);
      }
      return;
    }

    // If unauthenticated user, use triageChat for basic FAQs only
    if (!providedTicketId && !isAuthenticated) {
      const userMsg: ChatMsg = { role: 'user', content, ts: Date.now() };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        try { localStorage.setItem(OFFLINE_HISTORY_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      try {
        const res = await triageChat(content);
        if (res.kind === 'faq' || res.kind === 'general') {
          const botMsg: ChatMsg = { role: 'assistant', content: res.answer || 'Here to help with any quick questions.', ts: Date.now() };
          setMessages((prev) => {
            const next = [...prev, botMsg];
            try { localStorage.setItem(OFFLINE_HISTORY_KEY, JSON.stringify(next)); } catch {}
            return next;
          });
        } else {
          const infoMsg: ChatMsg = { role: 'agent', content: 'This looks like a support issue. Please sign in and create a support ticket for assistance.', ts: Date.now() };
          setMessages((prev) => {
            const next = [...prev, infoMsg];
            try { localStorage.setItem(OFFLINE_HISTORY_KEY, JSON.stringify(next)); } catch {}
            return next;
          });
        }
      } catch (error) {
        console.error('Triage chat error:', error);
        const errMsg: ChatMsg = { role: 'agent', content: 'Please sign in to use the chat feature.', ts: Date.now() };
        setMessages((prev) => {
          const next = [...prev, errMsg];
          try { localStorage.setItem(OFFLINE_HISTORY_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      }
      return;
    }

    // unified: no legacy branch; authenticated users handled above; unauthenticated triage handled earlier.
  };

  // Image upload handling
  const onPickImage = () => fileInputRef.current?.click();
  const onFileSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const maxBytes = 8 * 1024 * 1024; // 8MB
    if (file.size > maxBytes) {
      const errMsg: ChatMsg = { role: 'agent', content: 'Selected image is larger than 8MB.', ts: Date.now() };
      setMessages((prev) => [...prev, errMsg]);
      return;
    }

    const tempId = Math.random().toString(36).slice(2);
    setMessages((prev) => [...prev, { id: tempId, role: 'user', uploading: true, ts: Date.now() }]);

    const uid = auth.currentUser?.uid || 'anon';
    const sid = sessionId || 'local';
    const path = `support_chat/${uid}/${sid}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    const task = uploadBytesResumable(ref, file, { contentType: file.type });

    task.on('state_changed', undefined, (error) => {
      setMessages((prev) => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'agent', content: `Upload failed: ${error?.message || 'unknown error'}`, ts: Date.now() }) : m));
    }, async () => {
      const url = await getDownloadURL(task.snapshot.ref);
      // Replace placeholder locally
      setMessages((prev) => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'user', imageUrl: url, ts: Date.now() }) : m));
      // Persist to Firestore when claimed/live
      if (claimed && uid && sessionId) {
        try {
          const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
          await addDoc(msgsCol, { role: 'user', imageUrl: url, ts: Date.now() });
          await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
        } catch (e) {
          console.error('Failed to persist image message to Firestore:', e);
        }
      } else {
        // Process image for serial number extraction only if a valid ticket is available
        const activeTicketId = providedTicketId;
        if (!activeTicketId) {
          const warn: ChatMsg = { role: 'agent', content: 'Please create a support ticket first. Then upload the device photo here.', ts: Date.now() + 2 };
          setMessages((prev) => [...prev, warn]);
          return;
        }
        try {
          const extractSerial = httpsCallable(functions, 'extractSerialFromImage');
          const verifySerial = httpsCallable(functions, 'verifySerialAndFetchDocs');
          const suggestStep = httpsCallable(functions, 'suggestTroubleshootingStep');

          const extractResult = await extractSerial({ ticketId: activeTicketId, imageUrl: url });
          const serial = (extractResult.data as any)?.serial;

          if (serial) {
            // Verify serial and get device documentation
            const verifyResult = await verifySerial({ ticketId: activeTicketId, serial });
            const verifyData = verifyResult.data as any;

            if (verifyData?.valid) {
              // Suggest one next troubleshooting step based on docs and complaint
              const sres = await suggestStep({ ticketId: activeTicketId, docs: (verifyData.links || []) });
              const suggestion = (sres?.data as any)?.suggestion || 'Device-specific troubleshooting steps will be provided based on your device documentation.';

              const troubleshootMsg: ChatMsg = { 
                role: 'assistant', 
                content: `✅ Device verified! Serial: ${serial}\n\n${suggestion}`, 
                ts: Date.now() + 2 
              };
              setMessages((prev) => [...prev, troubleshootMsg]);
            } else {
              const errorMsg: ChatMsg = { 
                role: 'agent', 
                content: '❌ Device not recognized or not registered to your account. Please ensure the image shows the serial number clearly.', 
                ts: Date.now() + 2 
              };
              setMessages((prev) => [...prev, errorMsg]);
            }
          } else {
            const noSerialMsg: ChatMsg = { 
              role: 'agent', 
              content: '❌ Could not extract serial number from image. Please ensure the serial number is clearly visible and try again.', 
              ts: Date.now() + 2 
            };
            setMessages((prev) => [...prev, noSerialMsg]);
          }
        } catch (error) {
          console.error('Serial extraction error:', error);
          const errorMsg: ChatMsg = { 
            role: 'agent', 
            content: '❌ Failed to process device image. Please try again or contact support.', 
            ts: Date.now() + 2 
          };
          setMessages((prev) => [...prev, errorMsg]);
        }
        
        // Also keep in local history
        try {
          const OFFLINE_HISTORY_KEY = 'smile-chat-history';
          const next = [...messages.filter(Boolean), { id: tempId, role: 'user', imageUrl: url, ts: Date.now() } as ChatMsg];
          localStorage.setItem(OFFLINE_HISTORY_KEY, JSON.stringify(next));
        } catch {}
      }
    });
  };

  const requestHuman = async () => {
    if (!uid) return;
    try {
      await setDoc(doc(db, 'support_requests', uid), {
        requested: true,
        at: Date.now(),
      }, { merge: true });
    } catch {}
  };

  return (
    <div className={`fixed inset-y-0 right-0 z-[70] w-full sm:w-[420px] max-w-full transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-label="Support Chat">
      <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-xl">
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${claimed ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {claimed ? 'Human support connected' : 'Human support offline'}
            </div>
            {!claimed && (
              <button onClick={requestHuman} className="text-xs px-2 py-1 rounded-full border border-rose-600 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20">
                Request human
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-950">
          {loading && (
            <div className="text-xs text-gray-500">Loading conversation…</div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-sm text-gray-700 dark:text-gray-200 space-y-2">
              {claimed ? (
                <div>You are connected to our support team. Send your message to start.</div>
              ) : (
                <>
                  <div>I'm here to make your life easier. Ask me anything!</div>
                  {!isAuthenticated && (
                    <div className="p-2 rounded-md border border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                      Please sign in to use the chat feature for personalized support.
                    </div>
                  )}
                  {botNeedsTicket && isAuthenticated && (
                    <div className="p-2 rounded-md border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                      You can ask general questions here without a ticket. If you have an issue or complaint, please create a support ticket so our team can assist.
                      {raiseTicketsHref && (
                        <a href={raiseTicketsHref} className="ml-2 underline font-medium">Go to Raise Tickets</a>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {(() => {
            let agentCount = 0;
            return messages.map((m, i) => {
              const prev = i > 0 ? messages[i - 1] : undefined;
              const roleChanged = !prev || prev.role !== m.role;
              const isUser = m.role === 'user';
              const containerClass = isUser ? 'flex items-end justify-end' : 'flex items-end justify-start';
              let bubbleClass = '';
              if (isUser) {
                bubbleClass = 'bg-teal text-white rounded-br-sm shadow';
              } else {
                const parity = agentCount % 2; // alternate non-user backgrounds
                bubbleClass = parity === 0
                  ? 'bg-white dark:bg-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-sm shadow'
                  : 'bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-bl-sm shadow';
                agentCount += 1;
              }
              return (
                <div key={m.id || `${m.ts}-${m.role}-${(m.content||'').slice(0,8)}`} className={`${containerClass} ${roleChanged ? 'mt-4' : 'mt-1'} gap-2`}>
                  {!isUser && (
                    <div className="h-7 w-7 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-800 dark:text-gray-100 select-none">S</div>
                  )}
                  <div className="relative">
                    <div className={`max-w-[80vw] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm ${bubbleClass}`}>
                      {m.imageUrl ? (
                        <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block group">
                          <img src={m.imageUrl} alt="uploaded" className={`max-h-64 rounded-md ${isUser ? 'border border-white/20' : 'border border-gray-200 dark:border-gray-600'}`} />
                          {m.content && <div className="mt-1">{m.content}</div>}
                        </a>
                      ) : (
                        <div>{m.content}</div>
                      )}
                      {m.showTicketCTA && (
                        <div className="mt-2">
                          {raiseTicketsHref ? (
                            <a
                              href={raiseTicketsHref}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-600 text-white hover:bg-rose-700 text-xs"
                            >
                              Raise a Support Ticket
                            </a>
                          ) : (
                            <div className="text-xs text-rose-700">
                              Please go to your Dashboard → Support → Raise Ticket to proceed.
                            </div>
                          )}
                        </div>
                      )}
                      {m.uploading && (
                        <div className="mt-1 text-[10px] opacity-70">Uploading…</div>
                      )}
                      <div className="mt-1 text-[10px] opacity-70">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    {/* bubble tail */}
                    {isUser ? (
                      <div className="absolute -right-1 bottom-2 h-2 w-2 bg-teal rotate-45"></div>
                    ) : (
                      <div className={`absolute -left-1 bottom-2 h-2 w-2 rotate-45 ${bubbleClass.replace('rounded-bl-sm','').replace('rounded-2xl','')}`}></div>
                    )}
                  </div>
                  {isUser && (
                    <div className="h-7 w-7 rounded-full bg-teal text-white flex items-center justify-center text-[10px] select-none">You</div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          {/* Hidden file input for image pickup */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileSelected}
          />
          <button
            type="button"
            onClick={onPickImage}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Upload image"
            disabled={botNeedsTicket}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 12 3.5-4.2a1 1 0 0 1 1.5 0L13 14l2.5-3a1 1 0 0 1 1.5 0L19 14v2H5Zm3-8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
            </svg>
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={claimed ? 'Type your message…' : isAuthenticated ? 'Ask your question…' : 'Please sign in to chat'}
            className="flex-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none px-3 py-2 rounded-full border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-teal"
            disabled={!isAuthenticated && !claimed}
          />
          <button
            type="submit"
            disabled={!input.trim() || (!isAuthenticated && !claimed)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-teal text-teal hover:bg-teal hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default SupportChatPanel;
