import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db, functions, storage } from '../../lib/firebase';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
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
  ticketDetails?: TicketData;
  devices?: Device[];
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
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [workflowStep, setWorkflowStep] = useState<'initial' | 'ticket_verification' | 'device_selection' | 'troubleshooting'>('initial');
  
  // Ref for auto-scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const msgsUnsubRef = useRef<null | (() => void)>(null);
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

  // Fetch ticket data if ticketId is provided
  useEffect(() => {
    if (!providedTicketId) {
      setTicketData(null);
      return;
    }

    setTicketLoading(true);
    const unsub = onSnapshot(doc(db, 'Support_Tickets', providedTicketId), (snap) => {
      if (snap.exists()) {
        setTicketData(snap.data() as TicketData);
      } else {
        setTicketData(null);
      }
      setTicketLoading(false);
    });

    return () => unsub();
  }, [providedTicketId]);

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
        
        // If specific ticketId provided, analyze that ticket specifically
        if (providedTicketId) {
          console.log(`Analyzing specific ticket: ${providedTicketId}`);
          const ticketDoc = await getDoc(doc(db, 'Support_Tickets', providedTicketId));
          
          if (!ticketDoc.exists()) {
            console.error('Ticket not found:', providedTicketId);
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
            console.error('Ticket does not belong to user');
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
            ticketId: providedTicketId,
            subject: ticketData.subject,
            description: ticketData.description,
            category: ticketData.category,
            status: ticketData.status,
            needsSerial: ticketData.needsSerial,
            initialSolution: ticketData.initialSolution
          });

          const ticketNumber = ticketData.ticketNumber || `#${providedTicketId.slice(-6).toUpperCase()}`;
          
          if (ticketData.initialSolution) {
            // Show existing analysis
            const analysisMsg: ChatMsg = {
              role: 'assistant',
              content: `I found your support ticket ${ticketNumber}. Here's what I can help you with:\n\n${ticketData.initialSolution}`,
              ts: Date.now(),
            };
            setMessages([analysisMsg]);
            hasInitialized.current = true; // Set after messages are added
            
            if (ticketData.needsSerial) {
              const serialMsg: ChatMsg = {
                role: 'assistant',
                content: 'I need to see the serial number on your device to provide more specific help. Can you upload a photo of the serial number?',
                ts: Date.now() + 1,
              };
              setMessages(prev => [...prev, serialMsg]);
            }
          } else {
            // No analysis yet, show verification first
            const verificationMsg: ChatMsg = {
              role: 'assistant',
              content: `I found your active support ticket ${ticketNumber}. Let me verify the details with you first:`,
              showTicketVerification: true,
              ticketDetails: {
                ticketId: providedTicketId,
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
            setMessages([verificationMsg]);
            setWorkflowStep('ticket_verification');
            hasInitialized.current = true; // Set after messages are added
          }
        } else if (messages.length === 0) {
          // Show welcome message first, then check for tickets
          const welcomeMsg: ChatMsg = {
            role: 'assistant',
            content: '👋 Hello! I\'m your Smart Home Support Assistant. I\'m here to help you with any issues or questions about your smart home devices.\n\n🔍 Let me check if you have any active support tickets I can help with...',
            ts: Date.now(),
          };
          setMessages([welcomeMsg]);

          // Check for unresolved tickets after welcome
          console.log('Checking for unresolved tickets');
          const analyzeTicket = httpsCallable(functions, 'analyzeUserUnresolvedTicket');
          const result = await analyzeTicket({});
          const data = result.data as any;

          if (data.status === 'no_unresolved_tickets') {
            setTicketData(null);
            const noTicketMsg: ChatMsg = {
              role: 'assistant',
              content: '✅ Great! You don\'t have any unresolved tickets at the moment.\n\n💬 How can I assist you today? You can:\n• Ask questions about your smart home devices\n• Get troubleshooting help\n• Create a new support ticket if needed\n\nJust type your question and I\'ll be happy to help!',
              showTicketCTA: false,
              ts: Date.now() + 500,
            };
            setMessages(prev => [...prev, noTicketMsg]);
            hasInitialized.current = true; // Set after messages are added
          } else if (data.status === 'analyzed' || data.status === 'already_analyzed') {
            setTicketData({
              ticketId: data.ticketId,
              subject: data.subject,
              needsSerial: data.needsSerial,
              initialSolution: data.initialSolution
            });

            const ticketFoundMsg: ChatMsg = {
              role: 'assistant',
              content: `🎫 I found an active support ticket: "${data.subject}"\n\nHere's what I can help you with:\n\n${data.initialSolution}`,
              ts: Date.now() + 500,
            };
            setMessages(prev => [...prev, ticketFoundMsg]);

            if (data.needsSerial) {
              const serialMsg: ChatMsg = {
                role: 'assistant',
                content: '📷 I need to see the serial number on your device to provide more specific help. Can you upload a photo of the serial number?',
                ts: Date.now() + 1000,
              };
              setMessages(prev => [...prev, serialMsg]);
            }
          }
        }
      } catch (error) {
        console.error('Error analyzing ticket:', error);
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

    // Only run if authenticated and no messages yet
    if (messages.length === 0) {
      fetchAndAnalyzeTicket();
    }
  }, [providedTicketId, uid, isAuthenticated, messages.length]);

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
    // Offline mode removed; unauthenticated users will see sign-in prompt
    // Tear down previous already handled above
    setLoading(true);
    if (!isAuthenticated) {
      // Not authenticated; do not load messages. UI renders sign-in prompt.
      setMessages([]);
      setLoading(false);
      return () => {};
    }
    if (claimed) {
      setupOnline();
    } else {
      // AI mode but authenticated: load from Firestore
      if (uid && sessionId) setupOnline();
    }
    return () => {
      if (msgsUnsubRef.current) {
        try { msgsUnsubRef.current(); } catch {}
        msgsUnsubRef.current = null;
      }
    };
  }, [uid, sessionId, claimed, isAuthenticated]);

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

      // If ticket also needs serial number, add image prompt
      if (ticketData.needsSerial) {
        const imageMsg: ChatMsg = {
          role: 'agent',
          content: 'Please click the image button below to upload a photo of your device showing the serial number.',
          ts: Date.now() + 1,
        };

        setMessages(prev => [...prev, imageMsg]);
      }
    }
    // If no initial solution but needs serial, prompt for image
    else if (ticketData.needsSerial) {
      const promptMsg: ChatMsg = {
        role: 'agent',
        content: 'To better assist you with your issue, we need to verify your device. Please upload a clear photo of your device showing the serial number.',
        ts: Date.now(),
      };

      const imageMsg: ChatMsg = {
        role: 'agent',
        content: 'Please click the image button below to upload a photo of your device showing the serial number.',
        ts: Date.now() + 1,
      };

      setMessages([promptMsg, imageMsg]);
    }
  }, [providedTicketId, ticketData, messages.length]);

  const [isSending, setIsSending] = useState(false);

  const send = async () => {
    const content = input.trim();
    if (!content || isSending) return;
    setInput('');
    setIsSending(true);

    // Skip if we're in a workflow step that doesn't need text input
    if (workflowStep === 'ticket_verification' || workflowStep === 'device_selection') {
      setIsSending(false);
      return;
    }

    if (claimed) {
      // Human online: send to Firestore live chat
      if (!uid || !sessionId) { setIsSending(false); return; }
      const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
      await addDoc(msgsCol, { role: 'user', content, ts: Date.now() });
      await setDoc(doc(db, 'chat_sessions', sessionId), { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
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

        const payload = {
          messages: [
            ...recentMessages,
            { role: 'user', content },
          ],
          sessionId: sessionId, // Use consistent session ID for admin dashboard
          ...(providedTicketId && { ticketId: providedTicketId }), // Include ticket ID if available
        };
        const call = httpsCallable(functions, 'chatWithOpenAI');
        const res = await call(payload);
        const reply = (res?.data as any)?.reply as string | undefined;

        // Handle enhanced workflow responses
        const resData = res?.data as any;

        // Do not write messages on the client in AI mode; backend persists both
        if (resData?.ticketDetails) setWorkflowStep('ticket_verification');
        else if (resData?.deviceSelection) setWorkflowStep('device_selection');
      } catch (error) {
        console.error('Chat error:', error);
        // Let backend handle error messaging or show a lightweight local notice if needed
      } finally {
        setIsSending(false);
      }
      return;
    }

    setIsSending(false);
    // Unauthenticated users cannot send; UI already shows sign-in required

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
      const imageMessage = { id: tempId, role: 'user' as const, imageUrl: url, ts: Date.now() };
      setMessages((prev) => prev.map((m) => m.id === tempId ? imageMessage : m));
      
      // Save image message to Firestore if user is authenticated and we have a session
      if (claimed && uid && sessionId) {
        try {
          const msgsCol = collection(db, 'chat_sessions', sessionId, 'messages');
          await addDoc(msgsCol, { role: 'user', imageUrl: url, ts: Date.now() });
        } catch (error) {
          console.error('Failed to save image message to Firestore:', error);
        }
      }
      
      // Always trigger AI serial extraction and verification if ticket is present
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
          const verifyResult = await verifySerial({ ticketId: activeTicketId, serial });
          const verifyData = verifyResult.data as any;
          if (verifyData?.valid) {
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
    });
  };


  const handleTicketVerification = async (confirmed: boolean) => {
    if (confirmed) {
      setWorkflowStep('device_selection');
      // Send confirmation to chatbot to trigger device selection
      const userMsg: ChatMsg = { 
        role: 'user', 
        content: 'Yes, the ticket details are correct', 
        ts: Date.now() 
      };
      setMessages(prev => [...prev, userMsg]);
      
      // Call chatbot to get device selection response
      try {
        const call = httpsCallable(functions, 'chatWithOpenAI');
        const res = await call({
          messages: messages.concat(userMsg).map(msg => ({
            role: msg.role === 'agent' ? 'assistant' : msg.role,
            content: msg.content || ''
          })),
          sessionId: sessionId
        });
        
        const resData = res?.data as any;
        if (resData?.deviceSelection) {
          const deviceMsg: ChatMsg = {
            role: 'agent',
            content: 'Please select the device you need help with:',
            showDeviceSelection: true,
            devices: resData.deviceSelection.devices,
            ts: Date.now() + 1
          };
          setMessages(prev => [...prev, deviceMsg]);
        }
      } catch (error) {
        console.error('Failed to get device selection:', error);
      }
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
    
    // Check if device needs serial verification
    if (device.serial) {
      const confirmMsg: ChatMsg = {
        role: 'agent',
        content: `Device selected: ${device.name}. I can see this device is registered. How can I help you with it?`,
        ts: Date.now() + 1
      };
      setMessages(prev => [...prev, confirmMsg]);
    } else {
      // Request serial number verification
      const serialMsg: ChatMsg = {
        role: 'assistant',
        content: `Device selected: ${device.name}. To provide accurate troubleshooting, I need to verify your device. Please upload an image of your device showing the serial number.`,
        ts: Date.now() + 1
      };
      setMessages(prev => [...prev, serialMsg]);
      
      const uploadMsg: ChatMsg = {
        role: 'agent',
        content: 'Click the image button below to upload a photo of your device serial number.',
        ts: Date.now() + 2
      };
      setMessages(prev => [...prev, uploadMsg]);
    }
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
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              🎫 Raise a Support Ticket
                            </a>
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
          {/* Invisible div for auto-scrolling */}
          <div ref={messagesEndRef} />
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
            disabled={!isAuthenticated}
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
