import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, functions, storage } from '../../lib/firebase';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { triageChat } from '../../lib/chatbot';

interface SupportChatPanelProps {
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

const SupportChatPanel: React.FC<SupportChatPanelProps> = ({ ticketId: providedTicketId, raiseTicketsHref }) => {
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
      if (!uid || !sessionId) return;
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
  }, [uid, sessionId, claimed, isAuthenticated]);

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

  // If not authenticated, show sign-in prompt
  if (!isAuthenticated) {
    return (
      <section className="bg-gray-50 dark:bg-gray-900">
          <div className="px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Smart Assistant</h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Get instant help with your smart home devices</p>
          </div>
          <div className="px-4 pb-6 sm:px-6">
            <div className="text-center py-8">
              <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Sign In Required</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Please sign in to access our smart assistant and get personalized support for your devices.
              </p>
            </div>
          </div>
        </section>
    );
  }

  return (
    <section className="bg-gray-50 dark:bg-gray-900">
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="relative h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center shadow-md">
                <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Smart Assistant</h2>
              <div className="flex items-center gap-2 mt-1">
                <div className={`h-2 w-2 rounded-full ${claimed ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {claimed ? 'Human support connected' : 'AI Assistant active'}
                </span>
                {!claimed && (
                  <button onClick={requestHuman} className="text-xs px-2 py-1 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-300 dark:hover:bg-teal-900/40 transition-colors">
                    Request human
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="px-4 sm:px-6">
        <div
          ref={scrollRef}
          className="h-[calc(100vh-300px)] md:h-[calc(100vh-320px)] overflow-y-auto overscroll-y-contain py-4 pb-4 space-y-4 bg-gradient-to-b from-gray-50/50 to-white dark:from-gray-900/50 dark:to-gray-800 rounded-lg"
          onWheel={(e) => { e.stopPropagation(); }}
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'auto' as React.CSSProperties['touchAction'] }}
        >
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
              <span className="ml-2 text-sm text-gray-500">Loading conversation…</span>
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div className="text-center py-8 px-4">
              <div className="mx-auto h-12 w-12 text-teal-500 mb-4">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              {claimed ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Connected to Support</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">You're now connected to our support team. Send your message to start the conversation.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Smart Home Assistant</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">I'm here to help with your smart home devices and answer any questions you have!</p>
                  {botNeedsTicket && (
                    <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 text-sm">
                      💡 For technical issues or complaints, please create a support ticket for personalized assistance.
                      {raiseTicketsHref && (
                        <a href={raiseTicketsHref} className="ml-2 underline font-medium hover:no-underline">Create Ticket</a>
                      )}
                    </div>
                  )}
                </div>
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
                bubbleClass = 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg';
              } else {
                bubbleClass = 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 shadow-md';
                agentCount += 1;
              }
              return (
                <div key={m.id || `${m.ts}-${m.role}-${(m.content||'').slice(0,8)}`} className={`${containerClass} ${roleChanged ? 'mt-4' : 'mt-1'} gap-2`}>
                  {!isUser && (
                    <div className="relative">
                      <div className="relative h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center text-xs text-white font-medium shadow-md">
                        {/* Sparkles icon */}
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4m10 10v4m-2-2h4M8 14l4-8 4 8-4 2-4-2z" />
                        </svg>
                      </div>
                    </div>
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
                    <div className="relative">
                      <div className="relative h-8 w-8 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white flex items-center justify-center text-xs font-medium shadow-md">
                        {/* User silhouette */}
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Input Section at the bottom of the chat */}
      <div className="px-4 pb-4 sm:px-6">
        <form
          className="flex items-center gap-3 mt-4"
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
          {/* Image upload button on the left */}
          <button
            type="button"
            onClick={onPickImage}
            className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shadow-sm"
            title="Upload image"
            disabled={botNeedsTicket || !isAuthenticated}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={claimed ? 'Type your message…' : 'Ask me anything about your smart home...'}
              className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 pl-4 pr-14 py-3.5 sm:py-4 rounded-full border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent shadow-sm"
              disabled={!isAuthenticated}
            />
            {/* Send inside input with right arrow */}
            <button
              type="submit"
              disabled={!input.trim() || !isAuthenticated}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white hover:from-teal-600 hover:to-blue-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
            >
              <svg className="h-5 w-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {/* Paper plane icon rotated to send right */}
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default SupportChatPanel;
