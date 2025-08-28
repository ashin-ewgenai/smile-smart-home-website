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
    <div className="w-full h-screen min-h-0 grid grid-rows-[auto,1fr]">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="text-sm text-gray-700 dark:text-gray-200">Support Center</div>
        {/* Global toggle removed per request; routing is per-user claim only */}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] min-h-0">
        <aside className="border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-2 text-xs uppercase text-gray-500">Conversations</div>
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
                    const uidLine = c.ownerUid;
                    const dateLine = c.updatedAt ? new Date(c.updatedAt).toLocaleString() : '';
                    return (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{primary}</div>
                          {requests[c.ownerUid] && (
                            <span className="ml-2 inline-flex items-center justify-center text-[10px] px-1.5 py-0.5 rounded-full bg-rose-600 text-white">Requested</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate">{uidLine}{dateLine ? ` · ${dateLine}` : ''}</div>
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
        <section className="flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-800 dark:text-gray-100 truncate">{selectedOwner ? `Chat with ${ownerLabel}` : 'Select a conversation'}</div>
            <button
              onClick={toggleClaim}
              disabled={!selectedOwner}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border ${claims[selectedOwner || ''] ? 'border-emerald-600 text-emerald-600' : 'border-gray-400 text-gray-700'} hover:bg-gray-100 dark:hover:bg-gray-800`}
            >
              <span className={`h-2 w-2 rounded-full ${claims[selectedOwner || ''] ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {claims[selectedOwner || ''] ? 'Human On' : 'Human Off'}
            </button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50 dark:bg-gray-950">
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
                  bubble = isAI ? 'bg-indigo-600 text-white rounded-br-sm shadow' : 'bg-teal text-white rounded-br-sm shadow';
                } else {
                  const parity = otherCount % 2;
                  bubble = parity === 0
                    ? 'bg-white dark:bg-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-sm shadow'
                    : 'bg-gray-50 dark:bg-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-800 rounded-bl-sm shadow';
                  otherCount += 1;
                }
                return (
                  <div key={m.id || `${m.ts}-${m.role}`}
                    className={`${container} ${roleChanged ? 'mt-4' : 'mt-1'} gap-2`}
                  >
                    {!isAgent && (
                      <div className="h-7 w-7 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-800 dark:text-gray-100 select-none">U</div>
                    )}
                    <div className="relative">
                      <div className={`max-w-[80vw] sm:max-w-[70%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${bubble}`}>
                        {isAI && (
                          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/20 border border-indigo-400/40 text-white mr-2 align-middle">AI</span>
                        )}
                        {m.imageUrl ? (
                          <a href={m.imageUrl} target="_blank" rel="noreferrer" className="block group">
                            <img src={m.imageUrl} alt="uploaded" className={`max-h-64 rounded-md ${isAgent ? (isAI ? 'border border-white/20' : 'border border-white/20') : 'border border-gray-200 dark:border-gray-600'}`} />
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
                        <div className={`absolute -right-1 bottom-2 h-2 w-2 rotate-45 ${isAI ? 'bg-indigo-600' : 'bg-teal'}`}></div>
                      ) : (
                        <div className={`absolute -left-1 bottom-2 h-2 w-2 rotate-45 ${bubble.replace('rounded-bl-sm','').replace('rounded-2xl','')}`}></div>
                      )}
                    </div>
                    {isAgent && (
                      isAI ? (
                        <div className="h-7 w-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] select-none">🤖</div>
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-teal text-white flex items-center justify-center text-[10px] select-none">A</div>
                      )
                    )}
                  </div>
                );
              });
            })()}
          </div>
          <form
            className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); send(); }}
          >
            <input
              type="text"
              className="flex-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-500 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-teal"
              placeholder={selectedOwner ? (claims[selectedOwner] ? 'Type a message…' : 'Toggle Human On to reply') : 'Select a conversation to reply'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!selectedOwner || !claims[selectedOwner]}
            />
            <button
              type="submit"
              disabled={!input.trim() || !selectedOwner || !claims[selectedOwner]}
              className="px-4 py-2 rounded-md bg-teal text-white disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminSupportApp;
