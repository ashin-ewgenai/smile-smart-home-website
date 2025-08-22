// Admin guard and notifications logic extracted from notifications.astro

document.addEventListener('DOMContentLoaded', () => {
  const userEmail = localStorage.getItem('userEmail');
  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'admin';
  if (!userEmail || !isAdmin) {
    window.location.href = '/admin_login';
    return;
  }

  const rows = document.getElementById('rows');
  const empty = document.getElementById('emptyState');
  const summary = document.getElementById('summary');

  type Priority = 'High' | 'Normal' | 'Low' | string;
  type Status = 'new' | 'ack' | 'done' | string;
  interface ServiceRequest {
    id?: string;
    createdAt?: Date | string | number;
    created_at?: Date | string | number;
    ts?: Date | string | number;
    preferredDate?: string;
    preferred_date?: string;
    preferredTime?: string;
    preferred_time?: string;
    priority?: Priority;
    status?: Status;
    userEmail?: string;
    email?: string;
    userName?: string;
    displayName?: string;
    service?: string;
    type?: string;
    device?: string;
    userId?: string;
    uid?: string;
    user?: string; // for some local fallbacks
  }

  function fmt(ts: Date | string | number | undefined | null): string {
    try {
      if (!ts) return '';
      const d = ts instanceof Date ? ts : new Date(ts);
      return d.toLocaleString();
    } catch { return ''; }
  }

  /**
   * @typedef {Object} ServiceRequest
   * @property {string} [id]
   * @property {Date|string|number} [createdAt]
   * @property {Date|string|number} [created_at]
   * @property {Date|string|number} [ts]
   * @property {string} [preferredDate]
   * @property {string} [preferred_date]
   * @property {string} [preferredTime]
   * @property {string} [preferred_time]
   * @property {"High"|"Normal"|"Low"|string} [priority]
   * @property {"new"|"ack"|"done"|string} [status]
   * @property {string} [userEmail]
   * @property {string} [email]
   * @property {string} [userName]
   * @property {string} [displayName]
   * @property {string} [service]
   * @property {string} [type]
   * @property {string} [device]
   * @property {string} [userId]
   * @property {string} [uid]
   */
  function render(list: ServiceRequest[]): void {
    if (!rows) return;
    if (!list || list.length === 0) 
    {
      (rows as HTMLElement).innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      if (summary) (summary as HTMLElement).textContent = '';
      return;
    }
    if (empty) empty.classList.add('hidden');
    (rows as HTMLElement).innerHTML = list.map((item: ServiceRequest) => {
      const id = item.id || '';
      const createdAt = item.createdAt || item.created_at || item.ts || null;
      const preferredDate = item.preferredDate || item.preferred_date || '';
      const preferredTime = item.preferredTime || item.preferred_time || '';
      const priority = item.priority || 'Normal';
      const status = item.status || 'new';
      const email = item.userEmail || item.email || item.user || '';
      const name = item.userName || item.displayName || '';
      const user = name ? `${name} (${email || '—'})` : (email || 'Unknown');
      const service = item.service || item.type || '-';
      const device = item.device || '-';
      return `
          <tr data-id="${id}">
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">${fmt(createdAt)}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${user}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${service}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${device}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">${preferredDate} ${preferredTime}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm">
              <span class="px-2 py-0.5 rounded text-white ${priority.toLowerCase()==='high'?'bg-red-600':priority.toLowerCase()==='low'?'bg-gray-500':'bg-amber-600'}">${priority}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm">
              <span class="px-2 py-0.5 rounded ${status==='done'?'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300':status==='ack'?'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300':'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}">${status}</span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-right text-sm">
              <button data-action="ack" class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 mr-2 hover:bg-gray-100 dark:hover:bg-gray-700">Acknowledge</button>
              <button data-action="done" class="px-2 py-1 rounded bg-teal-600 text-white hover:bg-teal-700">Mark Done</button>
            </td>
          </tr>
        `;
    }).join('');
    if (summary) {
      const newCount = list.filter((x: ServiceRequest) => (x.status||'new') === 'new').length;
      (summary as HTMLElement).textContent = `${list.length} requests • ${newCount} new`;
    }
  }

  // Data sources: Firestore (preferred) and a fallback localStorage key if present.
  const localKeyCandidates = ['serviceRequests', 'smile-service-requests'];

  let unsubscribe: null | (() => void) = null;
  // simple in-memory cache of users by uid
  const userCache = new Map<string, { displayName: string; email: string } | null>();

  /**
   * @param {ServiceRequest[]} list
   */
  async function enrichWithUsers(list: ServiceRequest[], db: any, fs: any): Promise<ServiceRequest[]> {
    try {
      const { doc, getDoc, getDocs, where, collection, query } = fs;
      const uniqueUids = Array.from(new Set(list.map((x: ServiceRequest) => x.userId || x.uid).filter(Boolean)));
      const fetches: Promise<void>[] = [];
      for (const uid of uniqueUids as string[]) {
        if (!userCache.has(uid)) {
          fetches.push((async () => {
            try {
              const snap = await getDoc(doc(db, 'users', uid));
              if (snap.exists()) {
                const data = snap.data();
                userCache.set(uid, { displayName: data.displayName || data.name || '', email: data.email || '' });
              } else {
                userCache.set(uid, null);
              }
            } catch { userCache.set(uid, null); }
          })());
        }
      }
      // Lookup by email for records missing uid
      const emailsNeedingLookup = Array.from(new Set(list
        .filter((x: ServiceRequest) => !(x.userId || x.uid) && (x.userEmail || x.email))
        .map((x: ServiceRequest) => (x.userEmail || x.email))
        .filter(Boolean))) as string[];
      const emailCache = new Map<string, { displayName: string; email: string } | null>();
      for (const email of emailsNeedingLookup) {
        if (!emailCache.has(email)) {
          fetches.push((async () => {
            try {
              const q = query(collection(db, 'users'), where('email', '==', email));
              const snaps = await getDocs(q);
              const docSnap = snaps.docs[0];
              if (docSnap) {
                const data = docSnap.data();
                emailCache.set(email, { displayName: data.displayName || data.name || '', email: data.email || '' });
              } else {
                emailCache.set(email, null);
              }
            } catch { emailCache.set(email, null); }
          })());
        }
      }
      if (fetches.length) await Promise.all(fetches);
      return list.map((x: ServiceRequest) => {
        const uid = x.userId || x.uid as string | undefined;
        const cached = uid ? userCache.get(uid) : null;
        const email = x.userEmail || x.email || '';
        const cachedByEmail = (!uid && email) ? emailCache.get(email) : null;
        return {
          ...x,
          userName: x.userName || x.displayName || (cached?.displayName || cachedByEmail?.displayName || ''),
          userEmail: x.userEmail || x.email || (cached?.email || cachedByEmail?.email || x.userEmail || x.email || ''),
        };
      });
    } catch {
      return list;
    }
  }

  (async () => {
    try {
      const [{ db }, { collection, query, orderBy, onSnapshot, updateDoc, doc, getDoc, getDocs, where } ] = await Promise.all([
        import('../../../lib/firebase'),
        import('firebase/firestore')
      ]);

      const q = query(collection(db, 'service_requests'), orderBy('createdAt', 'desc'));
      unsubscribe = onSnapshot(q, async (snap) => {
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const list = await enrichWithUsers(raw, db, { doc, getDoc, getDocs, where, collection, query });
        render(list);
      }, (err) => {
        console.warn('Firestore listener failed:', err instanceof Error ? err.message : String(err));
        tryLocal();
      });

      // Handle action buttons (ack/done)
      document.addEventListener('click', async (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!(target instanceof HTMLElement)) return;
        const btn = target.closest('button');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (!action) return;
        const tr = btn.closest('tr');
        const id = tr?.getAttribute('data-id');
        if (!id) return;
        try {
          await updateDoc(doc(db, 'service_requests', id), { status: action === 'ack' ? 'ack' : 'done' });
        } catch (err) {
          console.warn('Update failed:', err instanceof Error ? err.message : String(err));
        }
      });
    } catch (e) {
      // If Firebase isn't configured, fallback to localStorage to avoid breaking the page
      tryLocal();
    }
  })();

  function tryLocal() {
    for (const key of localKeyCandidates) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            render(arr);
            return;
          }
        }
      } catch {}
    }
    render([]);
  }

  // Cleanup on navigation
  window.addEventListener('beforeunload', () => { if (typeof unsubscribe === 'function') unsubscribe(); });
});
