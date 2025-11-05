import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { auth, db, functions, storage } from '../../lib/firebase';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, limit, updateDoc, deleteField, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
// Removed unused triageChat import - functionality integrated into chatWithOpenAI

interface SupportChatPanelProps {
  ticketId?: string; // if undefined, chat will prompt user to raise a ticket first (bot mode)
  raiseTicketsHref?: string; // optional link target for the "Raise Tickets" page
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
  };
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
  const [awaitingModel, setAwaitingModel] = useState<boolean>(false);
  const [confirmInline, setConfirmInline] = useState(false);
  const [showResolveFooter, setShowResolveFooter] = useState(false);
  
  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const msgsUnsubRef = useRef<null | (() => void)>(null);
  // File input for image sharing with human agents only (no OCR)
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
  };

  // Offline mode removed: Support Chat requires full Firebase Auth

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      const u = user?.uid || null;
      setUid(u);
      setIsAuthenticated(!!u);
    });
    return () => unsubAuth();
  }, []);

  // Anonymous sign-in bridge removed: require full Firebase Auth session

  // Read support availability (informational only)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'support_status', 'global'), (snap) => {
      setStatusOnline(Boolean(snap.data()?.online));
    });
    return () => unsub();
  }, []);

  // Check if user has any support request or active support
  const [hasSupportDocument, setHasSupportDocument] = useState(false);
  const [hasSupportRequest, setHasSupportRequest] = useState(false);

  // Read per-user claim. If claimed, AI must be disabled and messages go to Firestore live chat
  useEffect(() => {
    if (!uid) {
      setClaimed(false);
      setHasSupportDocument(false);
      setHasSupportRequest(false);
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
            content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• Or raise a new support ticket using the button below',
            showTicketCTA: true,
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
            const errorMsg: ChatMsg = {
              role: 'agent',
              content: 'Ticket not found. Please check the ticket ID or create a new support ticket.',
              showTicketCTA: true,
              ts: Date.now(),
            };
            setMessages([errorMsg]);
            hasInitialized.current = true; // Set after messages are added
            return;
          }
          
          const ticketData = ticketDoc.data();
          if (ticketData?.uid !== uid) {
            setTicketData(null);
            const errorMsg: ChatMsg = {
              role: 'agent',
              content: 'Access denied. This ticket does not belong to your account.',
              ts: Date.now(),
            };
            setMessages([errorMsg]);
            hasInitialized.current = true; // Set after messages are added
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
            content: '👋 Hello! I\'m your Smart Home Support Assistant.\n\nHere\'s how I can help:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• Or raise a new support ticket using the button below',
            showTicketCTA: true,
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
                await addDoc(msgsCol, { role: 'assistant', content: combined.content, ts: Date.now(), source: 'system', showTicketCTA: true });
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
          content: '⚠️ I\'m having trouble accessing your ticket information right now, but I can still help you!\n\n💬 How can I assist you today? You can:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• Create a new support ticket if needed\n\nJust type your question and I\'ll be happy to help!',
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
    // Load any previously bound active ticket
    try {
      const sdata = (await getDoc(sessionRef)).data();
      setSessionActiveTicketId((sdata?.activeTicketId as string) || null);
      if (!sdata?.activeTicketId) setNoTicketMode(false);
    } catch {}
    const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
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
      setMessages(list);

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

  const send = async () => {
    const content = input.trim();
    if (!content || isSending) return;
    setInput('');
    setIsSending(true);

    if (awaitingModel) {
      try {
        if (!uid) { setIsSending(false); return; }
        const modelInput = content.toLowerCase();
        const devicesSnap = await getDocs(query(collection(db, 'User_Devices'), where('uid', '==', uid)));
        const devices = devicesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const match = devices.find((d: any) => {
          const candidates = [d.deviceModel, d.model, d.modelNumber].filter(Boolean).map((x: string) => String(x).toLowerCase());
          return candidates.includes(modelInput);
        });
        setMessages((prev) => [...prev, { role: 'user', content, ts: Date.now() - 1 }]);
        if (!match) {
          const failMsg: ChatMsg = { role: 'assistant', content: 'I could not find a device with that model number in your account. Please check and enter the exact model number printed on the device or packaging.', ts: Date.now() };
          setMessages((prev) => [...prev, failMsg]);
          setIsSending(false);
          return;
        }
        setAwaitingModel(false);
        const verified: Device = {
          id: match.id,
          name: (match.deviceName || match.name || 'Device') as string,
          type: (match.deviceType || match.type || 'Device') as string,
          model: (match.deviceModel || match.model || match.modelNumber || '') as string,
          serial: (match.deviceSerial || match.serial || '') as string,
        };
        setSelectedDevice(verified);
        // Derive warranty expiry if present on document
        let warrantyExpiry: string | undefined = undefined;
        try {
          const w = (match.warrantyExpiry || match.warrantyEnd || match.warrantyExpiryDate || match.warrantyEndDate);
          if (w && typeof w?.toDate === 'function') {
            warrantyExpiry = w.toDate().toISOString();
          } else if (typeof w === 'number' || typeof w === 'string') {
            const ms = typeof w === 'number' ? (w < 1e12 ? w * 1000 : w) : Date.parse(w);
            if (!Number.isNaN(ms)) warrantyExpiry = new Date(ms).toISOString();
          }
        } catch {}

        // Show device info including warranty
        const infoMsg: ChatMsg = {
          role: 'assistant',
          content: `Model verified (${verified.model}). I fetched your device details and warranty info below.`,
          deviceInfo: {
            deviceName: verified.name,
            modelNumber: verified.model,
            serialNumber: verified.serial,
            warrantyExpiry,
            type: verified.type,
          },
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, infoMsg]);

        // Check for existing unresolved ticket linked to this device
        try {
          const unresolvedSnap = await getDocs(query(
            collection(db, 'Support_Tickets'),
            where('uid', '==', uid),
            where('deviceId', '==', verified.id),
            orderBy('createdAt', 'desc'),
            limit(1)
          ));
          const t = unresolvedSnap.docs[0]?.data() as any;
          const tId = unresolvedSnap.docs[0]?.id as string | undefined;
          const status = String(t?.status || '').toLowerCase();
          const isActive = ['pending', 'in progress', 'awaiting_user', 'open'].includes(status);
          if (t && tId && isActive) {
            const ticketNumber = t.ticketNumber || `#${tId.slice(-6).toUpperCase()}`;
            const msg: ChatMsg = {
              role: 'assistant',
              content: `I found an existing ticket for this device (${ticketNumber}) with status "${t.status || 'Pending'}". We can continue there if you like.`,
              ts: Date.now() + 1,
            };
            setMessages((prev) => [...prev, msg]);
          }
        } catch {}

        // Follow-up: suggest troubleshooting steps via callable
        const okMsg: ChatMsg = { role: 'assistant', content: `Let me suggest some troubleshooting steps for ${verified.model}…`, ts: Date.now() + 2 };
        setMessages((prev) => [...prev, okMsg]);

        const activeTid = providedTicketId || sessionActiveTicketId || (ticketData as any)?.ticketId || undefined;
        if (activeTid) {
          try {
            const call = httpsCallable(functions, 'suggestTroubleshootingStep');
            const res: any = await call({ ticketId: activeTid, device: { id: verified.id, model: verified.model, type: verified.type } });
            const suggestion: string | undefined = res?.data?.suggestion || res?.data?.message;
            if (suggestion) {
              const assist: ChatMsg = { role: 'assistant', content: suggestion, ts: Date.now() + 1 };
              setMessages((prev) => [...prev, assist]);
              if (uid && sessionId) {
                try {
                  const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
                  await addDoc(msgsCol, { role: 'assistant', content: suggestion, ts: Date.now() + 2, source: 'ai' });
                  await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp() }, { merge: true });
                } catch (_e) {}
              }
            }
          } catch (error) {
            const err = error as any;
            console.error('suggestTroubleshootingStep failed:', err);
            const code: string = String(err?.code || '');
            let message = "I’m having trouble responding right now. Please try again.";
            if (code.includes('resource-exhausted')) {
              message = "You’re sending messages too quickly. Please wait a few seconds and try again.";
            } else if (code.includes('unauthenticated')) {
              message = "Please sign in to continue troubleshooting.";
            }
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: message, ts: Date.now() },
            ]);
          }
        }
        // Ask user if they want to generate a support ticket if none exists for this device
        try {
          const existingForDevice = await getDocs(query(
            collection(db, 'Support_Tickets'),
            where('uid', '==', uid),
            where('deviceId', '==', verified.id),
            orderBy('createdAt', 'desc'),
            limit(1)
          ));
          if (existingForDevice.empty) {
            const askMsg: ChatMsg = { role: 'assistant', content: 'Would you like me to generate a support ticket for this device so our team can follow up?', ts: Date.now() + 3, showTicketCTA: true };
            setMessages((prev) => [...prev, askMsg]);
          }
        } catch {}
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Auto-escalation: if the last assistant message suggested escalation and user consents ("yes", "ok", etc.),
    // automatically create a human support request and confirm in chat.
    try {
      const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && (m.content || '').length > 0);
      const affirmative = /^(yes|yep|yeah|ok|okay|sure|please|do it|go ahead|proceed|confirm)\b/i.test(content);
      const escalationSuggested = lastAssistant && /escalat/i.test(lastAssistant.content || '');
      if (affirmative && escalationSuggested) {
        await requestHuman();
        const confirmMsg: ChatMsg = {
          role: 'agent',
          content: '✅ I\'ve notified our human support. Someone will reach out to you shortly.',
          ts: Date.now(),
        };
        setMessages((prev) => [...prev, { role: 'user', content, ts: Date.now() - 1 }, confirmMsg]);

        // Persist confirmation into chat_sessions if possible
        if (uid && sessionId) {
          try {
            const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
            await addDoc(msgsCol, { role: 'user', content, ts: Date.now() });
            await addDoc(msgsCol, { role: 'assistant', content: confirmMsg.content, ts: Date.now() + 1, source: 'system' });
            await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human_requested' }, { merge: true });
          } catch (e) {}
        }
        setIsSending(false);
        return;
      }
    } catch {}

    // Previously we blocked sending during ticket verification or device selection.
    // Allow sending in all steps to avoid the UI getting stuck if user doesn't click the buttons.

    if (claimed) {
      // Human online: send to Firestore live chat
      if (!uid || !sessionId) { setIsSending(false); return; }
      const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
      await addDoc(msgsCol, { role: 'user', content, ts: Date.now() });
      await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
      setIsSending(false);
      return;
    }

    // If authenticated user, first detect device problem intent and prompt for model number
    const problemIntent = /\b(not working|doesn't work|doesnt work|issue|problem|malfunction|broken|no power|no wifi|disconnect|blinking|beeping|overheating)\b/i.test(content);
    const mentionsDevice = /\b(device|sensor|camera|lock|light|switch|plug|thermostat|router|hub)\b/i.test(content);
    if (!awaitingModel && problemIntent && mentionsDevice) {
      const promptMsg: ChatMsg = { role: 'assistant', content: 'Sorry to hear that. Please provide the exact model number of the device so I can fetch its warranty details and give you the right steps.', ts: Date.now() };
      setMessages((prev) => [...prev, { role: 'user', content, ts: Date.now() - 1 }, promptMsg]);
      setAwaitingModel(true);
      setIsSending(false);
      return;
    }

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
        if (resData?.deviceInfo) {
          const deviceMsg: ChatMsg = {
            role: 'assistant',
            content: reply || '',
            deviceInfo: resData.deviceInfo,
            ts: Date.now(),
          };
          // Backend already persisted the message, but we need to add it locally for immediate display
          // Since backend handles persistence, we'll add it locally for immediate UI update
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
          { role: 'assistant', content: message, ts: Date.now() },
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

  // Removed manual serial verification handling and callable usage


  const handleTicketVerification = async (confirmed: boolean) => {
    if (confirmed) {
      setWorkflowStep('troubleshooting');
      const userMsg: ChatMsg = { role: 'user', content: 'Yes, the ticket details are correct', ts: Date.now() };
      setMessages(prev => [...prev, userMsg, { role: 'assistant', content: 'Please provide the model number of the device you need help with.', ts: Date.now() + 1 }]);
      setAwaitingModel(true);
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

  const requestHuman = async () => {
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
        {showResolveFooter && (
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
                    const path = `support_chat/${uid}/${sessionId}/${Date.now()}_${file.name}`;
                    const ref = storageRef(storage, path);
                    const task = uploadBytesResumable(ref, file, { contentType: file.type });
                    task.on('state_changed', undefined, (error) => {
                      setMessages((prev) => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'agent', content: `Upload failed: ${error?.message || 'unknown error'}`, ts: Date.now() }) : m));
                    }, async () => {
                      const url = await getDownloadURL(task.snapshot.ref);
                      setMessages((prev) => prev.map((m) => m.id === tempId ? ({ id: tempId, role: 'user', imageUrl: url, ts: Date.now() }) : m));
                      try {
                        const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
                        await addDoc(msgsCol, { role: 'user', imageUrl: url, ts: Date.now() });
                      } catch (err) {}
                    });
                  } catch (err) {
                    setMessages(prev => [...prev, { role: 'agent', content: 'Image upload failed. Please try again.', ts: Date.now() }]);
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
