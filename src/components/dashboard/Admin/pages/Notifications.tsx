import React, { useEffect, useMemo, useState } from 'react';
import { db } from '../../../../lib/firebase';
import { query, orderBy, onSnapshot, updateDoc, getDoc, getDocs, where, collectionGroup } from 'firebase/firestore';
import { 
  serviceRequestsCollection, 
  serviceRequestDoc, 
  usersCollection, 
  userDoc,
  contactMessagesCollection,
  plannerLeadsCollection,
  COLLECTION_QUOTES_ROOT,
  SUBCOLLECTION_QUOTE
} from '../../../../models/Collections';
import { showToast } from '../../../../lib/toast';

type Priority = 'High' | 'Normal' | 'Low' | string;
type Status = 'new' | 'ack' | 'done' | string;
type NotificationType = 'service_request' | 'quote_request' | 'contact_message' | 'plan_lead';

type UnifiedNotification = {
  id?: string;
  type: NotificationType;
  createdAt?: Date | string | number;
  created_at?: Date | string | number;
  ts?: Date | string | number;
  
  // Service Request fields
  preferredDate?: string;
  preferred_date?: string;
  preferredTime?: string;
  preferred_time?: string;
  priority?: Priority;
  status?: Status;
  service?: string;
  device?: string;
  
  // Common user fields
  userEmail?: string;
  email?: string;
  userName?: string;
  displayName?: string;
  userId?: string;
  uid?: string;
  user?: string;
  
  // Contact Message fields
  name?: string;
  phone?: string;
  message?: string;
  
  // Quote Request fields
  location?: string;
  sqft?: number;
  area?: string;
  details?: string;
  
  // Plan Lead fields
  [key: string]: any;
};

const fmt = (ts?: Date | string | number | null) => {
  try {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    return d.toLocaleString();
  } catch {
    return '';
  }
};

const Notifications: React.FC = () => {
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<NotificationType | 'all'>('all');

  // cache user lookups
  const userCache = useMemo(() => new Map<string, { displayName: string; email: string } | null>(), []);

  useEffect(() => {
    let unsub: undefined | (() => void);
    const localKeyCandidates = ['serviceRequests', 'smile-service-requests', 'service_requests'];

    const tryLocal = () => {
      for (const key of localKeyCandidates) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) {
              setItems(arr);
              showToast('Loaded local requests.', 'info');
              setLoaded(true);
              return;
            }
          }
        } catch {}
      }
      setItems([]);
      showToast('No requests found.', 'info');
      setLoaded(true);
    };

    const enrichWithUsers = async (list: UnifiedNotification[]): Promise<UnifiedNotification[]> => {
      try {
        const uniqueUids = Array.from(new Set(list.map((x) => x.userId || x.uid).filter(Boolean))) as string[];
        const fetches: Promise<void>[] = [];
        for (const uid of uniqueUids) {
          if (!userCache.has(uid)) {
            fetches.push((async () => {
              try {
                const snap = await getDoc(userDoc(db, uid));
                if (snap.exists()) {
                  const data: any = snap.data();
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
          .filter((x) => !(x.userId || x.uid) && (x.userEmail || x.email))
          .map((x) => (x.userEmail || x.email))
          .filter(Boolean))) as string[];
        const emailCache = new Map<string, { displayName: string; email: string } | null>();
        for (const email of emailsNeedingLookup) {
          if (!emailCache.has(email)) {
            fetches.push((async () => {
              try {
                const q = query(usersCollection(db), where('email', '==', email));
                const snaps = await getDocs(q);
                const docSnap = snaps.docs[0];
                if (docSnap) {
                  const data: any = docSnap.data();
                  emailCache.set(email, { displayName: data.displayName || data.name || '', email: data.email || '' });
                } else {
                  emailCache.set(email, null);
                }
              } catch { emailCache.set(email, null); }
            })());
          }
        }
        if (fetches.length) await Promise.all(fetches);
        return list.map((x) => {
          const uid = (x.userId || x.uid) as string | undefined;
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
    };

    (async () => {
      try {
        // Fetch all notification types
        const [serviceRequestsSnap, contactMessagesSnap, plannerLeadsSnap, quotesSnap] = await Promise.all([
          getDocs(query(serviceRequestsCollection(db), orderBy('createdAt', 'desc'))),
          getDocs(query(contactMessagesCollection(db), orderBy('createdAt', 'desc'))),
          getDocs(query(plannerLeadsCollection(db), orderBy('createdAt', 'desc'))),
          getDocs(query(collectionGroup(db, SUBCOLLECTION_QUOTE), orderBy('createdAt', 'desc')))
        ]);
        
        const allNotifications: UnifiedNotification[] = [
          // Service Requests
          ...serviceRequestsSnap.docs.map(d => ({
            id: d.id,
            type: 'service_request' as NotificationType,
            ...d.data()
          })),
          // Contact Messages
          ...contactMessagesSnap.docs.map(d => ({
            id: d.id,
            type: 'contact_message' as NotificationType,
            ...d.data()
          })),
          // Plan Leads
          ...plannerLeadsSnap.docs.map(d => ({
            id: d.id,
            type: 'plan_lead' as NotificationType,
            ...d.data()
          })),
          // Quote Requests
          ...quotesSnap.docs.map(d => ({
            id: d.id,
            type: 'quote_request' as NotificationType,
            ...d.data()
          }))
        ];
        
        // Sort by creation date
        allNotifications.sort((a, b) => {
          const aTime = a.createdAt || a.created_at || a.ts || 0;
          const bTime = b.createdAt || b.created_at || b.ts || 0;
          return new Date(bTime as any).getTime() - new Date(aTime as any).getTime();
        });
        
        const enrichedList = await enrichWithUsers(allNotifications);
        setItems(enrichedList);
        setLoaded(true);
        
        // Cache for offline use
        try { localStorage.setItem('unified_notifications', JSON.stringify(enrichedList)); } catch {}
      } catch (e) {
        console.warn('Failed to load notifications:', e);
        showToast('Using local data (no Firebase config).', 'warn');
        tryLocal();
      }
    })();

    return () => { if (typeof unsub === 'function') unsub(); };
  }, [db, userCache]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter(item => item.type === filter);
  }, [items, filter]);
  
  const summary = useMemo(() => {
    const newCount = filteredItems.filter((x) => {
      if (x.type === 'service_request') return (x.status || 'new') === 'new';
      // For other types, consider them "new" if created in last 7 days
      const createdAt = x.createdAt || x.created_at || x.ts;
      if (!createdAt) return false;
      const created = new Date(createdAt as any);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return created > weekAgo;
    }).length;
    return `${filteredItems.length} notifications • ${newCount} new`;
  }, [filteredItems]);

  const handleUpdate = async (id: string, action: 'ack' | 'done') => {
    try {
      await updateDoc(serviceRequestDoc(db, id), { status: action === 'ack' ? 'ack' : 'done' });
      showToast(action === 'ack' ? 'Request acknowledged' : 'Request marked done', 'success');
    } catch {
      showToast('Update failed. Please retry.', 'error');
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'service_request': return '🔧';
      case 'quote_request': return '💰';
      case 'contact_message': return '📧';
      case 'plan_lead': return '📋';
      default: return '🔔';
    }
  };
  
  const getNotificationTitle = (item: UnifiedNotification) => {
    switch (item.type) {
      case 'service_request': return `Service Request: ${item.service || 'Unknown'}`;
      case 'quote_request': return `Quote Request: ${item.location || 'Unknown Location'}`;
      case 'contact_message': return `Contact Message from ${item.name || 'Unknown'}`;
      case 'plan_lead': return 'New Plan Lead';
      default: return 'Notification';
    }
  };
  
  const getNotificationDescription = (item: UnifiedNotification) => {
    switch (item.type) {
      case 'service_request': return `Device: ${item.device || 'N/A'} | Priority: ${item.priority || 'Normal'}`;
      case 'quote_request': return `Area: ${item.area || 'N/A'} | Size: ${item.sqft || 'N/A'} sqft`;
      case 'contact_message': return `Service: ${item.service || 'N/A'} | Phone: ${item.phone || 'N/A'}`;
      case 'plan_lead': return 'New planning consultation request';
      default: return '';
    }
  };

  return (
    <section className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-white">Notifications</h1>
        <span className="text-sm text-gray-400">{loaded && filteredItems.length ? summary : ''}</span>
      </div>
      
      {/* Filter Tabs */}
      <div className="mb-6">
        <div className="flex space-x-1 bg-gray-800/50 p-1 rounded-lg">
          {(['all', 'service_request', 'quote_request', 'contact_message', 'plan_lead'] as const).map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                filter === filterType
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {filterType === 'all' ? 'All' : 
               filterType === 'service_request' ? 'Service Requests' :
               filterType === 'quote_request' ? 'Quote Requests' :
               filterType === 'contact_message' ? 'Contact Messages' :
               'Plan Leads'}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading…</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">
          {filter === 'all' ? 'No notifications yet.' : `No ${filter.replace('_', ' ')} notifications.`}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const id = item.id || '';
            const createdAt = item.createdAt || item.created_at || item.ts || null;
            const email = item.userEmail || item.email || item.user || '';
            const name = item.userName || item.displayName || item.name || '';
            const user = name ? `${name}` : (email || 'Unknown User');
            const userEmail = email || 'No email';
            
            return (
              <div key={id} className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 hover:bg-gray-900/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl">{getNotificationIcon(item.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{getNotificationTitle(item)}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.type === 'service_request' ? 'bg-blue-900/30 text-blue-300' :
                          item.type === 'quote_request' ? 'bg-green-900/30 text-green-300' :
                          item.type === 'contact_message' ? 'bg-purple-900/30 text-purple-300' :
                          'bg-orange-900/30 text-orange-300'
                        }`}>
                          {item.type.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-gray-400 mb-2">{getNotificationDescription(item)}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>👤 {user}</span>
                        <span>📧 {userEmail}</span>
                        <span>🕒 {fmt(createdAt)}</span>
                      </div>
                      {item.message && (
                        <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
                          <p className="text-gray-300 text-sm">{item.message}</p>
                        </div>
                      )}
                      {item.details && (
                        <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
                          <p className="text-gray-300 text-sm">{item.details}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {item.type === 'service_request' && (
                      <>
                        {item.priority && (
                          <span className={`px-2 py-1 text-xs rounded text-white ${
                            String(item.priority).toLowerCase() === 'high' ? 'bg-red-600' :
                            String(item.priority).toLowerCase() === 'low' ? 'bg-gray-500' :
                            'bg-amber-600'
                          }`}>
                            {item.priority}
                          </span>
                        )}
                        {item.status && (
                          <span className={`px-2 py-1 text-xs rounded ${
                            item.status === 'done' ? 'bg-green-900/30 text-green-300' :
                            item.status === 'ack' ? 'bg-blue-900/30 text-blue-300' :
                            'bg-gray-800 text-gray-200'
                          }`}>
                            {item.status}
                          </span>
                        )}
                        <div className="flex space-x-2">
                          <button 
                            onClick={() => id && handleUpdate(id, 'ack')} 
                            className="px-3 py-1 text-xs rounded border border-gray-600 hover:bg-gray-700 text-gray-300"
                          >
                            Acknowledge
                          </button>
                          <button 
                            onClick={() => id && handleUpdate(id, 'done')} 
                            className="px-3 py-1 text-xs rounded bg-teal-600 text-white hover:bg-teal-700"
                          >
                            Mark Done
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default Notifications;
