import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../../lib/firebase';
import { query, orderBy, updateDoc, getDoc, setDoc, deleteDoc, getDocs, where, collectionGroup, collection, doc, onSnapshot, limit, type Timestamp } from 'firebase/firestore';
import { 
  serviceRequestsCollection, 
  serviceRequestDoc, 
  usersCollection, 
  userDoc,
  contactRequestsCollection,
  plannerLeadsCollection,
  plannerLeadDoc,
  SUBCOLLECTION_QUOTE,
  COLLECTION_QUOTES_ROOT
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
  
  // User and contact information
  userEmail?: string;
  email?: string;
  fromEmail?: string;
  userName?: string;
  displayName?: string;
  userId?: string;
  uid?: string;
  user?: string | { email?: string };
  customer?: { email?: string };
  customerEmail?: string;
  
  // Quote specific fields
  quoteType?: string;
  location?: string;
  sqft?: number | string;
  area?: string;
  details?: string;
  
  // Contact Message fields
  name?: string;
  phone?: string;
  message?: string;
  
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
  const [items, setItems] = useState<UnifiedNotification[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<NotificationType | 'all'>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  interface UserCache {
    displayName?: string;
    email?: string;
    name?: string;
  }

  // Extend the Window interface to include user data
  interface UserData {
    email: string;
    displayName?: string;
    name?: string;
    [key: string]: any;
  }
  
  const [userCache, setUserCache] = useState<Record<string, UserCache | null>>({});

  const isUnread = (item: UnifiedNotification): boolean => {
    // If explicitly marked read, treat as read for all types
    if (item.adminRead === true) return false;
    // For service requests, also consider read if status is 'ack' or 'done'
    if (item.type === 'service_request') {
      const st = String(item.status || '').toLowerCase();
      if (st === 'ack' || st === 'done') return false;
    }
    // Otherwise treat as unread
    return true;
  };

  const filteredItems = useMemo(() => {
    console.log('Filtering items. Total items:', items.length, 'Items:', items);
    console.log('Current filter:', filter, 'Unread only:', unreadOnly);
    const filtered = items.filter(item => {
      const matchesFilter = filter === 'all' || item.type === filter;
      const matchesUnread = !unreadOnly || isUnread(item);
      return matchesFilter && matchesUnread;
    });

    // Sort with unread messages at the top, then by timestamp (newest first within each group)
    return [...filtered].sort((a, b) => {
      const aUnread = isUnread(a);
      const bUnread = isUnread(b);
      
      // If one is unread and the other isn't, sort unread first
      if (aUnread !== bUnread) {
        return aUnread ? -1 : 1;
      }
      
      // If both are read or both are unread, sort by timestamp (newest first)
      const aTime = a.createdAt || a.created_at || a.ts || 0;
      const bTime = b.createdAt || b.created_at || b.ts || 0;
      const aTimestamp = aTime instanceof Date ? aTime.getTime() : typeof aTime === 'number' ? aTime : 0;
      const bTimestamp = bTime instanceof Date ? bTime.getTime() : typeof bTime === 'number' ? bTime : 0;
      
      return bTimestamp - aTimestamp;
    });
  }, [items, filter, unreadOnly]);

  // Decide which items to display based on unread/read and 15-item limit rule
  const displayedItems = useMemo(() => {
    const unreadList = filteredItems.filter(isUnread);
    const readList = filteredItems.filter((x) => !isUnread(x));
    // If there are no unread items, show up to 15 read items
    if (unreadList.length === 0) return readList.slice(0, 15);
    // If unread exceed 15, show all unread (no cap)
    if (unreadList.length >= 15) return unreadList;
    // Otherwise, show all unread and fill the rest with read items up to 15 total
    const remaining = 15 - unreadList.length;
    return [...unreadList, ...readList.slice(0, Math.max(0, remaining))];
  }, [filteredItems]);

  const getNotificationTitle = (item: UnifiedNotification, onView?: (e: React.MouseEvent) => void): React.ReactNode => {
    switch (item.type) {
      case 'service_request':
        return `Service Request: ${item.service || 'Unknown'}`;
      case 'support_ticket': {
        const email = item.email || item.userEmail || 'Unknown Sender';
        const displayName = item.fullName || item.name || email.split('@')[0];
        const service = item.service ? ` • ${item.service}` : '';
        
        return (
          <>
            <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
              {item.status === 'pending' ? 'NEW REPORT' : 'REPORT'}
            </span>
            <span className="mx-2 text-teal-600 dark:text-gray-400">from</span>
            <button
              type="button"
              onClick={onView}
              className="text-gray-900 dark:text-teal-300 font-medium underline-offset-2 hover:underline"
            >
              {displayName}
            </button>
          </>
        );
      }
      case 'quote_request': {
        // Get email from various possible fields in order of priority
        const possibleEmailFields = [
          item.email,
          item.userEmail,
          item.customerEmail,
          item.customer?.email,
          typeof item.user === 'object' ? item.user?.email : item.user,
          typeof item.user === 'string' ? item.user : null
        ];
        
        // Find the first non-empty email
        const email = possibleEmailFields.find(
          field => field && typeof field === 'string' && field.includes('@')
        ) || 'Unknown Sender';
        
        // Ensure we have a valid email string
        const displayEmail = typeof email === 'string' ? email : 'Unknown Sender';
        
        return (
          <>
            <span className="px-2 py-1 text-xs rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">QUOTE</span>
            <span className="mx-2 text-teal-600 dark:text-gray-400">from</span>
            <button
              type="button"
              onClick={onView}
              className="text-gray-900 dark:text-teal-300 font-sans text-lg font-medium underline-offset-2 hover:underline"
            >
              {displayEmail}
            </button>
          </>
        );
      }
      case 'contact_message': {
        const nameOrEmail = item.name || item.email;
        return nameOrEmail 
          ? <>
              <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">CONTACT MESSAGE</span>
              <span className="mx-2 text-teal-600 dark:text-gray-400">from</span>
              <button
                type="button"
                onClick={onView}
                className="text-gray-900 dark:text-indigo-300 font-sans text-lg font-medium underline-offset-2 hover:underline"
              >{nameOrEmail}</button>
            </>
          : <>
              <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">CONTACT MESSAGE</span>
              <span className="mx-2 text-blue-600 dark:text-gray-400">from</span>
              <span>Unknown Sender</span>
            </>;
      }
      case 'plan_lead': {
        const email = item.email || item.userEmail || 'No email provided';
        return (
          <>
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">PLAN LEAD</span>
            <span className="mx-2 text-blue-600 dark:text-gray-400">from</span>
            <button
              type="button"
              onClick={onView}
              className="text-gray-900 dark:text-indigo-300 font-sans text-lg font-medium underline-offset-2 hover:underline"
            >
              {email}
            </button>
          </>
        );
      }
      case 'estimation_quote': {
        const email = item.customerEmail || item.userEmail || item.email;
        return email 
          ? <>{'Estimation Quote from '}<button type="button" onClick={onView} className="text-gray-900 dark:text-teal-300 font-mono text-sm underline-offset-2 hover:underline">{email}</button></>
          : 'Estimation Quote from Unknown';
      }
      default:
        return 'Notification';
    }
  };

  const getNotificationDescription = (item: UnifiedNotification): string => {
    switch (item.type) {
      case 'service_request':
        return `Device: ${item.device || 'N/A'} | Priority: ${item.priority || 'Normal'}`;
      case 'quote_request':
        return `Area: ${item.area || 'N/A'} | Size: ${item.sqft || 'N/A'} sqft`;
      case 'contact_message':
        return `Service: ${item.service || 'N/A'} | Phone: ${item.phone || 'N/A'}`;
      case 'plan_lead':
        return `Email: ${item.email || 'Not provided'}`;
      case 'support_ticket':
        return `Category: ${item.category || 'General'}${item.description ? ` • ${item.description}` : ''}`;
      case 'estimation_quote':
        return 'A new estimation quote has been created';
      default:
        return '';
    }
  };

  const markAsRead = async (item: UnifiedNotification) => {
    const key = `${item.type}:${item.id}`;
    try {
      setUpdating(key);
      if (!item.id) return;
      
      if (item.type === 'quote_request') {
        // Update root quotes doc if this item is from root collection
        try { await updateDoc(doc(db, 'quotes', item.id), { adminRead: true }); } catch {}
        // If we have a parentUid, also update nested subcollection doc so collectionGroup fetch reflects it
        if (item.parentUid) {
          try { await updateDoc(doc(db, COLLECTION_QUOTES_ROOT, item.parentUid, SUBCOLLECTION_QUOTE, item.id), { adminRead: true }); } catch {}
        }
      } else if (item.type === 'service_request') {
        await updateDoc(serviceRequestDoc(db, item.id), { adminRead: true });
      } else if (item.type === 'contact_message') {
        await updateDoc(contactRequestDoc(db, item.id), { adminRead: true });
      } else if (item.type === 'plan_lead') {
        try { await updateDoc(plannerLeadDoc(db, item.id), { adminRead: true }); } catch {}
      } else if (item.type === 'support_ticket') {
        if (item.parentUid) {
          // For nested support tickets, update the nested path
          await updateDoc(doc(db, 'supportTickets', item.parentUid, 'ticket', item.id), { adminRead: true });
        } else {
          // Some support tickets are sourced from Contact_Messages; update that doc as well
          try { await updateDoc(doc(db, 'Contact_Messages', item.id), { adminRead: true }); } catch {}
        }
      }
      
      // Update local state
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, adminRead: true } : i
      ));
      
      // Toast removed per UX: avoid showing a top-right popup on mark-as-read
    } catch (error) {
      showToast('Failed to mark as read', 'error');
    }
  };

  const deleteNotification = async (item: UnifiedNotification) => {
    if (!item.id) return;
    
    try {
      setUpdating(`delete:${item.id}`);
      
      if (item.type === 'support_ticket' && item.parentUid) {
        // For support tickets, we need to use the parentUid to build the correct path
        await deleteDoc(doc(db, 'supportTickets', item.parentUid, 'ticket', item.id));
      } else if (item.type === 'quote_request') {
        await deleteDoc(doc(db, 'quotes', item.id));
      } else if (item.type === 'service_request') {
        await deleteDoc(serviceRequestDoc(db, item.id));
      } else if (item.type === 'contact_message') {
        await deleteDoc(contactRequestDoc(db, item.id));
      }
      
      // Update local state by filtering out the deleted notification
      setItems(prev => prev.filter(i => i.id !== item.id));
      
      showToast('Notification deleted', 'success');
    } catch (error) {
      console.error('Error deleting notification:', error);
      showToast('Failed to delete notification', 'error');
    } finally {
      setUpdating(null);
    }
  };

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
        // For quote requests, navigate to the estimates page with the quote ID
        navigate(`/estimates?quoteId=${item.id}`);
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


  // Function to fetch quote requests from the specific document path
  const fetchQuoteRequests = async () => {
    try {
      // Get the specific quote document
      const quoteDoc = await getDoc(doc(db, 'quotes', '1FHDlaYHEfN6ngVrfHiv'));
      
      if (!quoteDoc.exists()) {
        return [];
      }
      
      // Process the specific quote document
      const quoteData = quoteDoc.data();
      const quote = {
        id: quoteDoc.id,
        ...quoteData,
        type: 'quote_request' as NotificationType,
        timestamp: quoteData.createdAt?.toMillis() || Date.now()
      };
      
      return [quote]; // Return as array to maintain consistent return type
    } catch (error) {
      return [];
    }
  };

  // Function to fetch support tickets from Contact_Messages collection
  const fetchSupportTickets = async () => {
    try {
      console.log('Fetching support tickets from Contact_Messages collection...');
      const contactMessagesRef = collection(db, 'Contact_Messages');
      const q = query(contactMessagesRef, orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      
      console.log(`Found ${snapshot.docs.length} support tickets`);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Processing support ticket:', doc.id, data);
        
        return {
          id: doc.id,
          ...data,
          type: 'support_ticket' as const,
          timestamp: data.createdAt?.toMillis?.() || Date.now(),
          // Map common fields
          email: data.email || data.userEmail || '',
          userEmail: data.email || data.userEmail || '',
          message: data.message || data.description || '',
          // Ensure we have a title/name for display
          title: data.service ? `Support: ${data.service}` : 'Support Request',
          // Map status with a default
          status: data.status || 'pending',
          // Map name field if available
          name: data.name || data.userName || data.displayName || ''
        };
      });
    } catch (error) {
      console.error('Error fetching support tickets:', error);
      return [];
    }
  };

  // Function to fetch plan leads
  const fetchPlanLeads = async () => {
    try {
      const planLeadsSnapshot = await getDocs(plannerLeadsCollection(db));
      const planLeads = planLeadsSnapshot.docs.map(doc => {
        const data = doc.data();
        
        // Try to find the email in various possible fields
        const email = data.email || data.userEmail || data.customerEmail || data.fromEmail || 'No email provided';
        const name = data.name || data.userName || data.displayName || 'Anonymous User';
        
        return {
          id: doc.id,
          ...data,
          type: 'plan_lead' as NotificationType,
          timestamp: data.createdAt?.toMillis() || Date.now(),
          email: email,
          name: name,
          // Make sure these fields are available for the notification
          userEmail: email,
          userName: name
        };
      });
      
      return planLeads;
    } catch (error) {
      return [];
    }
  };

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
          if (!(uid in userCache)) {
            fetches.push((async () => {
              try {
                const snap = await getDoc(userDoc(db, uid));
                if (snap.exists()) {
                  const data: any = snap.data();
                  setUserCache(prev => ({
                    ...prev,
                    [uid]: { displayName: data.displayName || data.name || '', email: data.email || '' }
                  }));
                } else {
                  setUserCache(prev => ({
                    ...prev,
                    [uid]: null
                  }));
                }
              } catch {
                setUserCache(prev => ({
                  ...prev,
                  [uid]: null
                }));
              }
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
          const cached = uid ? userCache[uid] : null;
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

        // Fetch support tickets
        try {
          const supportTickets = await fetchSupportTickets();
          console.log('Fetched support tickets:', supportTickets);
          results.push(...supportTickets);
          console.log('Results after adding support tickets:', results);
        } catch (err) {
          console.error('Error fetching support tickets:', err);
          failures++;
        }

        // Fetch quote requests from the quotes collection
        try {
          const quotes = await fetchQuoteRequests();
          results.push(...quotes);
        } catch (err) {
          failures++;
        }

        // Fetch plan leads
        try {
          const planLeads = await fetchPlanLeads();
          results.push(...planLeads);
        } catch (err) {
          failures++;
        }

        try {
          const snap = await getDocs(query(serviceRequestsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'service_request' as NotificationType })));
        } catch (err) {
          failures++;
        }

        try {
          const snap = await getDocs(query(contactRequestsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'contact_message' as NotificationType })));
        } catch (err) {
          failures++;
        }

        try {
          const snap = await getDocs(query(plannerLeadsCollection(db), orderBy('createdAt', 'desc')));
          results.push(...snap.docs.map(d => ({ ...d.data(), id: d.id, type: 'plan_lead' as NotificationType })));
        } catch (err) {
          failures++;
        }

        try {
          const snap = await getDocs(collectionGroup(db, SUBCOLLECTION_QUOTE));
          const quotes = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              type: 'quote_request' as NotificationType,
              parentUid: d.ref.parent.parent?.id,
              // Map email fields from the quote data
              email: data.email || data.userEmail || data.customerEmail,
              userEmail: data.userEmail || data.email || data.customerEmail,
              // Preserve adminRead so unread state persists
              adminRead: data.adminRead === true,
              // Ensure we have a timestamp for sorting
              timestamp: data.createdAt?.toMillis() || 0
            };
          });
          // Sort by timestamp in descending order
          quotes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          results.push(...quotes);
        } catch (err) {
          failures++;
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

        // Add real-time listeners
        const setupRealtimeListeners = () => {
          // Listen for new service requests
          const serviceRequestsQuery = query(
            collectionGroup(db, 'service_requests'),
            limit(50)
          );

          const unsub1 = onSnapshot(serviceRequestsQuery, (snapshot) => {
            const newItems = snapshot.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                ...data,
                type: 'service_request' as NotificationType,
                parentUid: doc.ref.parent.parent?.id,
                timestamp: data.createdAt?.toMillis?.() || data.timestamp || Date.now()
              };
            });
            
            setItems(prev => {
              const filtered = prev.filter(x => x.type !== 'service_request');
              const merged = [...newItems, ...filtered];
              return merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            });
          });
          unsubs.push(unsub1);
          
          // Listen for new contact requests
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
            (error) => {
              console.error('Error in contact requests listener:', error);
            }
          );
          unsubs.push(unsubscribeContacts);
          
          return () => {
            unsubs.forEach(unsub => { try { unsub(); } catch {} });
          };
        };
        
        setupRealtimeListeners();
      } catch (e) {
        showToast('Using local data (no Firebase config).', 'warn');
        tryLocal();
      }
    })();

    return () => { unsubs.forEach(u => { try { u(); } catch {} }); };
  }, [db, userCache]);

  const mergeAndSort = (prev: UnifiedNotification[], incoming: UnifiedNotification[]) => {
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
  };

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
  



  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h2>
        </div>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
            />
            <span>Unread only</span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['all', 'quote_request', 'contact_message', 'plan_lead', 'support_ticket'] as const).map((filterType) => (
          <button
            key={filterType}
            onClick={() => setFilter(filterType)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === filterType
                ? 'bg-teal-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {filterType === 'all' ? 'All' : 
             filterType === 'quote_request' ? 'Quote Requests' :
             filterType === 'contact_message' ? 'Contact Messages' :
             filterType === 'plan_lead' ? 'Plan Leads' :
             'Reports'}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-gray-300 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-6 text-gray-700 dark:text-gray-300">Loading…</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-gray-300 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-6 text-gray-700 dark:text-gray-300">
          {filter === 'all' ? 'No notifications yet.' : `No ${filter.replace('_', ' ')} notifications.`}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedItems.map((item) => {
            const id = item.id || '';
            const createdAt = item.createdAt || item.created_at || item.ts || null;
            const email = item.userEmail || item.email || item.user || '';
            const name = item.userName || item.displayName || item.name || '';
            const unread = isUnread(item);
            return (
              <div 
                key={id}
                className={`rounded-xl border p-6 transition-colors ${unread ? 'border-indigo-700/50 bg-indigo-900/20 hover:bg-indigo-900/30 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30' : 'border-gray-300 bg-white/80 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/30 dark:hover:bg-gray-900/50'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      <span className="inline-flex w-full items-center justify-between gap-3">
                        <span className="min-w-0">
                          {getNotificationTitle(item, (e) => {
                            e.stopPropagation();
                            if (unread) { markAsRead(item); }
                            navigateToItem(item);
                          })}
                        </span>
                        {createdAt && (
                          <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap ml-3">
                            {fmt(createdAt)}
                          </span>
                        )}
                      </span>
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2">
                    {/* View button removed; click the highlighted email/name instead */}
                    {unread && (
                      <>
                        <span className="ml-2 px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300">
                          New
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(item);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                        >
                          Mark as Read
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this notification?')) {
                              deleteNotification(item);
                            }
                          }}
                          className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                        >
                          Delete
                        </button>
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
