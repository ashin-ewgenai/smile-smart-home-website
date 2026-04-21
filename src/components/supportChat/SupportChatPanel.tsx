import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, AudioLines } from 'lucide-react';
import { useAuthMode, AuthModeProvider } from '../../contexts/AuthModeContext';
import { Link } from 'react-router-dom';
import { auth, db, functions, storage, uploadFile } from '../../lib/firebase';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, limit, updateDoc, deleteField, where, deleteDoc, writeBatch } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
// Removed unused triageChat import - functionality integrated into chatWithOpenAI

interface SupportChatPanelProps {
  ticketId?: string; // if undefined, chat will prompt user to raise a ticket first (bot mode)
  raiseTicketsHref?: string; // optional link target for the "Raise Tickets" page
  isAuthenticated?: boolean; // passed from parent to avoid auth state flicker
}

interface TicketData {
  subject?: string;
  description?: string;
  needsSerial?: boolean;
  analysisResult?: string;
  ticketId?: string;
  category?: string;
  status?: string;
  createdAt?: string;
  deviceInfo?: {
    type?: string;
    model?: string;
    name?: string;
    serial?: string;
  }
  [key: string]: any;
}

interface Device {
  id: string;
  name: string;
  type: string;
  model: string;
  serial?: string;
}

type ChatMsg = {
  id?: string;
  role: 'user' | 'agent' | 'assistant';
  content?: string;
  imageUrl?: string;
  showTicketCTA?: boolean;
  showTicketVerification?: boolean;
  showDeviceSelection?: boolean;
  // New: prompt to continue an unresolved ticket or start fresh
  showUnresolvedPrompt?: boolean;
  unresolvedTicket?: {
    id: string;
    ticketNumber?: string;
    subject?: string;
    status?: string;
    createdAt?: string;
  };
  ticketDetails?: TicketData;
  devices?: Device[];
  deviceInfo?: {
    serialNumber?: string;
    warrantyExpiry?: string;
    documentation?: string;
    modelNumber?: string;
    brand?: string;
    description?: string;
    isOnline?: boolean;
    type?: string;
    deviceName?: string;
  };
  // Local flags for troubleshooting and escalation handling
  isTroubleshootingStep?: boolean;
  escalate?: boolean;
  ts: number;
  uploading?: boolean;
};

const SupportChatPanel: React.FC<SupportChatPanelProps> = (props) => {
  return (
    <AuthModeProvider>
      <SupportChatPanelInternal {...props} />
    </AuthModeProvider>
  );
};

const SupportChatPanelInternal: React.FC<SupportChatPanelProps> = ({ ticketId: providedTicketId, raiseTicketsHref, isAuthenticated: isAuthenticatedProp }) => {
  const [uid, setUid] = useState<string | null>(null);
  // Use prop if provided (from parent GuardedSupportChat), otherwise use local state
  const [isAuthenticatedLocal, setIsAuthenticated] = useState<boolean>(false);
  const isAuthenticated = isAuthenticatedProp !== undefined ? isAuthenticatedProp : isAuthenticatedLocal;
  // Global status kept if needed for future banners, but routing is claim-only
  const [statusOnline, setStatusOnline] = useState<boolean>(false);
  const [claimed, setClaimed] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  // Ensure ticket analysis runs only once per mount/session (guards against HMR/StrictMode double invoke)
  const initOnceRef = useRef(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [workflowStep, setWorkflowStep] = useState<'initial' | 'ticket_verification' | 'device_selection' | 'troubleshooting'>('initial');
  // Removed manual serial capture state and UI flow
  // Session-bound active ticket id for consistent context across openings
  const [sessionActiveTicketId, setSessionActiveTicketId] = useState<string | null>(null);
  // No-ticket mode ensures backend receives noTicket and avoids any ticket fallback
  const [noTicketMode, setNoTicketMode] = useState<boolean>(false);
  const lastUnboundTicketIdRef = useRef<string | null>(null);
  // Confirmation modal for starting a new chat
  const [confirmNewChatOpen, setConfirmNewChatOpen] = useState(false);
  // Track unresolved ticket (if any) shown in prompt
  const unresolvedShownRef = useRef<string | null>(null);
  const [confirmInline, setConfirmInline] = useState(false);
  const [showResolveFooter, setShowResolveFooter] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const hasEscalatedRef = useRef(false);
  const troubleshootingAttemptsRef = useRef(0);
  const wantsHumanIntentRef = useRef(false);
  const [hasDevicePendingTicket, setHasDevicePendingTicket] = useState(false);
  const [devicePendingTicket, setDevicePendingTicket] = useState<{
    id: string;
    ticketNumber?: string;
    subject?: string;
    status?: string;
    createdAt?: string;
  } | null>(null);
  
  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const msgsUnsubRef = useRef<null | (() => void)>(null);
  // File input for image sharing with human agents only (no OCR)
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Voice Assistant State (Global via AuthModeContext) ────────────────────
  const { 
    isMuted, 
    setIsMuted, 
    isListening, 
    setIsListening, 
    isSpeaking, 
    setIsSpeaking, 
    voiceSupported 
  } = useAuthMode();
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const lastSpokenTsRef = useRef<number>(0);
  // Stable ref to the send function — allows recognition.onresult to invoke
  // send() even though it is declared later in the component (avoids
  // use-before-declaration with const).
  const sendRef = useRef<(voiceText?: string) => Promise<void>>(() => Promise.resolve());
  
  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // ── Voice: synth initialization (runs once on mount) ────────────────────
  useEffect(() => {
    if (voiceSupported && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, [voiceSupported]);

  // ── Voice: speak a piece of text via SpeechSynthesis ────────────────────
  const speakText = useCallback(
    (text: string) => {
      if (isMuted || !synthRef.current) return;
      synthRef.current.cancel();
      // Strip markdown symbols and leading emoji for cleaner TTS
      const clean = text
        .replace(/[#*`_~>\[\]]/g, '')
        .replace(/^[\p{Emoji}\s]+/u, '')
        .trim();
      if (!clean) return;
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      synthRef.current.speak(utterance);
    },
    [isMuted]
  );

  // ── Voice: auto-speak newest assistant reply when not muted ──────────────
  useEffect(() => {
    if (isMuted) return;
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (m) =>
          (m.role === 'assistant' || m.role === 'agent') &&
          m.content &&
          !m.uploading
      );
    if (!lastAssistant || lastAssistant.ts === lastSpokenTsRef.current) return;
    
    // We only update the ref if we are actually going to speak
    lastSpokenTsRef.current = lastAssistant.ts;
    speakText(lastAssistant.content!);
  }, [messages, speakText, isMuted]);

  // ── Voice: start microphone listening ────────────────────────────────────
  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || isListening || isMuted || !isAuthenticated) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0][0].transcript.trim();
      if (!transcript) return;

      // Show the transcript in the input field so the user can see what was heard
      setInput(transcript);

      // After a short pause (600 ms) dispatch the message.
      // We read sendRef.current at call-time — it always points to the latest
      // send() regardless of when recognition fires, solving the
      // use-before-declaration problem with const.
      setTimeout(() => {
        sendRef.current(transcript);
      }, 600);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, isMuted, isAuthenticated]);

  // ── Voice: stop microphone listening ─────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);



  // ── Voice: cleanup recognition and TTS on unmount ────────────────────────
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      synthRef.current?.cancel();
    };
  }, []);

  const botNeedsTicket = !claimed && !providedTicketId;

  const sessionId = useMemo(() => (uid ? `live_${uid}` : null), [uid]);
  const unresolvedPromptTicket = useMemo(() => {
    const m = messages.find((x) => x.showUnresolvedPrompt && x.unresolvedTicket);
    return m?.unresolvedTicket || null;
  }, [messages]);
  const hasUnresolvedActive = useMemo(() => {
    const s = String((ticketData as any)?.status || '');
    const activeUnresolved = !noTicketMode && !!(ticketData as any)?.ticketId && s.toLowerCase() !== 'resolved';
    const promptUnresolved = !!unresolvedPromptTicket;
    return activeUnresolved || promptUnresolved;
  }, [noTicketMode, ticketData, unresolvedPromptTicket]);

  useEffect(() => {
    if (hasUnresolvedActive) {
      setShowResolveFooter(true);
    }
    const s = String((ticketData as any)?.status || '');
    if (noTicketMode || s.toLowerCase() === 'resolved') {
      setShowResolveFooter(false);
    }
    if (!hasUnresolvedActive) setConfirmInline(false);
  }, [hasUnresolvedActive, noTicketMode, ticketData]);
  
  // Chat reset function to clear initialization state
  const resetChat = () => {
    setMessages([]);
    setTicketData(null);
    setTicketLoading(false);
    setWorkflowStep('initial');
    hasInitialized.current = false; // Reset initialization flag
    hasEscalatedRef.current = false;
    troubleshootingAttemptsRef.current = 0;
    wantsHumanIntentRef.current = false;
    setConfirmInline(false);
    setShowResolveFooter(false);
    setSelectedDevice(null);
    setHasDevicePendingTicket(false);
    setDevicePendingTicket(null);
  };

  // Start a brand new chat without touching any ticket statuses
  const startNewChat = useCallback(async () => {
    if (!isAuthenticated || !uid || !sessionId || isResetting) return;
    setIsResetting(true);
    try {
      // Clear local UI state immediately so the user sees a fresh chat while we update Firestore
      resetChat();

      // Resolve (hide) existing messages in batches to avoid delete permission issues
      const msgsColRef = collection(db, 'chat_sessions', sessionId, 'messages');
      const allMsgsSnap = await getDocs(msgsColRef);
      let batch = writeBatch(db);
      let ops = 0;
      for (const d of allMsgsSnap.docs) {
        batch.set(d.ref, { resolved: true }, { merge: true });
        ops++;
        if (ops >= 450) { // stay under limit to be safe
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        }
      }
      if (ops > 0) {
        await batch.commit();
      }

      // Unbind any active ticket and reset session meta
      const sessionRef = doc(db, 'chat_sessions', sessionId);
      await setDoc(sessionRef, {
        updatedAt: Date.now(),
        status: 'ai',
        type: 'ai',
        activeTicketId: deleteField(),
      }, { merge: true });

      // Reset local state
      setSessionActiveTicketId(null);
      setTicketData(null);
      setWorkflowStep('initial');
      // Show generic welcome path in no-ticket mode
      setNoTicketMode(true);
      hasInitialized.current = false;
      hasEscalatedRef.current = false;
      troubleshootingAttemptsRef.current = 0;
      // Seed welcome message focused on troubleshooting and human escalation
      const welcome = {
        role: 'assistant' as const,
        content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.',
        showTicketCTA: false,
        ts: Date.now(),
        source: 'system'
      };
      try {
        await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), welcome);
        await setDoc(sessionRef, { updatedAt: serverTimestamp() }, { merge: true });
      } catch {}
      setMessages([welcome]);
    } catch (e) {
      // If anything fails, at least clear local UI
      resetChat();
    } finally {
      setIsResetting(false);
    }
  }, [isAuthenticated, uid, sessionId, isResetting]);

  // Offline mode removed: Support Chat requires full Firebase Auth

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
    const unsub = onSnapshot(
      doc(db, 'support_status', 'global'),
      (snap) => {
        setStatusOnline(Boolean(snap.data()?.online));
      },
      (error) => {
        // Gracefully handle permission errors during auth initialization
        console.warn('[SupportChatPanel] support_status listener error:', error.message);
        // Default to offline status if we can't read it
        setStatusOnline(false);
      }
    );
    return () => unsub();
  }, []);

  // Check if user has any support request or active support
  const [hasSupportDocument, setHasSupportDocument] = useState(false);
  const [hasSupportRequest, setHasSupportRequest] = useState(false);
  const [userTickets, setUserTickets] = useState<Array<{
    id: string;
    ticketNumber: string;
    subject: string;
    status: string;
    updatedAt?: string;
    shortDescription?: string;
  }>>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Read per-user claim. If claimed, AI must be disabled and messages go to Firestore live chat
  useEffect(() => {
    if (!uid) {
      setClaimed(false);
      setHasSupportDocument(false);
      setHasSupportRequest(false);
      setUserTickets([]);
      return;
    }

    // Log device data for debugging
    const logDeviceData = async () => {
      try {
        const devicesSnapshot = await getDocs(
          query(collection(db, 'User_Devices'), where('uid', '==', uid))
        );
        devicesSnapshot.forEach((doc) => {
          const data = doc.data();
        });
      } catch (error) {
      }
    };

    logDeviceData();

    // Listen to support_claims for active support status
    const claimsUnsub = onSnapshot(doc(db, 'support_claims', uid), (snap) => {
      const exists = snap.exists();
      setHasSupportDocument(exists);
      // Only set claimed if the document exists AND online is true
      setClaimed(exists && Boolean(snap.data()?.online));
    });

    // Listen to support_requests for pending request status
    const requestsUnsub = onSnapshot(doc(db, 'support_requests', uid), (snap) => {
      const exists = snap.exists();
      const data = snap.data();
      const requested = exists && Boolean(data?.requested);
      setHasSupportRequest(requested);
    });

    return () => {
      claimsUnsub();
      requestsUnsub();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setUserTickets([]);
      return;
    }
    let cancelled = false;
    const loadTickets = async () => {
      setTicketsLoading(true);
      try {
        const snap = await getDocs(query(
          collection(db, 'Support_Tickets'),
          where('uid', '==', uid),
          orderBy('updatedAt', 'desc'),
          limit(10)
        ));
        if (cancelled) return;
        const list = snap.docs.map((d) => {
          const data = d.data() as any;
          const tsVal = data.updatedAt || data.createdAt;
          const updatedAt = tsVal && typeof tsVal.toDate === 'function' ? tsVal.toDate().toLocaleString() : undefined;
          const ticketNumber = data.ticketNumber || `#${String(d.id).slice(-6).toUpperCase()}`;
          const subject = data.subject || 'Ticket';
          const rawDescription = String(data.description || data.initialSolution || '').trim();
          const shortDescription = rawDescription
            ? rawDescription.length > 120
              ? `${rawDescription.slice(0, 120)}…`
              : rawDescription
            : undefined;
          const status = String(data.status || 'Pending');
          return {
            id: d.id,
            ticketNumber,
            subject,
            status,
            updatedAt,
            shortDescription,
          };
        });
        setUserTickets(list);
      } catch {
        if (!cancelled) setUserTickets([]);
      } finally {
        if (!cancelled) setTicketsLoading(false);
      }
    };
    loadTickets();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Fetch ticket data if ticketId is provided OR a session-bound ticket exists
  useEffect(() => {
    if (noTicketMode) {
      setTicketData(null);
      return;
    }
    const effectiveTicketId = providedTicketId || sessionActiveTicketId || undefined;
    if (!effectiveTicketId) {
      setTicketData(null);
      return;
    }

    setTicketLoading(true);
    const unsub = onSnapshot(doc(db, 'Support_Tickets', effectiveTicketId), (snap) => {
      if (snap.exists()) {
        setTicketData(snap.data() as TicketData);
      } else {
        setTicketData(null);
      }
      setTicketLoading(false);
    });

    return () => unsub();
  }, [providedTicketId, sessionActiveTicketId, noTicketMode]);

  // Prevent double AI initialization
  const hasInitialized = useRef(false);

  // Fetch and analyze ticket data
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!uid || !isAuthenticated) return; // Wait for authentication
    
    const fetchAndAnalyzeTicket = async () => {
      try {
        setTicketLoading(true);
        // Don't set hasInitialized here - set it after messages are added
        
        // If specific ticketId provided or session-bound, analyze that ticket specifically
        const effectiveTicketId = providedTicketId || sessionActiveTicketId;
        if (noTicketMode) {
          // Render welcome only in no-ticket mode
          const combined: ChatMsg = {
            role: 'assistant',
            content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.',
            showTicketCTA: false,
            ts: Date.now(),
          };
          setMessages([combined]);
          hasInitialized.current = true;
          return;
        }
        if (effectiveTicketId) {
          const ticketDoc = await getDoc(doc(db, 'Support_Tickets', effectiveTicketId));
          
          if (!ticketDoc.exists()) {
            setTicketData(null);
            try { if (sessionId) await updateDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: deleteField(), updatedAt: serverTimestamp() }); } catch {}
            setSessionActiveTicketId(null);
            return;
          }
          
          const ticketData = ticketDoc.data();
          if (ticketData?.uid !== uid) {
            setTicketData(null);
            try { if (sessionId) await updateDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: deleteField(), updatedAt: serverTimestamp() }); } catch {}
            setSessionActiveTicketId(null);
            const combined: ChatMsg = {
              role: 'assistant',
              content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.',
              showTicketCTA: false,
              ts: Date.now(),
            };
            setMessages([combined]);
            hasInitialized.current = true;
            return;
          }

          // Set ticket data for context
          setTicketData({
            ticketId: effectiveTicketId,
            subject: ticketData.subject,
            description: ticketData.description,
            category: ticketData.category,
            status: ticketData.status,
            needsSerial: ticketData.needsSerial,
            initialSolution: ticketData.initialSolution
          });

          const ticketNumber = ticketData.ticketNumber || `#${effectiveTicketId.slice(-6).toUpperCase()}`;
          const statusLower = String(ticketData.status || '').toLowerCase();
          const unresolved = ['pending','in progress','awaiting_user','open'].includes(statusLower);
          if (!unresolved) {
            try { if (sessionId) await updateDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: deleteField(), updatedAt: serverTimestamp() }); } catch {}
            setSessionActiveTicketId(null);
            setTicketData(null);
            const combined: ChatMsg = {
              role: 'assistant',
              content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.',
              showTicketCTA: false,
              ts: Date.now(),
            };
            setMessages([combined]);
            hasInitialized.current = true;
            return;
          }
          // Persist active ticket binding on the session for future openings
          try {
            if (uid && sessionId) {
              await setDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: effectiveTicketId, updatedAt: serverTimestamp() }, { merge: true });
            }
          } catch {}
          
          if (ticketData.initialSolution) {
            // Show existing analysis
            const analysisMsg: ChatMsg = {
              role: 'assistant',
              content: `I found your support ticket ${ticketNumber}. Here's what I can help you with:\n\n${ticketData.initialSolution}`,
              ts: Date.now(),
            };
            setMessages([analysisMsg]);
            hasInitialized.current = true; // Set after messages are added
            // Removed serial prompt
          } else {
            // No analysis yet: fetch from DB and analyze via backend callable
            try {
              const analyze = httpsCallable(functions, 'analyzeTicketById');
              const res = await analyze({ ticketId: effectiveTicketId, sessionId });
              const data: any = res?.data || {};
              const analysis = data.initialSolution as string | undefined;
              const needsSerial: boolean = !!data.needsSerial;

              if (analysis) {
                const analysisMsg: ChatMsg = {
                  role: 'assistant',
                  content: `I found your support ticket ${ticketNumber}. Here's what I can help you with:\n\n${analysis}`,
                  ts: Date.now(),
                };
                setMessages([analysisMsg]);
                // Removed serial prompt
              } else {
                const fallbackMsg: ChatMsg = {
                  role: 'assistant',
                  content: `I found your active support ticket ${ticketNumber}. Let me verify the details with you first:`,
                  showTicketVerification: true,
                  ticketDetails: {
                    ticketId: effectiveTicketId,
                    ticketNumber: ticketNumber,
                    subject: ticketData.subject || 'No subject',
                    description: ticketData.description || 'No description',
                    category: ticketData.category || 'General',
                    status: ticketData.status || 'Pending',
                    createdAt: typeof ticketData.createdAt === 'object' && ticketData.createdAt && typeof (ticketData.createdAt as any).toDate === 'function' ? 
                      (ticketData.createdAt as any).toDate().toLocaleDateString() : 
                      'Unknown date'
                  },
                  ts: Date.now(),
                };
                setMessages([fallbackMsg]);
                setWorkflowStep('ticket_verification');
              }
              hasInitialized.current = true;
            } catch (e) {
              const errorMsg: ChatMsg = {
                role: 'assistant',
                content: 'I could not analyze your ticket right now. You can still describe your issue and I will assist.',
                ts: Date.now(),
              };
              setMessages([errorMsg]);
              hasInitialized.current = true;
            }
          }
        } else if (messages.length === 0) {
          // If there is no bound ticket, check if user has an unresolved ticket and offer to continue
          try {
            if (uid) {
              const unresolvedSnap = await getDocs(query(
                collection(db, 'Support_Tickets'),
                where('uid', '==', uid),
                orderBy('createdAt', 'desc'),
                limit(5)
              ));
              const firstOwnUnresolved = unresolvedSnap.docs
                .map((d) => ({ id: d.id, ...(d.data() as any) }))
                .find((t: any) => ['pending', 'in progress', 'awaiting_user', 'open'].includes(String(t.status || '').toLowerCase()));

              if (firstOwnUnresolved && unresolvedShownRef.current !== firstOwnUnresolved.id) {
                unresolvedShownRef.current = firstOwnUnresolved.id;
                const prompt: ChatMsg = {
                  role: 'assistant',
                  content: 'You have an unresolved support ticket. Would you like to continue with it or start a new chat?',
                  showUnresolvedPrompt: true,
                  unresolvedTicket: {
                    id: firstOwnUnresolved.id,
                    ticketNumber: firstOwnUnresolved.ticketNumber || `#${firstOwnUnresolved.id.slice(-6).toUpperCase()}`,
                    subject: firstOwnUnresolved.subject || 'Ticket',
                    status: firstOwnUnresolved.status || 'Pending',
                    createdAt: typeof firstOwnUnresolved.createdAt?.toDate === 'function' ? firstOwnUnresolved.createdAt.toDate().toLocaleDateString() : 'Unknown date',
                  },
                  ts: Date.now(),
                };
                setMessages([prompt]);
                // Persist this prompt so the real-time snapshot doesn't wipe it
                try {
                  if (uid && sessionId) {
                    const sessionRef = doc(db, 'chat_sessions', sessionId);
                    await setDoc(sessionRef, {
                      ownerUid: uid,
                      updatedAt: Date.now(),
                      status: 'ai',
                      type: 'ai',
                    }, { merge: true });
                    const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
                    // Avoid creating duplicates: check if a prompt already exists for this ticket
                    const existingSnap = await getDocs(query(
                      msgsCol,
                      where('showUnresolvedPrompt', '==', true),
                      where('unresolvedTicketId', '==', firstOwnUnresolved.id),
                      limit(1)
                    ));
                    if (existingSnap.empty) {
                      await addDoc(msgsCol, {
                        role: 'assistant',
                        content: prompt.content,
                        ts: prompt.ts,
                        showUnresolvedPrompt: true,
                        unresolvedTicket: prompt.unresolvedTicket,
                        unresolvedTicketId: firstOwnUnresolved.id,
                        source: 'system'
                      });
                    }
                  }
                } catch (e) {}
                hasInitialized.current = true;
                return;
              }
            }
          } catch (e) {}

          // No unresolved tickets: show welcome
          const combined: ChatMsg = {
            role: 'assistant',
            content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.',
            showTicketCTA: false,
            ts: Date.now(),
          };

          if (uid && sessionId) {
            try {
              const sessionRef = doc(db, 'chat_sessions', sessionId);
              await setDoc(sessionRef, {
                ownerUid: uid,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                status: 'ai',
                type: 'ai',
              }, { merge: true });

              // Seed only if there are no existing messages
              const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
              const existsSnap = await getDocs(query(msgsCol, limit(1)));
              if (existsSnap.empty) {
                await addDoc(msgsCol, { role: 'assistant', content: combined.content, ts: Date.now(), source: 'system', showTicketCTA: false });
              }
            } catch (e) {}
          } else {
            // Fallback for non-auth edge (should be rare): local render only
            setMessages([combined]);
          }

          hasInitialized.current = true; // Set after messages are added
        }
      } catch (error) {
        setTicketData(null);
        
        // Show welcome message even if there's an error
        const welcomeMsg: ChatMsg = {
          role: 'assistant',
          content: '👋 Hello! I\'m your Smart Home Support Assistant. I\'m here to help you with any issues or questions about your smart home devices.',
          ts: Date.now(),
        };
        
        const errorMsg: ChatMsg = {
          role: 'assistant',
          content: '⚠️ I\'m having trouble accessing your ticket information right now, but I can still help you!\n\n💬 How can I assist you today? You can:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• If needed, I can connect you to our human support team after a few troubleshooting steps.\n\nJust type your question and I\'ll be happy to help!',
          showTicketCTA: false,
          ts: Date.now() + 500,
        };
        setMessages([welcomeMsg, errorMsg]);
      } finally {
        setTicketLoading(false);
      }
    };

    // Only run if authenticated and no messages yet (or if we need to restore context)
    if (messages.length === 0 && !hasInitialized.current) {
      fetchAndAnalyzeTicket();
    }
  }, [providedTicketId, sessionActiveTicketId, uid, isAuthenticated, messages.length, noTicketMode]);

  // Check if there is a pending ticket for the selected/current device
  useEffect(() => {
    if (!uid) { setHasDevicePendingTicket(false); return; }
    // Prefer explicitly selected device, otherwise use latest detected deviceInfo in messages
    const latestWithDevice = [...messages].reverse().find(m => m.deviceInfo && (m.deviceInfo.serialNumber || m.deviceInfo.deviceName));
    const serial = (selectedDevice?.serial || latestWithDevice?.deviceInfo?.serialNumber || '').trim();
    const name = (selectedDevice?.name || latestWithDevice?.deviceInfo?.deviceName || '').trim();
    if (!serial && !name) { setHasDevicePendingTicket(false); setDevicePendingTicket(null); return; }

    (async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'Support_Tickets'),
          where('uid', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(10)
        ));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        let matched: any = null;
        const has = list.some(t => {
          const status = String(t.status || '').toLowerCase();
          const active = ['pending', 'in progress', 'awaiting_user', 'open'].includes(status);
          if (!active) return false;
          const di = (t as any).deviceInfo || {};
          const tSerial = (di.serial || di.serialNumber || '').toString().trim().toLowerCase();
          const tName = (di.name || di.deviceName || '').toString().trim().toLowerCase();
          const s = serial.toLowerCase();
          const n = name.toLowerCase();
          const ok = (s && tSerial && tSerial === s) || (n && tName && tName === n);
          if (ok && !matched) matched = t;
          return ok;
        });
        setHasDevicePendingTicket(has);
        if (has && matched) {
          const createdStr = typeof matched.createdAt?.toDate === 'function' ? matched.createdAt.toDate().toLocaleDateString() : 'Unknown date';
          setDevicePendingTicket({
            id: matched.id,
            ticketNumber: matched.ticketNumber || `#${String(matched.id).slice(-6).toUpperCase()}`,
            subject: matched.subject || 'Ticket',
            status: matched.status || 'Pending',
            createdAt: createdStr,
          });
        } else {
          setDevicePendingTicket(null);
        }
      } catch {
        setHasDevicePendingTicket(false);
        setDevicePendingTicket(null);
      }
    })();
  }, [uid, selectedDevice, messages]);

  // Auto-surface a prompt if a device-specific unresolved ticket exists and we haven't shown it
  useEffect(() => {
    if (!uid || !sessionId) return;
    const t = devicePendingTicket;
    if (!t) return;
    if (unresolvedShownRef.current === t.id) return;

    const prompt: ChatMsg = {
      role: 'assistant',
      content: 'You have an unresolved support ticket for this device. Would you like to continue with it or start a new chat?',
      showUnresolvedPrompt: true,
      unresolvedTicket: {
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        createdAt: t.createdAt,
      },
      ts: Date.now(),
    };

    setMessages(prev => {
      // Avoid duplicating if a similar prompt already exists in local state
      const exists = prev.some(m => m.showUnresolvedPrompt && m.unresolvedTicket?.id === t.id);
      return exists ? prev : [...prev, prompt];
    });
    unresolvedShownRef.current = t.id;

    // Persist into chat_sessions to survive reloads
    (async () => {
      try {
        const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
        const existingSnap = await getDocs(query(
          msgsCol,
          where('showUnresolvedPrompt', '==', true),
          where('unresolvedTicketId', '==', t.id),
          limit(1)
        ));
        if (existingSnap.empty) {
          await addDoc(msgsCol, {
            role: 'assistant',
            content: prompt.content,
            ts: prompt.ts,
            showUnresolvedPrompt: true,
            unresolvedTicket: prompt.unresolvedTicket,
            unresolvedTicketId: t.id,
            source: 'system'
          });
        }
      } catch {}
    })();
  }, [devicePendingTicket, uid, sessionId]);

  // Restore chat context from loaded messages
  const restoreChatContext = useCallback(async (messages: ChatMsg[]) => {
    if (hasInitialized.current || messages.length === 0) return;

    // Find the most recent assistant message to determine workflow state
    const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant' || m.role === 'agent');

    if (lastAssistantMsg) {
      // Check if we need to restore ticket data
      if (sessionActiveTicketId || providedTicketId) {
        const ticketId = providedTicketId || sessionActiveTicketId;
        if (ticketId) {
          try {
            const ticketDoc = await getDoc(doc(db, 'Support_Tickets', ticketId));
            if (ticketDoc.exists()) {
              const ticketData = ticketDoc.data();
              setTicketData({
                ticketId: ticketId,
                subject: ticketData.subject,
                description: ticketData.description,
                category: ticketData.category,
                status: ticketData.status,
                needsSerial: ticketData.needsSerial,
                initialSolution: ticketData.initialSolution
              });

              // Set workflow step based on conversation flow
              if (messages.some(m => m.showDeviceSelection)) {
                setWorkflowStep('device_selection');
              } else if (messages.some(m => m.showTicketVerification)) {
                setWorkflowStep('ticket_verification');
              } else if (ticketData.needsSerial && messages.some(m => m.content?.includes('serial number'))) {
                // Removed serial prompt restoration; proceed to troubleshooting
                setWorkflowStep('troubleshooting');
              } else {
                setWorkflowStep('troubleshooting');
              }
            }
          } catch (error) {}
        }
      }

      // Removed serial request state restoration

      // Check for device selection state
      if (lastAssistantMsg.showDeviceSelection) {
        setWorkflowStep('device_selection');
      }

      // Check for ticket verification state
      if (lastAssistantMsg.showTicketVerification) {
        setWorkflowStep('ticket_verification');
      }
    }

    hasInitialized.current = true;
  }, [sessionActiveTicketId, providedTicketId]);

  // Online (human) vs Offline (bot) mode handling
  const setupOnlineChat = useCallback(async () => {
    if (msgsUnsubRef.current) {
      try { msgsUnsubRef.current(); } catch (_e) {}
      msgsUnsubRef.current = null;
    }

    if (!uid || !sessionId) return;
    const sessionRef = doc(db, 'chat_sessions', sessionId!);
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
    // Load any previously bound active ticket and validate
    try {
      const sdata = (await getDoc(sessionRef)).data();
      const activeId = (sdata?.activeTicketId as string) || null;
      setSessionActiveTicketId(activeId);
      setNoTicketMode(!activeId);
      if (activeId) {
        try {
          const tSnap = await getDoc(doc(db, 'Support_Tickets', activeId));
          const tData: any = tSnap.exists() ? tSnap.data() : null;
          const belongs = tData && tData.uid === uid;
          const status = String(tData?.status || '').toLowerCase();
          const unresolved = ['pending','in progress','awaiting_user','open'].includes(status);
          if (!tSnap.exists() || !belongs || !unresolved) {
            try { await updateDoc(sessionRef, { activeTicketId: deleteField(), updatedAt: serverTimestamp() }); } catch {}
            setSessionActiveTicketId(null);
            setNoTicketMode(true);
          }
        } catch {}
      }
    } catch {}
    const msgsCol = collection(db, 'chat_sessions', sessionId!, 'messages');
    msgsUnsubRef.current = onSnapshot(query(msgsCol, orderBy('ts', 'asc')), (qSnap) => {
      let list: ChatMsg[] = qSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      // Filter out resolved prompts and deduplicate unresolved prompts (keep first per ticketId)
      const seenUnresolved: Record<string, boolean> = {};
      list = list.filter((m) => {
        if ((m as any).resolved === true) return false;
        if (!m.showUnresolvedPrompt) return true;
        const tid = (m as any).unresolvedTicketId || m.unresolvedTicket?.id || 'unknown';
        if (seenUnresolved[tid]) return false;
        seenUnresolved[tid] = true;
        return true;
      });
     try {
        const transformed: ChatMsg[] = [];
        for (const m of list) {
          let handled = false;
          if (m && m.role === 'assistant' && typeof m.content === 'string') {
            if (m.showTicketCTA || m.showUnresolvedPrompt || m.showTicketVerification || m.showDeviceSelection) {
              transformed.push(m as any);
              handled = true;
            } else {
              const raw = (m.content || '').trim();
              if (raw.startsWith('{') && raw.endsWith('}')) {
                try {
                  const data = JSON.parse(raw);
                  if (data && typeof data === 'object') {
                    const escalate = data.escalate === true;
                    if (data.stopAI === true) {
                      if (escalate) {
                        hasEscalatedRef.current = true;
                      }
                      handled = true;
                    } else if (data.no_device_found === true) {
                      transformed.push({ ...(m as any), content: 'Can you confirm your serial number or device name?' });
                      handled = true;
                    } else if (data.type === 'device_info' && data.device) {
                      const dvc = data.device || {};
                      const name = dvc.deviceName || dvc.name || '';
                      const model = dvc.modelNumber || dvc.model || '';
                      const statusBool = typeof dvc.isOnline === 'boolean' ? dvc.isOnline : undefined;
                      const brand = dvc.brand || undefined;
                      const serial = dvc.serialNumber || dvc.serial || undefined;
                      const warr = dvc.warrantyExpiry || dvc.warrantyEnd || dvc.warranty || undefined;
                      const docUrl = dvc.documentation || dvc.manualUrl || undefined;
                      const parts: string[] = [];
                      if (name || model) parts.push(`${name || 'Device'}${model ? ` (${model})` : ''}`);
                      if (typeof statusBool === 'boolean') parts.push(statusBool ? 'Online' : 'Offline');
                      if (warr) {
                        let w = '' as string;
                        try {
                          const dt = new Date(warr);
                          w = isNaN(dt.getTime()) ? String(warr) : dt.toLocaleDateString();
                        } catch { w = String(warr); }
                        parts.push(`Warranty: ${w}`);
                      }
                      const contentText = parts.join(' • ') || 'Device information available.';
                      const deviceInfo = {
                        deviceName: name || undefined,
                        modelNumber: model || undefined,
                        brand,
                        serialNumber: serial,
                        warrantyExpiry: warr,
                        documentation: docUrl,
                        isOnline: statusBool,
                        type: dvc.type || undefined,
                        description: dvc.description || undefined,
                      } as ChatMsg['deviceInfo'];
                      transformed.push({ ...(m as any), content: contentText, deviceInfo });
                      handled = true;
                    } else if (data.mode === 'troubleshooting' && data.allowTroubleshooting === true) {
                      const text = (data.message || (Array.isArray(data.steps) ? data.steps.join('\n') : '') || data.step || '').toString().trim();
                      if (text) {
                        const msg: any = { ...(m as any), content: text };
                        if (escalate) {
                          hasEscalatedRef.current = true;
                          msg.escalate = true;
                        } else if (!hasEscalatedRef.current) {
                          msg.isTroubleshootingStep = true;
                          if (typeof (data as any).stepIndex === 'number') {
                            (msg as any).stepIndex = (data as any).stepIndex;
                          }
                        } else {
                          handled = true;
                        }
                        if (!handled) {
                          transformed.push(msg as ChatMsg);
                        }
                      }
                      handled = true;
                    } else if (data.redirect === 'device_scope_only') {
                      transformed.push({ ...(m as any), content: 'I can only assist with device information, setup, warranty, or troubleshooting for Smart Smile Home products.' });
                      handled = true;
                    }
                  }
                } catch {}
              } else {}
            }
          }
          if (!handled) transformed.push(m as any);
        }
        list = transformed;
        // Deduplicate adjacent identical messages (e.g., optimistic + persisted)
        try {
          const norm = (s: any) => String(s || '').trim();
          const deduped: ChatMsg[] = [];
          for (const item of list) {
            const prev = deduped[deduped.length - 1];
            if (prev && prev.role === item.role && norm(prev.content) === norm(item.content)) {
              continue;
            }
            deduped.push(item as any);
          }
          list = deduped;
        } catch {}

        // ── Optimistic UI Merge ──
        // Preserve local "uploading" messages that might not have reached Firestore yet
        setMessages((prev) => {
          const optimistic = prev.filter(m => m.uploading);
          if (optimistic.length === 0) return list;
          
          // Filter out optimistic messages that are now present in the server list
          const serverContents = new Set(list.map(m => String(m.content || '').trim()));
          const remainingOptimistic = optimistic.filter(m => !serverContents.has(String(m.content || '').trim()));
          
          return [...list, ...remainingOptimistic];
        });
      } catch {}

      // Restore chat context based on loaded messages
      if (list.length > 0 && !hasInitialized.current) {
        restoreChatContext(list);
      }

      setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 0);
      setLoading(false);
    });
  }, [uid, sessionId, restoreChatContext]);

  useEffect(() => {
    // Set loading state before checking authentication
    setLoading(true);

    if (!isAuthenticated) {
      // Not authenticated; do not load messages. UI renders sign-in prompt.
      setMessages([]);
      setLoading(false);
      return () => {
        if (msgsUnsubRef.current) {
          try { msgsUnsubRef.current(); } catch (_e) {}
          msgsUnsubRef.current = null;
        }
      };
    }

    // Always call setupOnlineChat when authenticated, regardless of whether dependencies changed
    // This ensures messages are loaded when navigating back to the component
    setupOnlineChat();

    return () => {
      if (msgsUnsubRef.current) {
        try { msgsUnsubRef.current(); } catch (_e) {}
        msgsUnsubRef.current = null;
      }
    };
  }, [uid, sessionId, claimed, isAuthenticated, setupOnlineChat, restoreChatContext]);

  // Update session status when human support is claimed/cancelled
  useEffect(() => {
    if (uid && sessionId && isAuthenticated) {
      setDoc(doc(db, 'chat_sessions', sessionId), {
        status: claimed ? 'human' : 'ai',
        updatedAt: Date.now(),
      }, { merge: true }).catch(() => {});
    }
  }, [claimed, uid, sessionId, isAuthenticated]);

  // Check if we need to show initial solution or prompt for device image after ticket analysis
  useEffect(() => {
    if (hasInitialized.current) return;
    if (!providedTicketId || !ticketData || messages.length > 0) return;
    hasInitialized.current = true;
    // Show initial solution if available
    if (ticketData.initialSolution) {
      const solutionMsg: ChatMsg = {
        role: 'assistant',
        content: ticketData.initialSolution,
        ts: Date.now(),
      };

      setMessages([solutionMsg]);

      // Removed serial request prompt
    }
    // If no initial solution but needs serial, prompt for image
    else if (ticketData.needsSerial) {
      // Removed serial request prompt
    }
  }, [providedTicketId, ticketData, messages.length]);

  const [isSending, setIsSending] = useState(false);

  const shouldEscalateToHuman = (text: string): boolean => {
    const lowered = text.toLowerCase();
    const phrases = [
      'i need human assistance',
      'i need a human',
      'connect me to an agent',
      'connect me to a human',
      'i want to talk to a person',
      'talk to a person',
      'talk to a human',
      'please call me',
      'customer care',
      'support team',
      'call me',
    ];
    if (phrases.some((phrase) => lowered.includes(phrase))) {
      return true;
    }
    const explicitPatterns = /(human (help|support|agent|assistance|person))|(talk to (a )?(human|person|agent))|(connect me (with|to) (a )?(human|person|agent))/i;
    return explicitPatterns.test(text);
  };

  // ── Core send function — accepts an optional voiceText so voice input can
  // bypass the React-state batching delay. When voiceText is provided the
  // input field is already cleared by the caller (recognition.onresult).
  const send = async (voiceText?: string): Promise<void> => {
    const content = (voiceText ?? input).trim();
    if (!content || isSending) return;
    if (voiceText) setInput('');
    else if (!voiceText) setInput('');
    setIsSending(true);

    const wantsHuman = shouldEscalateToHuman(content);

    if (wantsHuman && !claimed) {
      const ts = Date.now();
      const promptMsg = "I can help with that. First, please describe the issue you're facing. I'll share troubleshooting steps, and if it's still not resolved after two tries, I'll connect you to our support team.";

      try { setWorkflowStep('troubleshooting'); } catch {}
      troubleshootingAttemptsRef.current = 0;
      wantsHumanIntentRef.current = true;

      setMessages((prev) => [
        ...prev,
        { role: 'user', content, ts },
        { role: 'agent', content: promptMsg, ts: ts + 1 },
      ]);

      if (uid && sessionId) {
        try {
          const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
          await addDoc(msgsCol, { role: 'user', content, ts });
          await addDoc(msgsCol, { role: 'assistant', content: promptMsg, ts: ts + 1, source: 'system' });
          await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'ai' }, { merge: true });
        } catch (e) {}
      }

      setIsSending(false);
      return;
    }

    // Auto-escalation: if the last assistant message suggested escalation and user consents ("yes", "ok", etc.),
    // automatically create a human support request and confirm in chat.
    try {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && (m.content || '').length > 0);
      const affirmative = /^(yes|yep|yeah|ok|okay|sure|please|do it|go ahead|proceed|confirm)\b/i.test(content);
      const escalationSuggested = !!(lastAssistant && /escalat/i.test(lastAssistant.content || ''));
      const attemptsSoFar = troubleshootingAttemptsRef.current;
      if (affirmative && escalationSuggested && attemptsSoFar >= 2) {
        if (wantsHumanIntentRef.current) {
          await requestHuman();
          setHasSupportRequest(true);
          const finalMsg = "Thanks for your patience. I'm connecting you to our support team. One of our agents will call you shortly.";
          const nowTs = Date.now();
          setMessages((prev) => [
            ...prev,
            { role: 'user', content, ts: nowTs - 1 },
            { role: 'agent', content: finalMsg, ts: nowTs },
          ]);

          if (uid && sessionId) {
            try {
              const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
              await addDoc(msgsCol, { role: 'user', content, ts: nowTs - 1 });
              await addDoc(msgsCol, { role: 'assistant', content: finalMsg, ts: nowTs, source: 'system' });
              await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
            } catch (e) {}
          }
          setIsSending(false);
          return;
        } else {
          const ts = Date.now();
          const finalMsg = "Thanks for your patience. I'm connecting you to our support team. One of our agents will call you shortly.";
          try { await requestHuman(); } catch (e) {}
          setHasSupportRequest(true);
          hasEscalatedRef.current = true;
          setMessages((prev) => [
            ...prev,
            { role: 'user', content, ts },
            { role: 'agent', content: finalMsg, ts: ts + 1 },
          ]);
          if (uid && sessionId) {
            try {
              const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
              await addDoc(msgsCol, { role: 'user', content, ts });
              await addDoc(msgsCol, { role: 'assistant', content: finalMsg, ts: ts + 1, source: 'system' });
              await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
            } catch (e) {}
          }
          setIsSending(false);
          return;
        }
      }
    } catch {}

    // Track user rejections of troubleshooting steps ("no", "still not working", etc.)
    // After 2 such replies in the current chat, stop AI troubleshooting and surface escalation options instead.
    const negativePhrases = /(still\s+not\s+working|still\s+not\s+fixed|still\s+same\s+issue|same\s+issue|not\s+solved|didn['’]?t\s+work|doesn['’]?t\s+work|not\s+working|nothing\s+changed|no\s+change)/i;
    const isShortNo = /^\s*(no|not really)\b/i.test(content);
    const isNegativeReply = isShortNo || negativePhrases.test(content);

    if (!claimed && isNegativeReply) {
      const attempts = troubleshootingAttemptsRef.current + 1;
      troubleshootingAttemptsRef.current = attempts;

      // On or after the 2nd negative reply
      if (attempts >= 2) {
        const ts = Date.now();
        if (wantsHumanIntentRef.current) {
          const finalMsg = "Thanks for your patience. I'm connecting you to our support team. One of our agents will call you shortly.";
          hasEscalatedRef.current = true;
          try { await requestHuman(); } catch (e) {}
          setHasSupportRequest(true);
          setMessages((prev) => [
            ...prev,
            { role: 'user', content, ts },
            { role: 'agent', content: finalMsg, ts: ts + 1 },
          ]);
          if (uid && sessionId) {
            try {
              const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
              await addDoc(msgsCol, { role: 'user', content, ts });
              await addDoc(msgsCol, { role: 'assistant', content: finalMsg, ts: ts + 1, source: 'system' });
              await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
            } catch (e) {}
          }
        } else {
          const finalMsg = "Thanks for your patience. I'm connecting you to our support team. One of our agents will call you shortly.";
          hasEscalatedRef.current = true;
          try { await requestHuman(); } catch (e) {}
          setHasSupportRequest(true);
          setMessages((prev) => [
            ...prev,
            { role: 'user', content, ts },
            { role: 'agent', content: finalMsg, ts: ts + 1 },
          ]);
          if (uid && sessionId) {
            try {
              const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
              await addDoc(msgsCol, { role: 'user', content, ts });
              await addDoc(msgsCol, { role: 'assistant', content: finalMsg, ts: ts + 1, source: 'system' });
              await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
            } catch (e) {}
          }
        }

        setIsSending(false);
        return;
      }
    }

    if (claimed) {
      // Human online: send to Firestore live chat
      if (!uid || !sessionId) { setIsSending(false); return; }
      const msgsCol = collection(db, 'chat_sessions', sessionId!, 'messages');
      await addDoc(msgsCol, { role: 'user', content, ts: Date.now() });
      await setDoc(doc(db, 'chat_sessions', sessionId!), { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
      setIsSending(false);
      return;
    }

    // Frontend no longer prompts for model; rely on backend to request serial number if needed

    // If authenticated user, call chatWithOpenAI and rely on backend to persist messages
    if (isAuthenticated) {
      try {
        // Get last 5 messages for context (excluding current user message)
        const recentMessages = messages.slice(-4).map(msg => ({
          role: msg.role === 'agent' ? 'assistant' : msg.role,
          content: msg.content || ''
        }));

        const ticketForPayload = noTicketMode ? undefined : (providedTicketId || (ticketData as any)?.ticketId || sessionActiveTicketId || undefined);
        const payload = {
          messages: [
            ...recentMessages,
            { role: 'user', content },
          ],
          sessionId: sessionId, // Use consistent session ID for admin dashboard
          ...(ticketForPayload && { ticketId: ticketForPayload }), // Include ticket ID if available
          ...(noTicketMode ? { noTicket: true, skipTicketId: lastUnboundTicketIdRef.current || undefined } : {}),
          // Enable server-side debug info in response (temporary; remove for prod)
          debug: true,
        };

        // Optimistic UI: append the user's message immediately with a sending flag
        const optimisticTs = Date.now();
        setMessages((prev) => [
          ...prev,
          { role: 'user', content, ts: optimisticTs, uploading: true },
          { role: 'agent', content: 'Sending…', ts: optimisticTs + 1, uploading: true },
        ]);

        const call = httpsCallable(functions, 'chatWithOpenAI');
        const res = await call(payload);
        const reply = (res?.data as any)?.reply as string | undefined;

        // Handle enhanced workflow responses
        const resData = res?.data as any;
        if (resData?.debugInfo) {
          const d = resData.debugInfo;
          try {
            (d.deviceDocs || []).map((x: any) => ({
              id: x.id,
              storedUid: x.uid,
              deviceSerial: x.deviceSerial,
              serial: x.serial,
              serialNumber: x.serialNumber,
              serials: Array.isArray(x.serials) ? x.serials.map((s: any) => s.serialNumber).join(', ') : ''
            }));
          } catch (e) {
            // ignore debug errors
          }
        }

        // Handle device info from backend response
        if (resData?.deviceInfo || reply) {
          // Clear sending placeholders; rely on Firestore snapshot for final assistant message
          setMessages((prev) => prev.filter((m) => !m.uploading));
        }

        // Do not write messages on the client in AI mode; backend persists both
        if (resData?.ticketDetails) {
          setWorkflowStep('ticket_verification');
        } else if (resData?.deviceSelection) {
          setWorkflowStep('device_selection');
        } else {
          // no-op
        }
      } catch (error) {
        const err = error as any;
        const code: string = String(err?.code || '');
        let message = "I’m having trouble responding right now. Please try again.";
        if (code.includes('resource-exhausted')) {
          message = "You’re sending messages too quickly. Please wait a few seconds and try again.";
        } else if (code.includes('unauthenticated')) {
          message = "Please sign in to use the assistant.";
        }
        try { console.error('chatWithOpenAI failed:', err); } catch {}
        setMessages((prev) => [
          ...prev,
          { role: 'agent', content: message, ts: Date.now() },
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    setIsSending(false);
    // Unauthenticated users cannot send; UI already shows sign-in required

    // unified: no legacy branch; authenticated users handled above; unauthenticated triage handled earlier.
  };
  // Keep the ref up-to-date so voice recognition can always call the latest send()
  sendRef.current = send;

  // Removed manual serial verification handling and callable usage


  const handleTicketVerification = async (confirmed: boolean) => {
    if (confirmed) {
      setWorkflowStep('troubleshooting');
      const userMsg: ChatMsg = { role: 'user', content: 'Yes, the ticket details are correct', ts: Date.now() };
      setMessages(prev => [...prev, userMsg]);
    } else {
      // User wants to update ticket
      const updateMsg: ChatMsg = {
        role: 'agent',
        content: 'Please update your ticket details and try again.',
        ts: Date.now()
      };
      setMessages(prev => [...prev, updateMsg]);
    }
  };

  const handleDeviceSelection = async (device: Device) => {
    setSelectedDevice(device);
    setWorkflowStep('troubleshooting');
    
    // Send device selection message
    const userMsg: ChatMsg = {
      role: 'user',
      content: `I selected ${device.name} (${device.type})`,
      ts: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Proceed without requesting serial entry
    const confirmMsg: ChatMsg = {
      role: 'agent',
      content: `Device selected: ${device.name}. How can I help you with it?`,
      ts: Date.now() + 1
    };
    setMessages(prev => [...prev, confirmMsg]);
  };

  // Track if requestHuman is currently executing to prevent race conditions
  const isRequestingHuman = useRef(false);

  async function requestHuman() {
    if (!uid) return;

    // Prevent multiple simultaneous calls
    if (isRequestingHuman.current) {
      return;
    }
    isRequestingHuman.current = true;

    try {
      const claimsRef = doc(db, 'support_claims', uid);
      const claimsSnap = await getDoc(claimsRef);
      const currentRequestState = hasSupportRequest;

      // start request human

      if (claimsSnap.exists()) {
        // User has a support document - check if it's active, pending, or cancelled
        const isOnline = claimsSnap.data()?.online;
        const cancelledAt = claimsSnap.data()?.cancelledAt;
        const claimedAt = claimsSnap.data()?.claimedAt;

        // document analysis

        if (isOnline) {
          // User has active human support - cancel it
          await setDoc(claimsRef, {
            online: false,
            updatedAt: Date.now(),
          }, { merge: true });
          await setDoc(doc(db, 'support_requests', uid), {
            requested: false,
            cancelledAt: Date.now(),
          }, { merge: true });
        } else if (cancelledAt && (Date.now() - cancelledAt) < 60000) { // Cancelled within last minute
          // Document was recently cancelled - treat as new request
          await setDoc(claimsRef, {
            online: false,
            requestedAt: Date.now(),
            updatedAt: Date.now(),
            // Clear old cancellation data
            cancelledAt: deleteField(),
            claimedAt: deleteField(),
            claimedBy: deleteField(),
          }, { merge: true });

          await setDoc(doc(db, 'support_requests', uid), {
            requested: true,
            requestedAt: Date.now(),
            at: Date.now(),
            status: 'requested',
            // Clear old cancellation data
            cancelledAt: deleteField(),
          }, { merge: true });
        } else {
          // Document exists but not active and not recently cancelled - cancel it
          await setDoc(claimsRef, {
            online: false,
            cancelledAt: Date.now(),
            updatedAt: Date.now(),
          }, { merge: true });
          await setDoc(doc(db, 'support_requests', uid), {
            requested: false,
            cancelledAt: Date.now(),
          }, { merge: true });
        }
      } else {
        // No support document exists - create new request
        await setDoc(claimsRef, {
          online: false,
          requestedAt: Date.now(),
          updatedAt: Date.now(),
        }, { merge: true });

        // Update support_requests for new request
        await setDoc(doc(db, 'support_requests', uid), {
          requested: true,
          requestedAt: Date.now(),
          at: Date.now(),
          status: 'requested'
        }, { merge: true });
      }

      // Force immediate state verification and update
      setTimeout(async () => {
        try {
          const verifySnap = await getDoc(doc(db, 'support_requests', uid));
          const verifyData = verifySnap.data();
          const expectedState = verifySnap.exists() && Boolean(verifyData?.requested);

          
          // Force state update if needed
          if (hasSupportRequest !== expectedState) {
            setHasSupportRequest(expectedState);
          }
        } catch (error) {}
      }, 100);

    } catch (error) {} finally {
      isRequestingHuman.current = false;
    }
  };

  // Mark unresolved prompt as resolved in Firestore so it won't reappear
  const dismissUnresolvedPrompt = async (forTicketId?: string) => {
    try {
      if (!uid || !sessionId) return;
      const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
      // Find all prompts (rarely more than one due to dedupe) and mark resolved
      const snap = await getDocs(query(
        msgsCol,
        where('showUnresolvedPrompt', '==', true),
        ...(forTicketId ? [where('unresolvedTicketId', '==', forTicketId)] as any : []),
        limit(5)
      ));
      const batch: Array<Promise<any>> = [];
      snap.forEach((d) => {
        batch.push(updateDoc(doc(db, 'chat_sessions', sessionId, 'messages', d.id), { resolved: true }));
      });
      await Promise.all(batch);
    } catch (e) {}
  };

  // Continue with unresolved ticket: bind to session and analyze
  const continueWithTicket = async (tid: string) => {
    if (!uid || !sessionId) return;
    try {
      await setDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: tid, updatedAt: serverTimestamp() }, { merge: true });
      setSessionActiveTicketId(tid);
      // Clear prompt and trigger analyze flow by calling analyzeTicketById directly for responsiveness
      setMessages((prev) => prev.filter((m) => !m.showUnresolvedPrompt));
      // Mark prompt as resolved in Firestore
      await dismissUnresolvedPrompt(tid);
      try {
        const analyze = httpsCallable(functions, 'analyzeTicketById');
        const res = await analyze({ ticketId: tid, sessionId });
        const data: any = res?.data || {};
        const analysis = data.initialSolution as string | undefined;
        const needsSerial: boolean = !!data.needsSerial;
        const ticketNumber = data.ticketId ? `#${String(data.ticketId).slice(-6).toUpperCase()}` : '';
        if (analysis) {
          setMessages((prev) => [...prev, { role: 'assistant', content: `I found your support ticket ${ticketNumber}. Here's what I can help you with:\n\n${analysis}`.trim(), ts: Date.now() }]);
          // Removed serial request prompt
        }
      } catch (e) {}
    } catch (e) {}
  };

  // Start new chat by cancelling the provided unresolved ticket, then unbind.
  const unbindTicketStartNew = async (ticketIdToCancel?: string) => {
    if (!uid || !sessionId) return;
    try {
      if (ticketIdToCancel) {
        try {
          const tRef = doc(db, 'Support_Tickets', ticketIdToCancel);
          await updateDoc(tRef, { status: 'Resolved', updatedAt: serverTimestamp(), manuallyUnbound: true });
        } catch (e) {}
      }
      await updateDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: deleteField(), updatedAt: serverTimestamp() });
      setSessionActiveTicketId(null);
      setTicketData(null);
      setNoTicketMode(true);
      hasEscalatedRef.current = false;
      troubleshootingAttemptsRef.current = 0;
      // Mark any unresolved prompt as resolved to hide it
      await dismissUnresolvedPrompt(ticketIdToCancel);
      const note = ticketIdToCancel ? 'Previous ticket has been marked as resolved. Starting a new conversation.' : 'Starting a new conversation not linked to your previous ticket.';
      setMessages((prev) => prev.filter((m) => !m.showUnresolvedPrompt).concat({ role: 'agent', content: note, ts: Date.now() }));
    } catch (e) {
      setMessages(prev => [...prev, { role: 'agent', content: 'Could not start a new chat right now. Please try again.', ts: Date.now() }]);
    }
  };

  const handleResolveTicket = async () => {
    const activeId = (ticketData as any)?.ticketId || sessionActiveTicketId;
    const targetId = activeId || (unresolvedPromptTicket as any)?.id;
    if (!uid || !sessionId || !targetId) return;
    try {
      const tRef = doc(db, 'Support_Tickets', targetId);
      await updateDoc(tRef, { status: 'Resolved', updatedAt: serverTimestamp() });
      if (!activeId && (unresolvedPromptTicket as any)?.id === targetId) {
        try { await dismissUnresolvedPrompt(targetId); } catch {}
        setMessages((prev) => prev.filter((m) => !m.showUnresolvedPrompt));
      }
      if (activeId && ticketData) {
        setTicketData({ ...(ticketData as any), status: 'Resolved' });
      }
      setMessages(prev => [...prev, { role: 'agent', content: '✅ Ticket marked as Resolved.', ts: Date.now() }]);
      setShowResolveFooter(false);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'agent', content: '❌ Could not mark the ticket as resolved. Please try again or request human support.', ts: Date.now() }]);
    }
  };

  // Start New Chat: resolve pending ticket, clear active binding, set no-ticket mode
  const handleStartNewChat = async () => {
    const currentId = (ticketData as any)?.ticketId || sessionActiveTicketId;
    if (!uid || !sessionId) return;
    try {
      if (currentId) {
        try {
          // Resolve only if pending
          const tRef = doc(db, 'Support_Tickets', currentId);
          // Lightweight update; server will enforce ownership
          await updateDoc(tRef, { status: 'Resolved', manuallyUnbound: true, updatedAt: serverTimestamp() });
        } catch {}
        // Clear session binding
        await updateDoc(doc(db, 'chat_sessions', sessionId), { activeTicketId: deleteField(), updatedAt: serverTimestamp() });
        lastUnboundTicketIdRef.current = currentId;
      }
      setSessionActiveTicketId(null);
      setTicketData(null);
      setNoTicketMode(true);
      hasEscalatedRef.current = false;
      troubleshootingAttemptsRef.current = 0;
      // System message
      setMessages(prev => [...prev, { role: 'agent', content: 'Starting a new conversation. Your previous ticket has been marked as resolved.', ts: Date.now() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'agent', content: 'Could not start a new chat right now. Please try again.', ts: Date.now() }]);
    }
  };

  // If not authenticated, show sign-in prompt
  if (!isAuthenticated) {
    return (
      <section className="glass-surface rounded-2xl">
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
    <section className="glass-surface rounded-2xl">
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
                <div className={`h-2 w-2 rounded-full ${claimed ? 'bg-emerald-500' : hasSupportRequest ? 'bg-amber-500' : 'bg-gray-400'}`} />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {claimed ? 'Human support connected' : hasSupportRequest ? 'Human support requested' : 'AI Assistant active'}
                </span>
                {claimed && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200/70 dark:border-gray-600/60">
                    AI responses are disabled while human support is connected
                  </span>
                )}
                {!hasSupportRequest && (
                  <button onClick={requestHuman} className="text-xs px-2 py-1 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-900/20 dark:text-teal-300 dark:hover:bg-teal-900/40 transition-colors">
                    Request human
                  </button>
                )}
                {hasSupportRequest && (
                  <button onClick={requestHuman} className="text-xs px-2 py-1 rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40 transition-colors">
                    Cancel request
                  </button>
                )}
              </div>
              {/* Active Ticket header */}
              {!noTicketMode && (ticketData as any)?.ticketId && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 border border-blue-200/70 dark:border-blue-700/50">
                    <span>💼</span>
                    <span>
                      Active Ticket: {(ticketData as any)?.subject || 'Ticket'}
                      {(() => { const id = (ticketData as any)?.ticketId as string | undefined; return id ? ` (Ticket #${(ticketData as any)?.ticketNumber || id.slice(-6).toUpperCase()})` : '' })()}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/dashboard/user/support-tickets'; }}
                    className="text-xs px-2 py-1 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                  >
                    Change Ticket
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmNewChatOpen(true)}
                    className="text-xs px-2 py-1 rounded-md bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-200"
                  >
                    Start New Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat Messages Area (single container; inner scroller is transparent) */}
      <div className="px-4 sm:px-6">
        {/* Confirm Start New Chat Modal */}
        {confirmNewChatOpen && (ticketData as any)?.ticketId && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl p-5">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Start a New Chat?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Your current ticket will be cancelled and the conversation will start fresh.</p>
              <div className="bg-gray-50 dark:bg-gray-900/30 rounded-lg p-3 mb-4 text-sm text-gray-800 dark:text-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">{(ticketData as any)?.ticketNumber || ((ticketData as any)?.ticketId as string).slice(-6).toUpperCase()}</span>
                  <span className="font-medium">{(ticketData as any)?.subject || 'Ticket'}</span>
                </div>
                <div className="text-xs opacity-80">
                  <div>Status: {(ticketData as any)?.status || 'Pending'}</div>
                  {(ticketData as any)?.createdAt && <div>Created: {typeof (ticketData as any).createdAt?.toDate === 'function' ? (ticketData as any).createdAt.toDate().toLocaleString() : ''}</div>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmNewChatOpen(false)}
                  className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                >
                  Keep Current Chat
                </button>
                <button
                  type="button"
                  onClick={async () => { setConfirmNewChatOpen(false); await handleStartNewChat(); }}
                  className="px-3 py-2 text-sm rounded-md bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Cancel Ticket and Start
                </button>
              </div>
            </div>
          </div>
        )}
        <div
          ref={scrollRef}
          className="h-[calc(100vh-300px)] md:h-[calc(100vh-320px)] overflow-y-auto overscroll-y-contain py-4 pb-4 space-y-4 bg-transparent"
          onWheel={(e) => { e.stopPropagation(); }}
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'auto' as React.CSSProperties['touchAction'] }}
        >
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-500"></div>
              <span className="ml-2 text-sm text-gray-500">Loading conversation…</span>
            </div>
          )}
          {!loading && messages.length === 0 && !hasInitialized.current && (
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
              ) : hasSupportRequest ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Human Support Requested</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Your request for human support is pending. An agent will connect with you shortly.</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">You can continue chatting with me in the meantime, or cancel your request using the button above.</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Initializing Smart Home Assistant...</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Please wait while I prepare to assist you.</p>
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
              const containerClass = isUser ? 'flex items-center justify-end' : 'flex items-center justify-start';
              let bubbleClass = '';
              if (isUser) {
                bubbleClass = 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg';
              } else {
                bubbleClass = 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 shadow-md';
                agentCount += 1;
              }
              return (
                <div key={m.id || `${m.ts}-${m.role}-${(m.content||'').slice(0,8)}`} className={`${containerClass} ${roleChanged ? 'mt-4' : 'mt-2'} ${isUser ? 'gap-0.5' : 'gap-2'}`}>
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
                    <div className={`inline-block max-w-[90vw] sm:max-w-[85%] lg:max-w-[75%] min-w-[96px] sm:min-w-[150px] rounded-2xl px-3 py-1.5 text-sm ${bubbleClass}`}>
                      {m.imageUrl ? (
                        <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block group">
                          <img src={m.imageUrl} alt="uploaded" className={`max-h-64 rounded-md ${isUser ? 'border border-white/20' : 'border border-gray-200 dark:border-gray-600'}`} />
                          {m.content && <div className="mt-1">{m.content}</div>}
                        </a>
                      ) : (
                        <div className="flex items-baseline justify-between gap-1">
                          <div className="whitespace-pre-wrap break-words flex-1 mr-1">{m.content}</div>
                          <div className="text-[10px] opacity-70 whitespace-nowrap flex-shrink-0">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      )}
                      {m.showUnresolvedPrompt && m.unresolvedTicket && (
                        <div className="mt-3 rounded-xl border border-gray-200/80 dark:border-gray-700/60 bg-gradient-to-b from-gray-50 to-gray-50/60 dark:from-gray-900/10 dark:to-gray-900/5 shadow-sm">
                          {/* Header */}
                          <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 sm:pt-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-gray-700 text-white shadow-sm">Unresolved</span>
                            <span className="text-[13px] sm:text-sm font-semibold text-gray-900 dark:text-gray-100">Existing Ticket</span>
                          </div>
                          {/* Ticket card */}
                          <div className="mx-3 sm:mx-4 mt-2 sm:mt-3 mb-3 sm:mb-4 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200/80 dark:border-gray-700/60 p-2.5 sm:p-3">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-600 text-white text-[10px] sm:text-[11px] font-mono shadow-sm break-all">{m.unresolvedTicket.ticketNumber}</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-200 shadow-sm">{m.unresolvedTicket.status}</span>
                            </div>
                            <div className="text-[13px] sm:text-sm font-medium text-gray-900 dark:text-gray-100">{m.unresolvedTicket.subject}</div>
                            <div className="text-[10px] sm:text-[11px] mt-0.5 text-gray-500 dark:text-gray-400">Created: {m.unresolvedTicket.createdAt}</div>
                          </div>
                          {/* Actions */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 sm:px-4 pb-3 sm:pb-4">
                            <button
                              onClick={() => continueWithTicket(m.unresolvedTicket!.id)}
                              className="W-full inline-flex items-center justify-center min-h-[44px] rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white text-[13px] sm:text-sm font-semibold shadow-md hover:from-teal-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60 dark:focus:ring-teal-300/40 transition-all">
                              Continue with this ticket
                            </button>
                            <button
                              onClick={() => unbindTicketStartNew(m.unresolvedTicket!.id)}
                              className="w-full inline-flex items-center justify-center min-h-[44px] rounded-full bg-white/80 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100 text-[13px] sm:text-sm font-semibold border border-gray-200/80 dark:border-gray-700/60 hover:bg-white dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300/60 dark:focus:ring-gray-600/40 transition-all">
                              Start new chat
                            </button>
                          </div>
                        </div>
                      )}
                      {m.showTicketCTA && (
                        <div className="mt-2">
                          {raiseTicketsHref ? (
                            <Link
                              to={raiseTicketsHref}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white text-xs shadow-md hover:from-teal-600 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60 dark:focus:ring-teal-300/40 transition-colors"
                            >
                              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white/20 text-[10px]">🎫</span>
                              <span>Raise a Support Ticket</span>
                            </Link>
                          ) : (
                            <div className="text-xs text-rose-700">
                              Please go to your Dashboard → Support → Raise Ticket to proceed.
                            </div>
                          )}
                        </div>
                      )}
                      {m.showTicketVerification && m.ticketDetails && (
                        <div className="mt-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-sm font-bold">🎫</span>
                            </div>
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100">Ticket Verification</h4>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 mb-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-2 py-1 bg-blue-600 text-white text-xs font-mono rounded">
                                {m.ticketDetails.ticketNumber || `#${m.ticketDetails.ticketId?.slice(-6).toUpperCase()}`}
                              </span>
                              <span className={`px-2 py-1 text-xs rounded ${
                                m.ticketDetails.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                m.ticketDetails.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {m.ticketDetails.status}
                              </span>
                            </div>
                            <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                              <p><strong className="text-gray-900 dark:text-gray-100">Subject:</strong> {m.ticketDetails.subject}</p>
                              <p><strong className="text-gray-900 dark:text-gray-100">Category:</strong> {m.ticketDetails.category}</p>
                              <p><strong className="text-gray-900 dark:text-gray-100">Created:</strong> {m.ticketDetails.createdAt}</p>
                              <p><strong className="text-gray-900 dark:text-gray-100">Issue:</strong> {m.ticketDetails.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleTicketVerification(true)}
                              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                            >
                              ✓ This is correct - Continue
                            </button>
                            <button
                              onClick={() => handleTicketVerification(false)}
                              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"
                            >
                              ✏️ Update ticket details
                            </button>
                          </div>
                        </div>
                      )}
                      {m.deviceInfo && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Device Information
                          </h4>
                          <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                            {m.deviceInfo.deviceName && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Device:</strong> {m.deviceInfo.deviceName}</p>
                            )}
                            {m.deviceInfo.modelNumber && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Model:</strong> {m.deviceInfo.modelNumber}</p>
                            )}
                            {m.deviceInfo.serialNumber && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Serial Number:</strong> <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded text-xs">{m.deviceInfo.serialNumber}</code></p>
                            )}
                            {m.deviceInfo.warrantyExpiry && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Warranty:</strong> Expires {new Date(m.deviceInfo.warrantyExpiry).toLocaleDateString()}</p>
                            )}
                            {m.deviceInfo.documentation && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Documentation:</strong>
                                <a href={m.deviceInfo.documentation} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-300 hover:underline ml-1">
                                  View Manual
                                </a>
                              </p>
                            )}
                            {m.deviceInfo.brand && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Brand:</strong> {m.deviceInfo.brand}</p>
                            )}
                            {m.deviceInfo.description && (
                              <p><strong className="text-blue-900 dark:text-blue-100">Description:</strong> {m.deviceInfo.description}</p>
                            )}
                            <p><strong className="text-blue-900 dark:text-blue-100">Status:</strong>
                              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${m.deviceInfo.isOnline ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'}`}>
                                {m.deviceInfo.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                      {m.showDeviceSelection && m.devices && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                          <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">Select Your Device</h4>
                          <div className="space-y-2">
                            {m.devices.map((device) => (
                              <button
                                key={device.id}
                                onClick={() => handleDeviceSelection(device)}
                                className="w-full text-left p-2 bg-white dark:bg-gray-800 rounded border border-green-200 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                              >
                                <div className="font-medium text-green-900 dark:text-green-100">{device.name}</div>
                                <div className="text-sm text-green-700 dark:text-green-300">
                                  {device.type} {device.model && `- ${device.model}`}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {m.uploading && (
                        <div className="mt-1 text-[10px] opacity-70">Uploading…</div>
                      )}
                      {m.imageUrl && (
                        <div className="mt-0.5 text-[10px] opacity-70">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      )}
                    </div>
                    {/* bubble tail */}
                    {isUser ? (
                      <div className="absolute right-[-1px] top-1/2 -translate-y-1/2 h-2 w-2 bg-teal-500 rotate-45"></div>
                    ) : (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600"></div>
                    )}
                  </div>
                  {isUser && (
                    <div className="relative shrink-0 ml-0">
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
          {/* Invisible div for auto-scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Section at the bottom of the chat */}
      <div className="px-4 pb-4 sm:px-6">
        {showResolveFooter && providedTicketId && (
          <div className="mt-2 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-sm text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
            <span>{confirmInline ? 'Confirm mark this ticket as Resolved?' : 'Is your ticket issue resolved?'}</span>
            <div className="flex items-center gap-2">
              {!confirmInline ? (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmInline(true)}
                    className="px-3 py-1.5 text-sm rounded-md bg-green-600 hover:bg-green-700 text-white"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                    onClick={async () => {
                      await requestHuman();
                      const content = 'I\'ve requested human support. An agent will connect with you shortly.';
                      const ts = Date.now();
                      setMessages(prev => [...prev, { role: 'agent', content, ts }]);
                      try {
                        if (uid && sessionId) {
                          const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
                          await addDoc(msgsCol, { role: 'assistant', content, ts, source: 'system' });
                          await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
                        }
                      } catch {}
                    }}
                  >
                    No
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={async () => { await handleResolveTicket(); setConfirmInline(false); }}
                    className="px-3 py-1.5 text-sm rounded-md bg-green-600 hover:bg-green-700 text-white"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmInline(false)}
                    className="px-3 py-1.5 text-sm rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {/* Removed serial input UI */}
        <form
          className="flex items-center gap-3 mt-4"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          {/* Image upload for human support - available when request is made or claimed */}
          {(claimed || hasSupportRequest) && (
            <div className="flex items-center gap-2" title={`Debug: claimed=${claimed}, hasSupportRequest=${hasSupportRequest}, uid=${uid}, sessionId=${sessionId}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (fileInputRef.current) fileInputRef.current.value = '';
                  if (!file || !uid || !sessionId) {
                    return;
                  }
                  const tempId = Math.random().toString(36).slice(2);
                  setMessages(prev => [...prev, { id: tempId, role: 'user', uploading: true, ts: Date.now() }]);
                  try {
                    const url = await uploadFile(file, `support_chat/${uid}/${sessionId}`);
                    setMessages((prev) => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'user', imageUrl: url, ts: Date.now() }) : m));
                    
                    const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
                    await addDoc(msgsCol, { role: 'user', imageUrl: url, ts: Date.now() });
                  } catch (err: any) {
                    console.error('Chat image upload error:', err);
                    setMessages(prev => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'agent', content: `Image upload failed: ${err.message}`, ts: Date.now() }) : m));
                  }
                }}
              />
              <button
                type="button"
                onClick={() => { fileInputRef.current?.click(); }}
                className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200 shadow-sm border border-blue-200 dark:border-blue-700"
                title="Upload image for human support"
                disabled={!isAuthenticated}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )}
          {/* New chat button */}
          <button
            type="button"
            onClick={startNewChat}
            disabled={!isAuthenticated || isSending || isResetting}
            className="mr-2 inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 shadow-sm border border-gray-200 dark:border-gray-700"
            title="Start a new chat"
          >
            <svg className="h-5 w-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {/* ── Voice: Mute / Unmute TTS button ─── */}
          {voiceSupported && (
            <div className="relative">
              {isSpeaking && !isMuted && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsMuted(!isMuted);
                  if (!isMuted) synthRef.current?.cancel();
                }}
                className={`inline-flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200 shadow-sm border ${
                  isMuted
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700'
                    : 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/50'
                } ${isSpeaking && !isMuted ? 'border-teal-400 dark:border-teal-500 ring-2 ring-teal-500/20' : ''}`}
                title={isMuted ? 'Unmute voice assistant' : 'Mute voice assistant'}
                aria-label={isMuted ? 'Unmute voice assistant' : 'Mute voice assistant'}
                aria-pressed={!isMuted}
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : isSpeaking ? (
                  <AudioLines className="h-5 w-5 animate-pulse" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            </div>
          )}

          {/* ── Voice: Microphone input button ─── */}
          {voiceSupported && (
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={!isAuthenticated || (isMuted && !isListening)}
              className={`inline-flex items-center justify-center h-10 w-10 rounded-full transition-all duration-200 shadow-sm border ${
                isListening
                  ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-700 animate-pulse'
                  : isMuted
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-60'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={isMuted ? 'Voice input disabled while muted' : isListening ? 'Stop listening' : 'Start voice input'}
              aria-label={isMuted ? 'Voice input disabled while muted' : isListening ? 'Stop listening' : 'Start voice input'}
              aria-pressed={isListening}
            >
              {isMuted && !isListening ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          )}
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={claimed ? 'Type your message…' : 'Ask me anything about your smart home...'}
              className="w-full pill-input pl-4 pr-14 py-3.5 sm:py-4"
              disabled={!isAuthenticated}
            />
            {/* Send inside input with right arrow */}
            <button
              type="submit"
              disabled={!input.trim() || !isAuthenticated || isSending}
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