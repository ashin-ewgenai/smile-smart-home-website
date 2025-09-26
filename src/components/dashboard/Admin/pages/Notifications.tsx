import React, { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db, firebaseApp } from '../../../../lib/firebase';
import { query, orderBy, updateDoc, deleteDoc, getDocs, getDoc, onSnapshot, addDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  adminNotificationsCollection,
  adminNotificationDoc,
  type AdminNotification
} from '../../../../models/Collections';
import { accountDoc, contactRequestsCollection, contactRequestDoc } from '../../../../models/Collections';
import { showToast } from '../../../../lib/toast';

type NotificationType = 'estimation_quote' | 'user_action' | 'system' | 'quote_request' | 'support_ticket' | 'contact_request' | string;

type UnifiedNotification = {
  id?: string;
  type: NotificationType;
  createdAt?: Date | string | number | Timestamp | null;
  adminRead?: boolean;
  
  // Admin Notification fields
  title?: string;
  message?: string;
  priority?: 'high' | 'medium' | 'low' | string;
  status?: 'read' | 'unread' | string;
  customerEmail?: string;
  customerUid?: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  
  // Additional fields for compatibility
  timestamp?: number;
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
  const [authError, setAuthError] = useState<string | null>(null);
  

  const isUnread = (item: UnifiedNotification): boolean => {
    // For admin notifications, check status field
    return item.status !== 'read';
  };

  const filteredItems = useMemo(() => {
    console.log('Filtering items. Total items:', items.length, 'Items:', items);
    console.log('Current filter:', filter, 'Unread only:', unreadOnly);
    const filtered = items.filter(item => {
      let matchesFilter = false;
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'contact_request') {
        // Treat both 'contact_request' and 'contact_message' as Contact Request
        const t = String(item.type || '').toLowerCase();
        matchesFilter = t === 'contact_request' || t === 'contact_message' || t.includes('contact');
      } else {
        matchesFilter = item.type === filter;
      }
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
      const aTime = a.createdAt || a.timestamp || 0;
      const bTime = b.createdAt || b.timestamp || 0;
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
    // Admin notification format
    const priorityColor = item.priority === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                         item.priority === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                         'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    
    return (
      <>
        <span className="text-gray-900 dark:text-white font-medium">{item.title || 'Admin Notification'}</span>
        {item.customerEmail && (
          <>
            <span className="mx-2 text-gray-600 dark:text-gray-400">from</span>
            <button
              type="button"
              onClick={onView}
              className="text-teal-600 dark:text-teal-300 font-mono text-sm underline-offset-2 hover:underline"
            >
              {item.customerEmail}
            </button>
          </>
        )}
      </>
    );
  };

  // Description removed from UI

  const markAsRead = async (item: UnifiedNotification) => {
    const key = `${item.type}:${item.id}`;
    try {
      setUpdating(key);
      if (!item.id) return;
      
      // Update admin notification status to 'read'
      await updateDoc(adminNotificationDoc(db, item.id), { status: 'read' });
      
      // Update local state
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, status: 'read' } : i
      ));
      
    } catch (error) {
      showToast('Failed to mark as read', 'error');
    } finally {
      setUpdating(null);
    }
  };

  const deleteNotification = async (item: UnifiedNotification) => {
    if (!item.id) return;
    
    try {
      setUpdating(`delete:${item.id}`);
      
      // Delete admin notification
      await deleteDoc(adminNotificationDoc(db, item.id));
      
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
    // Contact notifications should always go to contact submissions
    const typeStr = String(item.type || '').toLowerCase();
    const titleStr = String(item.title || '').toLowerCase();
    if (typeStr.includes('contact') || titleStr.includes('contact')) {
      navigate('/contact-submissions');
      return;
    }

    // Navigate based on related entity type and ID
    if (item.relatedEntityType && item.relatedEntityId) {
      switch (item.relatedEntityType) {
        case 'quote':
          navigate(`/estimates?quoteId=${item.relatedEntityId}`);
          break;
        case 'estimation_quote':
          navigate(`/estimates?quoteId=${item.relatedEntityId}`);
          break;
        case 'support_ticket':
          navigate(`/support/tickets?id=${item.relatedEntityId}`);
          break;
        default:
          // Default navigation or no navigation
          break;
      }
    }
  };





  useEffect(() => {
    let unsubs: Array<() => void> = [];

    // Listen for auth state; only fetch after Firebase restores the session
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      // Clear any existing listeners when auth state changes
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
      unsubs = [];

      if (!user) {
        setItems([]);
        setAuthError('You must be signed in to view admin notifications.');
        setLoaded(true);
        return;
      }

      try {
        // Ensure fresh token
        try { await user.getIdToken(true); } catch {}

        // Verify role from Accounts/{uid}
        const uid = user.uid;
        const email = user.email || null;
        const projectId = (firebaseApp?.options as any)?.projectId || (firebaseApp as any)?.options?.projectId;
        try {
          const accSnap = await getDoc(accountDoc(db, uid));
          const role = accSnap.exists() ? (accSnap.data() as any).Role : null;
          console.log('[AdminNotifications] Authenticated user context', { uid, email, role, projectId });
          if (role !== 'admin' && role !== 'Super Admin') {
            setAuthError(`Signed in as ${email || uid}, but role is '${role ?? 'unknown'}'. Admin access required.`);
            setLoaded(true);
            return;
          }
        } catch (roleErr) {
          console.warn('[AdminNotifications] Failed to read Accounts doc for role verification', roleErr);
        }

        // Initial fetch
        const snap = await getDocs(query(adminNotificationsCollection(db), orderBy('createdAt', 'desc')));
        const adminNotifications = snap.docs.map(d => {
          const data = d.data() as AdminNotification;
          return {
            id: d.id,
            type: data.type as NotificationType,
            title: data.title,
            message: data.message,
            createdAt: data.createdAt,
            status: data.status,
            customerEmail: data.customerEmail,
            customerUid: data.customerUid,
            relatedEntityId: data.relatedEntityId,
            relatedEntityType: data.relatedEntityType,
            priority: data.priority,
            timestamp: data.createdAt?.toMillis?.() || 0,
          } as UnifiedNotification;
        });

        setItems(adminNotifications);
        setAuthError(null);
        setLoaded(true);

        // Real-time listener
        const unsubscribeAdminNotifications = onSnapshot(
          query(adminNotificationsCollection(db), orderBy('createdAt', 'desc')),
          (snapshot) => {
            const updatedNotifications = snapshot.docs.map(doc => {
              const data = doc.data() as AdminNotification;
              return {
                id: doc.id,
                type: data.type as NotificationType,
                title: data.title,
                message: data.message,
                createdAt: data.createdAt,
                status: data.status,
                customerEmail: data.customerEmail,
                customerUid: data.customerUid,
                relatedEntityId: data.relatedEntityId,
                relatedEntityType: data.relatedEntityType,
                priority: data.priority,
                timestamp: data.createdAt?.toMillis?.() || 0,
              } as UnifiedNotification;
            });
            setItems(updatedNotifications);
          },
          (error) => {
            console.error('Error in admin notifications listener:', error);
            if (error.code === 'permission-denied') {
              setAuthError('You do not have permission to view admin notifications. Please ensure you are signed in as an admin.');
            }
          }
        );
        unsubs.push(unsubscribeAdminNotifications);
      } catch (error: any) {
        console.error('Error fetching admin notifications:', error);
        if (error.code === 'permission-denied') {
          setAuthError('You do not have permission to view admin notifications. Please ensure you are signed in as an admin.');
        } else {
          setAuthError('Failed to load notifications. Please try again.');
        }
        setItems([]);
        setLoaded(true);
      }
    });

    return () => {
      try { stopAuth(); } catch {}
      unsubs.forEach((u) => {
        try { u(); } catch {}
      });
    };
  }, [db]);



  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'service_request': return '🔧';
      case 'quote_request': return '💰';
      case 'contact_message': return '📧';
      case 'contact_request': return '📧';
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
        {(['all', 'quote_request', 'support_ticket', 'contact_request'] as const).map((filterType) => (
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
             filterType === 'support_ticket' ? 'Support Tickets' :
             filterType === 'contact_request' ? 'Contact Request' : String(filterType)}
          </button>
        ))}
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-gray-300 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-6 text-gray-700 dark:text-gray-300">Loading…</div>
      ) : authError ? (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-red-700 dark:text-red-300">
          <h3 className="font-semibold mb-2">Authentication Error</h3>
          <p>{authError}</p>
          <p className="mt-2 text-sm">Please sign in with an admin account to view notifications.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-gray-300 dark:border-gray-800 bg-white/80 dark:bg-gray-900/50 p-6 text-gray-700 dark:text-gray-300">
          {filter === 'all' ? 'No notifications yet.' : `No ${filter.replace('_', ' ')} notifications.`}
        </div>
      ) : (
        <div className="space-y-4">
          {displayedItems.map((item) => {
            const id = item.id || '';
            const createdAt = item.createdAt || null;
            const unread = isUnread(item);
            return (
              <div 
                key={id}
                className={`rounded-xl border p-6 transition-colors ${unread ? 'border-indigo-700/50 bg-indigo-900/20 hover:bg-indigo-900/30 dark:border-indigo-700/50 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/30' : 'border-gray-300 bg-white/80 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900/30 dark:hover:bg-gray-900/50'} cursor-pointer`}
                onClick={() => navigateToItem(item)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      <span className="inline-flex w-full items-center justify-between gap-3">
                        <span
                          className="min-w-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToItem(item);
                          }}
                        >
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
                    {/* Description removed as requested */}
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
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
                          disabled={updating === `${item.type}:${item.id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/30 disabled:opacity-50"
                        >
                          Mark as Read
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm('Are you sure you want to delete this notification?')) {
                          deleteNotification(item);
                        }
                      }}
                      aria-label="Delete notification"
                      title="Delete notification"
                      disabled={updating === `delete:${item.id}`}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </button>
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
