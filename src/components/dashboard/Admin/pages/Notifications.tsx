import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../../lib/firebase';
import { query, orderBy, updateDoc, getDoc, getDocs, where, collectionGroup, onSnapshot, limit, type Timestamp } from 'firebase/firestore';
import { 
  serviceRequestsCollection, 
  serviceRequestDoc, 
  usersCollection, 
  userDoc,
  contactRequestsCollection,
  plannerLeadsCollection,
  plannerLeadDoc,
  SUBCOLLECTION_QUOTE
} from '../../../../models/Collections';
import { showToast } from '../../../../lib/toast';
import { contactRequestDoc, quoteDoc, supportTicketDoc, estimationQuotesCollection, estimationQuoteDoc } from '../../../../models/Collections';

type Priority = 'High' | 'Normal' | 'Low' | string;
type Status = 'new' | 'ack' | 'done' | string;
type NotificationType = 'service_request' | 'quote_request' | 'contact_message' | 'plan_lead' | 'support_ticket' | 'estimation_quote';

type UnifiedNotification = {
  id?: string;
  type: NotificationType;
  createdAt?: Date | string | number | Timestamp | null;
  created_at?: Date | string | number | Timestamp | null;
  ts?: Date | string | number | Timestamp | null;
  adminRead?: boolean;
  // For nested paths
  parentUid?: string; // e.g., quotes/{uid}/Quote_List/{id} or supportTickets/{uid}/ticket/{id}
  
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

const fmt = (ts?: Date | string | number | Timestamp | null) => {
  try {
    if (!ts) return '';
    let d: Date;
    if (typeof (ts as any)?.toDate === 'function') {
      d = (ts as any).toDate();
    } else if (ts instanceof Date) {
      d = ts;
    } else {
      d = new Date(ts as any);
    }
    return d.toLocaleString();
  } catch {
    return '';
  }
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();

  const navigateToItem = (item: UnifiedNotification) => {
    if (!item.id) return;
    
    // Mark as read when clicked
    if (isUnread(item)) {
      markAsRead(item);
    }
    
    // Use the base path without /dashboard/admin since the router is already under that path
    switch (item.type) {
      case 'estimation_quote':
        // Navigate to the estimates page with the quote ID
        navigate(`/estimates?quoteId=${item.id}`);
        break;
      case 'contact_message':
        // For contact messages, navigate to the contact submissions list
        navigate('/contact-submissions');
        break;
      case 'service_request':
        // For service requests, navigate to the service requests list with the ID
        navigate(`/service-requests?id=${item.id}`);
        break;
      case 'quote_request':
        // For quote requests, navigate to the quotes list with the ID
        navigate(`/quotes?id=${item.id}`);
        break;
      case 'plan_lead':
        // For plan leads, navigate to the plan leads list
        navigate('/plan-leads');
        break;
      case 'support_ticket':
        // For support tickets, navigate to the support tickets list with the ID
        navigate(`/support/tickets?id=${item.id}`);
        break;
      default:
        break;
    }
  };

  // Define isUnread at the top level of the component to avoid hoisting issues
  const isUnread = (item: UnifiedNotification): boolean => {
    // Prefer explicit adminRead: only considered read when true
    if (item.adminRead === true) return false;
    // For service requests, consider read if status is 'ack' or 'done'
    if (item.type === 'service_request') {
      const st = String(item.status || '').toLowerCase();
      return !(st === 'ack' || st === 'done');
    }
    // For all others, missing adminRead or false => unread
    return true;
  };

  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<NotificationType | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // cache user lookups
  const userCache = useMemo(() => new Map<string, { displayName: string; email: string } | null>(), []);

  useEffect(() => {
    let unsubs: Array<() => void> = [];
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
        // Fetch each source independently so one failure doesn't kill the page
        const results: UnifiedNotification[] = [];
        let failures = 0;

        try {
          const snap = await getDocs(query(serviceRequestsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'service_request' as NotificationType })));
        } catch (err) {
          failures++; console.warn('[notifications] service_requests failed:', err);
        }

        try {
          const snap = await getDocs(query(contactRequestsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'contact_message' as NotificationType })));
        } catch (err) {
          failures++; console.warn('[notifications] contactRequests failed:', err);
        }

        try {
          const snap = await getDocs(query(plannerLeadsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'plan_lead' as NotificationType })));
        } catch (err) {
          failures++; console.warn('[notifications] planner leads failed:', err);
        }

        try {
          const snap = await getDocs(query(collectionGroup(db, SUBCOLLECTION_QUOTE), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'quote_request' as NotificationType, parentUid: d.ref.parent.parent?.id })));
        } catch (err) {
          failures++; console.warn('[notifications] quote_request (collectionGroup) failed:', err);
        }

        try {
          const snap = await getDocs(query(collectionGroup(db, 'ticket'), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'support_ticket' as NotificationType, parentUid: d.ref.parent.parent?.id })));
        } catch (err) {
          failures++; console.warn('[notifications] support_ticket (collectionGroup) failed:', err);
        }

        // Sort and set
        results.sort((a, b) => {
          const aTime = a.createdAt || a.created_at || a.ts || 0;
          const bTime = b.createdAt || b.created_at || b.ts || 0;
          return new Date(bTime as any).getTime() - new Date(aTime as any).getTime();
        });

        const enrichedList = await enrichWithUsers(results);
        setItems(enrichedList);
        setLoaded(true);
        try { localStorage.setItem('unified_notifications', JSON.stringify(enrichedList)); } catch {}

        // If everything failed, fall back to local
        if (failures >= 5) {
          showToast('Using local data (no Firebase config).', 'warn');
          tryLocal();
          return;
        }

        // Real-time listeners (best-effort)
        try {
          const unsubscribeContacts = onSnapshot(
            query(contactRequestsCollection(db), orderBy('createdAt', 'desc'), limit(50)),
            (snapshot) => {
              const updatedItems = snapshot.docs.map(doc => ({
                ...doc.data(),
                id: doc.id,
                type: 'contact_message' as NotificationType
              }));
              setItems(prev => mergeAndSort(prev, updatedItems));
            },
            (err) => console.warn('[notifications] contacts onSnapshot error:', err)
          );
          unsubs.push(unsubscribeContacts);
        } catch (err) {
          console.warn('[notifications] contacts listener init failed:', err);
        }
      } catch (e) {
        console.warn('Failed to initialize notifications:', e);
        showToast('Using local data (no Firebase config).', 'warn');
        tryLocal();
      }
    })();

    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, [db, userCache]);

  // Keep a ref of items for merging inside listeners
  const [_, forceTick] = useState(0);
  const itemsRef = React.useRef<UnifiedNotification[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  function mergeAndSort(prev: UnifiedNotification[], incoming: UnifiedNotification[]) {
    const map = new Map<string, UnifiedNotification>();
    const keyOf = (x: UnifiedNotification) => `${x.type}:${x.id}`;
    for (const x of prev) { if (x.id) map.set(keyOf(x), x); }
    for (const x of incoming) { if (x.id) map.set(keyOf(x), { ...map.get(keyOf(x)), ...x }); }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const aTime = a.createdAt || a.created_at || a.ts || 0;
      const bTime = b.createdAt || b.created_at || b.ts || 0;
      return new Date(bTime as any).getTime() - new Date(aTime as any).getTime();
    });
    return arr;
  }

  const filteredItems = useMemo(() => {
    let list = filter === 'all' ? [...items] : items.filter(item => item.type === filter);
    
    // Sort by read status (unread first) and then by date (newest first)
    list.sort((a, b) => {
      // First sort by read status (unread first)
      const aUnread = isUnread(a);
      const bUnread = isUnread(b);
      if (aUnread !== bUnread) {
        return aUnread ? -1 : 1;
      }
      
      // Then sort by date (newest first)
      const aTime = a.createdAt || a.created_at || a.ts || 0;
      const bTime = b.createdAt || b.created_at || b.ts || 0;
      return new Date(bTime as any).getTime() - new Date(aTime as any).getTime();
    });
    
    if (unreadOnly) {
      list = list.filter(isUnread);
    }
    
    return list;
  }, [items, filter, unreadOnly]);
  
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

  const unreadCount = useMemo(() => items.filter(isUnread).length, [items]);

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
      case 'support_ticket': return '📣';
      case 'estimation_quote': return '🧾';
      default: return '🔔';
    }
  };
  
  const getNotificationTitle = (item: UnifiedNotification): React.ReactNode => {
    switch (item.type) {
      case 'service_request': return `Service Request: ${item.service || 'Unknown'}`;
      case 'quote_request': return `New Quote Sent${item.location ? ` • ${item.location}` : ''}`;
      case 'contact_message': {
        const nameOrEmail = item.name || item.email;
        return nameOrEmail 
          ? <><span className="text-sm text-gray-300">Contact Message from </span><span className="text-indigo-300 font-sans text-lg font-medium">{nameOrEmail}</span></>
          : 'Contact Message from Unknown';
      }
      case 'plan_lead': return 'New Plan Lead Created';
      case 'support_ticket': return `Report Issued${item.subject ? ` • ${item.subject}` : ''}`;
      case 'estimation_quote': {
        const email = item.customerEmail || item.userEmail || item.email;
        return email 
          ? <>{'Estimation Quote from '}<span className="text-indigo-300 font-mono text-sm">{email}</span></>
          : 'Estimation Quote from Unknown';
      }
      default: return 'Notification';
    }
  };
  
  const getNotificationDescription = (item: UnifiedNotification) => {
    switch (item.type) {
      case 'service_request': return `Device: ${item.device || 'N/A'} | Priority: ${item.priority || 'Normal'}`;
      case 'quote_request': return `Area: ${item.area || 'N/A'} | Size: ${item.sqft || 'N/A'} sqft`;
      case 'contact_message': return `Service: ${item.service || 'N/A'} | Phone: ${item.phone || 'N/A'}`;
      case 'plan_lead': return 'A user requested a planning consultation';
      case 'support_ticket': return `Category: ${item.category || 'General'}${item.description ? ` • ${item.description}` : ''}`;
      case 'estimation_quote': return 'A new estimation quote has been created';
      default: return '';
    }
  };


  const markAsRead = async (item: UnifiedNotification) => {
    const key = `${item.type}:${item.id}`;
    try {
      setUpdating(key);
      if (!item.id) return;
      switch (item.type) {
        case 'service_request': {
          await updateDoc(serviceRequestDoc(db, item.id), { adminRead: true });
          break;
        }
        case 'contact_message': {
          await updateDoc(contactRequestDoc(db, item.id), { adminRead: true });
          break;
        }
        case 'plan_lead': {
          await updateDoc(plannerLeadDoc(db, item.id), { adminRead: true });
          break;
        }
        case 'quote_request': {
          if (!item.parentUid) throw new Error('Missing parent UID for quote');
          await updateDoc(quoteDoc(db, item.parentUid, item.id), { adminRead: true });
          break;
        }
        case 'support_ticket': {
          await updateDoc(supportTicketDoc(db, item.id), { adminRead: true });
          break;
        }
        case 'estimation_quote': {
          await updateDoc(estimationQuoteDoc(db, item.id), { adminRead: true });
          break;
        }
        default:
          break;
      }
      // reflect locally
      setItems((prev) => prev.map((x) => (x.id === item.id && x.type === item.type ? { ...x, adminRead: true } : x)));
    } catch {
      showToast('Failed to mark as read.', 'error');
    } finally {
      setUpdating(null);
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
        <div className="flex items-center justify-between mb-2">
          <label className="flex items-center space-x-2 text-sm text-gray-300">
            <input
              type="checkbox"
              className="accent-indigo-600"
              checked={unreadOnly}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnreadOnly(e.target.checked)}
              aria-label="Show Unread only"
            />
            <span>Show Unread only</span>
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-indigo-900/40 text-indigo-200">{unreadCount}</span>
          </label>
        </div>
        <div className="flex space-x-1 bg-gray-800/50 p-1 rounded-lg">
          {(['all', 'service_request', 'quote_request', 'contact_message', 'plan_lead', 'support_ticket'] as const).map((filterType) => (
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
               filterType === 'plan_lead' ? 'Plan Leads' :
               'Reports'}
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
            const unread = isUnread(item);
            
            return (
              <div 
              key={id} 
              className={`rounded-xl border p-6 transition-colors ${unread ? 'border-indigo-700/50 bg-indigo-900/20 hover:bg-indigo-900/30' : 'border-gray-800 bg-gray-900/30 hover:bg-gray-900/50'} cursor-pointer`}
              onClick={() => {
                // Mark as read when clicked
                if (unread) {
                  markAsRead(item);
                }
                // Navigate to the appropriate page
                navigateToItem(item);
              }}
            >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl">{getNotificationIcon(item.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-white">{getNotificationTitle(item)}</h3>
                        {unread && <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" aria-label="unread" />}
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          item.type === 'service_request' ? 'bg-blue-900/30 text-blue-300' :
                          item.type === 'quote_request' ? 'bg-green-900/30 text-green-300' :
                          item.type === 'contact_message' ? 'bg-purple-900/30 text-purple-300' :
                          item.type === 'plan_lead' ? 'bg-orange-900/30 text-orange-300' :
                          'bg-pink-900/30 text-pink-300'
                        }`}>
                          {item.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${unread ? 'bg-indigo-600/30 text-indigo-200' : 'bg-gray-700 text-gray-300'}`}>
                          {unread ? 'Unread' : 'Read'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-500 mt-1">
                        <span>🕒 {fmt(createdAt)}</span>
                      </div>
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
                    {unread && (
                      <button
                        onClick={() => markAsRead(item)}
                        disabled={updating === `${item.type}:${id}`}
                        className="px-3 py-1 text-xs rounded border border-indigo-500 text-indigo-300 hover:bg-indigo-700/30 disabled:opacity-50"
                      >
                        {updating === `${item.type}:${id}` ? 'Saving…' : 'Mark as Read'}
                      </button>
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
