import React, { useEffect, useMemo, useRef, useState } from 'react';
import { auth, db } from '../../../lib/firebase';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';

interface SessionItem { id: string; ownerUid: string; updatedAt?: number; status?: string }
interface Conversation { ownerUid: string; updatedAt?: number }

interface Msg { id?: string; role: 'user' | 'agent' | 'assistant'; content?: string; imageUrl?: string; ts: number; source?: 'user' | 'ai' | 'human'; model?: string; error?: boolean; uploading?: boolean }

const AdminSupportApp: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [ownerLabel, setOwnerLabel] = useState<string>('');
  const [userMeta, setUserMeta] = useState<Record<string, { name?: string; email?: string }>>({});
  const [claims, setClaims] = useState<Record<string, boolean>>({});
  const [requests, setRequests] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const toggleClaim = async () => {
    if (!selectedOwner) return;
    const current = Boolean(claims[selectedOwner]);
    const next = !current;
    const uid = auth.currentUser?.uid || null;
    await setDoc(doc(db, 'support_claims', selectedOwner), {
      online: next,
      claimedAt: Date.now(),
      claimedBy: uid,
    }, { merge: true });
    // When claiming ON, clear request badge
    if (next) {
      await setDoc(doc(db, 'support_requests', selectedOwner), {
        requested: false,
        clearedAt: Date.now(),
        clearedBy: uid,
      }, { merge: true });
    }
  };

  // Build conversations list grouped by ownerUid
  useEffect(() => {
    const qAll = query(collection(db, 'chat_sessions'), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(qAll, (snap) => {
      const agg = new Map<string, number | undefined>();
      snap.forEach((d) => {
        const data = d.data() as any;
        if (!data?.ownerUid) return;
        const ua = data.updatedAt;
        let ms: number | undefined = undefined;
        if (ua && typeof ua === 'object' && typeof ua.toMillis === 'function') ms = ua.toMillis();
        else if (typeof ua === 'number') ms = ua;
        const prev = agg.get(data.ownerUid);
        if (prev == null || (ms != null && ms > prev)) agg.set(data.ownerUid, ms);
      });
      const list: Conversation[] = Array.from(agg.entries()).map(([ownerUid, updatedAt]) => ({ ownerUid, updatedAt }));
      list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      setConversations(list);
      if (!selectedOwner && list.length > 0) setSelectedOwner(list[0].ownerUid);
    });
    return () => unsub();
  }, [selectedOwner]);

  // Watch per-user claims map
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'support_claims'), (snap) => {
      const map: Record<string, boolean> = {};
      snap.forEach((d) => {
        const data = d.data() as any;
        map[d.id] = Boolean(data?.online);
      });
      setClaims(map);
    });
    return () => unsub();
  }, []);

  // Watch support requests to show badge
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'support_requests'), (snap) => {
      const map: Record<string, boolean> = {};
      snap.forEach((d) => {
        const data = d.data() as any;
        map[d.id] = Boolean(data?.requested);
      });
      setRequests(map);
    });
    return () => unsub();
  }, []);

  // Fetch missing user metadata (name/email) for listed conversations
  useEffect(() => {
    const missing = conversations.map((c) => c.ownerUid).filter((uid) => !(uid in userMeta));
    if (missing.length === 0) return;
    missing.forEach(async (uid) => {
      try {
        const acc = await getDoc(doc(db, 'Accounts', uid));
        const data = acc.data() as any;
        const name = data?.FullName || data?.Name || undefined;
        const email = data?.Email || data?.email || undefined;
        setUserMeta((prev) => ({ ...prev, [uid]: { name, email } }));
      } catch {
        setUserMeta((prev) => ({ ...prev, [uid]: {} }));
      }
    });
  }, [conversations, userMeta]);

  // Load full history for selected owner across all sessions (realtime)
  useEffect(() => {
    let sessionUnsub: (() => void) | undefined;
    let msgUnsubs: (() => void)[] = [];
    if (!selectedOwner) { setMsgs([]); setOwnerLabel(''); return; }
    // Watch sessions for this owner
    const qSess = query(collection(db, 'chat_sessions'), where('ownerUid', '==', selectedOwner));
    sessionUnsub = onSnapshot(qSess, (sessSnap) => {
      // Unsubscribe previous message listeners
      msgUnsubs.forEach((u) => u());
      msgUnsubs = [];
      const allMsgs: Msg[] = [];
      const sessionsForOwner: { id: string }[] = [];
      sessSnap.forEach((d) => sessionsForOwner.push({ id: d.id }));
      if (sessionsForOwner.length === 0) { setMsgs([]); return; }
      sessionsForOwner.forEach((s) => {
        const unsub = onSnapshot(query(collection(db, 'chat_sessions', s.id, 'messages'), orderBy('ts', 'asc')), (qSnap) => {
          // Merge messages from this session into allMsgs and refresh sorted view
          const these = qSnap.docs.map((d) => ({ id: `${s.id}:${d.id}`, ...(d.data() as any) })) as Msg[];
          // Replace any messages for this session
          for (let i = allMsgs.length - 1; i >= 0; i--) {
            if ((allMsgs[i].id || '').startsWith(`${s.id}:`)) allMsgs.splice(i, 1);
          }
          allMsgs.push(...these);
          allMsgs.sort((a, b) => (a.ts || 0) - (b.ts || 0));
          setMsgs([...allMsgs]);
          setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 0);
        });
        msgUnsubs.push(unsub);
      });
    });
    // owner label
    (async () => {
      try {
        const acc = await getDoc(doc(db, 'Accounts', selectedOwner));
        const data = acc.data() as any;
        const name = data?.FullName || data?.Name || '';
        const email = data?.Email || data?.email || '';
        setOwnerLabel(name || email || selectedOwner);
      } catch {
        setOwnerLabel(selectedOwner);
      }
    })();
    return () => {
      if (typeof sessionUnsub === 'function') sessionUnsub();
      msgUnsubs.forEach((u) => u());
    };
  }, [selectedOwner]);

  const send = async () => {
    if (!selectedOwner) return;
    if (!claims[selectedOwner]) return; // require Human On
    const text = input.trim();
    if (!text) return;
    setInput('');
    // Use deterministic session id to match the user panel listener
    const sessionId = `live_${selectedOwner}`;
    const sessionRef = doc(db, 'chat_sessions', sessionId);
    const snap = await getDoc(sessionRef);
    if (!snap.exists()) {
      await setDoc(sessionRef, {
        ownerUid: selectedOwner,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'human',
        type: 'live',
      }, { merge: true });
    }
    await addDoc(collection(db, 'chat_sessions', sessionId, 'messages'), {
      role: 'agent',
      content: text,
      ts: Date.now(),
    });
    await setDoc(sessionRef, { updatedAt: serverTimestamp(), status: 'human' }, { merge: true });
  };

  return (
    <section className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6 border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/70">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="relative h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center shadow-md">
              <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Support Center</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`h-2 w-2 rounded-full ${selectedOwner && claims[selectedOwner] ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {selectedOwner ? (claims[selectedOwner] ? 'Human support connected' : 'AI viewing only') : 'Select a conversation'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleClaim}
            disabled={!selectedOwner}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors border ${selectedOwner && claims[selectedOwner] ? 'border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40' : 'border-gray-400 text-gray-700 bg-gray-50 hover:bg-gray-100 dark:text-gray-300 dark:bg-gray-800/40 dark:hover:bg-gray-800/60'}`}
          >
            <span className={`h-2 w-2 rounded-full ${selectedOwner && claims[selectedOwner] ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            {selectedOwner && claims[selectedOwner] ? 'Human On' : 'Human Off'}
          </button>
          
          {/* Admin Clear Chat Button */}
          {selectedOwner && (
            <button
              className="px-3 py-1.5 text-sm rounded-md bg-red-600 hover:bg-red-700 text-white flex items-center gap-1"
              onClick={async () => {
                if (!window.confirm('Are you sure you want to clear ALL chat history for this user? This cannot be undone.')) return;
                try {
                  const { getFunctions, httpsCallable } = await import('firebase/functions');
                  const { firebaseApp } = await import('../../../lib/firebase');
                  const functions = getFunctions(firebaseApp);
                  const clearChat = httpsCallable(functions, 'adminClearUserChat');
                  await clearChat({ uid: selectedOwner });
                  alert('Chat history cleared for this user.');
                  // Refresh messages
                  setMsgs([]);
                } catch (e: any) {
                  console.error('Clear chat error:', e);
                  alert('Failed to clear chat: ' + (e?.message || e?.code || e));
                }
              }}
            >
              🗑️ Clear Chat
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] min-h-0">
        <aside className="border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-900">
          <div className="p-3 text-[11px] uppercase tracking-wide text-gray-500">Conversations</div>
          <ul>
            {conversations.map((c) => (
              <li key={c.ownerUid}>
                <button
                  className={`w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 ${selectedOwner === c.ownerUid ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => setSelectedOwner(c.ownerUid)}
                >
                  {(() => {
                    const meta = userMeta[c.ownerUid] || {};
                    const primary = meta.name || meta.email || c.ownerUid;
                    const uidLine = '';
                    const dateLine = c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '';
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{primary}</div>
                          {requests[c.ownerUid] && (
                            <span className="ml-2 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-rose-600 text-white">Requested</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{dateLine}</div>
                      </>
                    );
                  })()}
                </button>
              </li>
            ))}
            {conversations.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No conversations yet</li>
            )}
          </ul>
        </aside>
        <section className="flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white/60 dark:bg-gray-900/50">
            <div className="text-sm sm:text-base text-gray-800 dark:text-gray-100 truncate">{selectedOwner ? `Chat with ${ownerLabel}` : 'Select a conversation'}</div>
          </div>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4 space-y-3 bg-gradient-to-b from-gray-50/60 to-white dark:from-gray-900/50 dark:to-gray-800 max-h-[70vh]"
            onWheel={(e) => { e.stopPropagation(); }}
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'auto' as React.CSSProperties['touchAction'] }}
          >
            {!selectedOwner && (
              <div className="text-sm text-gray-500">Pick a conversation from the left to view messages.</div>
            )}
            {selectedOwner && msgs.length === 0 && (
              <div className="text-sm text-gray-500">No messages yet.</div>
            )}
            {(() => {
              let otherCount = 0; // for alternating non-agent/user backgrounds
              return msgs.map((m, i) => {
                const prev = i > 0 ? msgs[i - 1] : undefined;
                const roleChanged = !prev || prev.role !== m.role;
                const isAI = m.role === 'assistant' || m.source === 'ai';
                const isAgent = m.role === 'agent' || isAI;
                const container = isAgent ? 'flex items-end justify-end' : 'flex items-end justify-start';
                let bubble = '';
                if (isAgent) {
                  bubble = isAI
                    ? 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg'
                    : 'bg-gradient-to-r from-teal-500 to-blue-500 text-white shadow-lg';
                } else {
                  const parity = otherCount % 2;
                  bubble = parity === 0
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 shadow-md'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 shadow-md';
                  otherCount += 1;
                }
                return (
                  <div key={m.id || `${m.ts}-${m.role}`}
                    className={`${container} ${roleChanged ? 'mt-4' : 'mt-1'} gap-2`}
                  >
                    {!isAgent && (
                      <div className="relative">
                        <div className="relative h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 flex items-center justify-center text-xs text-white font-medium shadow-md">U</div>
                      </div>
                    )}
                    <div className="relative">
                      <div className={`max-w-[80vw] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}>
                        {m.imageUrl ? (
                          <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block group">
                            <img src={m.imageUrl} alt="uploaded" className={`max-h-64 rounded-md ${isAgent ? 'border border-white/20' : 'border border-gray-200 dark:border-gray-600'}`} />
                            {m.content && <div className="mt-1">{m.content}</div>}
                          </a>
                        ) : (
                          <div>{m.content}</div>
                        )}
                        {m.uploading && (
                          <div className="text-[10px] opacity-70 mt-1">Uploading…</div>
                        )}
                        <div className="text-[10px] opacity-70 mt-1">{new Date(m.ts).toLocaleString()}</div>
                      </div>
                      {/* bubble tail */}
                      {isAgent ? (
                        <div className={`absolute -right-1 bottom-2 h-2 w-2 rotate-45 ${isAI ? 'bg-blue-500' : 'bg-blue-500'}`}></div>
                      ) : (
                        <div className={`absolute -left-1 bottom-2 h-2 w-2 rotate-45 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600`}></div>
                      )}
                    </div>
                    {isAgent && (
                      isAI ? (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white flex items-center justify-center select-none">
                          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-white">AI</span>
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white flex items-center justify-center text-xs select-none">A</div>
                      )
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <form
            className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 bg-white/70 dark:bg-gray-900/60"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              type="text"
              className="flex-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 px-3 py-2 rounded-full border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder={selectedOwner ? (claims[selectedOwner] ? 'Type a message…' : 'Toggle Human On to reply') : 'Select a conversation to reply'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!selectedOwner || !claims[selectedOwner]}
            />
            <button
              type="submit"
              disabled={!input.trim() || !selectedOwner || !claims[selectedOwner]}
              className="px-4 py-2 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 text-white disabled:opacity-50 shadow"
            >
              Send
            </button>
          </form>
        </section>
      </div>
      </div>
    </section>
  );
};

export default AdminSupportApp;
