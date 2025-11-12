import React, { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, Timestamp, getDocs, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { userNotificationsCollection, userNotificationDoc, userDevicesCollection, type UserNotification } from '../../../models/Collections';
import GlassCard from '../../ui/GlassCard';
import { Trash2, Bell } from 'lucide-react';

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<(UserNotification & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUserUid(user?.uid ?? null);
    });
    return () => unsub();
  }, []);

  // Fetch notifications for the current user
  useEffect(() => {
    if (!userUid) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const notificationsCol = userNotificationsCollection(db);
    const q = query(
      notificationsCol, 
      where('uid', '==', userUid), 
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => {
        const data: any = doc.data();
        const statusRaw = (data?.status ?? 'unread');
        const status = String(statusRaw).toLowerCase() === 'read' ? 'read' : 'unread';
        return {
          id: doc.id,
          ...data,
          status,
        } as any;
      });
      setNotifications(notifs as any);
      setLoading(false);
    }, () => { setLoading(false); });

    return () => unsub();
  }, [userUid]);


  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    if (!notificationId) return;
    setProcessing(prev => ({ ...prev, [notificationId]: true }));
    // Optimistic update so the item disappears immediately
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, status: 'read' } : n));
    try {
      await updateDoc(userNotificationDoc(db, notificationId), {
        status: 'read',
        readAt: serverTimestamp()
      });
    } catch (error) {
      // Revert optimistic update on failure
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, status: 'unread' } : n));
    } finally {
      setProcessing(prev => ({ ...prev, [notificationId]: false }));
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: string) => {
    if (!notificationId) return;
    // Optimistic update to remove from UI immediately
    const prevState = notifications;
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    try {
      await deleteDoc(userNotificationDoc(db, notificationId));
    } catch (error) {
      // Revert on failure
      setNotifications(prevState);
    }
  };

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'system':
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warranty_expiry':
        // Warning icon (triangle with exclamation)
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01" />
          </svg>
        );
      case 'device':
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        );
      case 'billing':
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        );
      case 'support':
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        );
      default:
        return (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5zM4 19h6v-6H4v6z" />
          </svg>
        );
    }
  };

  const unreadCount = useMemo(() => 
    notifications.filter(n => n.status === 'unread').length, 
    [notifications]
  );

  const unreadNotifications = useMemo(() => 
    notifications.filter(n => n.status === 'unread'), 
    [notifications]
  );

  const readNotifications = useMemo(() => 
    notifications.filter(n => n.status !== 'unread'), 
    [notifications]
  );

  // Determine if a notification is a quote-related notification
  const isQuoteNotification = (n: any): boolean => {
    const title = (n?.title || '').toString().toLowerCase();
    // Heuristic: our quote notifications include this title or a quoteId field
    return title.includes('estimation quote') || !!n?.quoteId;
  };

  // Determine if a notification is a warranty/device-related notification
  const isWarrantyNotification = (n: any): boolean => {
    const title = (n?.title || '').toString().toLowerCase();
    return (n?.type === 'device') && title.includes('warranty');
  };

  // Warranty date parsing (supports YYYY-MM-DD, DD/MM/YYYY, ISO strings, Date, Firestore Timestamp)
  const toLocalMidnight = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const parseDateFlexible = (value: any): Date | null => {
    try {
      if (!value) return null;
      // Firestore Timestamp
      if (value?.toDate && typeof value.toDate === 'function') {
        return toLocalMidnight(value.toDate());
      }
      // Already a Date
      if (value instanceof Date) {
        return toLocalMidnight(value);
      }
      if (typeof value === 'string') {
        const s = value.trim();
        // YYYY-MM-DD
        const mYMD = s.match(/^\d{4}-\d{2}-\d{2}$/);
        if (mYMD) {
          const [y, m, d] = s.split('-').map(Number);
          if (y && m && d) return new Date(y, m - 1, d);
        }
        // DD/MM/YYYY
        const mDMY = s.match(/^\d{2}\/\d{2}\/\d{4}$/);
        if (mDMY) {
          const [dd, mm, yyyy] = s.split('/').map(Number);
          if (yyyy && mm && dd) return new Date(yyyy, mm - 1, dd);
        }
        // Try ISO or Date-parsable string
        const parsed = new Date(s);
        if (!isNaN(parsed.getTime())) return toLocalMidnight(parsed);
      }
    } catch {}
    
    return null;
  };

  const isPast = (dateVal: any): boolean => {
    const d = parseDateFlexible(dateVal);
    if (!d) return false;
    const todayMid = toLocalMidnight(new Date());
    return d < todayMid;
  };

  const daysUntil = (dateVal: any): number | null => {
    const d = parseDateFlexible(dateVal);
    if (!d) return null;
    const todayMid = toLocalMidnight(new Date());
    const diffMs = d.getTime() - todayMid.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // Attempt to extract warranty expiry from various common keys
  const getExpiryFromSerial = (serial: any, device: any): any => {
    const candidates = [
      serial?.warrantyExpiry,
      serial?.warranty_expiry,
      serial?.warrantyExpiryDate,
      serial?.warranty_end,
      serial?.warrantyEnd,
      serial?.expiry,
      serial?.expirationDate,
      serial?.expiresOn,
      // sometimes set at device level
      device?.warrantyExpiry,
      device?.warranty_expiry,
      device?.warrantyExpiryDate,
      device?.warranty_end,
      device?.warrantyEnd,
      device?.expiry,
      device?.expirationDate,
    ];
    for (const v of candidates) {
      if (v !== undefined && v !== null && String(v).toString().trim() !== '') return v;
    }
    return undefined;
  };

  // Manual test function
  const createManualTestNotification = async () => {
    if (!userUid) {
      alert('No user UID available');
      return;
    }
    
    try {
      const testNotifId = `manual_test_${userUid}_${Date.now()}`;
      const ref = userNotificationDoc(db, testNotifId);
      
      await setDoc(ref, {
        uid: userUid,
        title: 'Manual Test Notification',
        message: 'This notification was created manually to test permissions.',
        type: 'device',
        status: 'unread',
        createdAt: Timestamp.now(),
      });
      alert('Test notification created! Check the list below.');
    } catch (error) {
      alert('Test failed: ' + (error as any).message);
    }
  };

  return (
    <>
      <GlassCard className="p-0 overflow-hidden">
        <div className="px-4 py-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                Notifications
                <Bell className="inline-block ml-2 h-5 w-5 text-gray-500 dark:text-gray-400 align-middle" />
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
                    {unreadCount} new
                  </span>
                )}
              </h2>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  // Mark all as read
                  notifications.filter(n => n.status === 'unread').forEach(n => markAsRead(n.id));
                }}
                className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium w-full sm:w-auto text-center"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pb-4 sm:px-6">
          {loading ? (
            <div className="text-center py-6">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600"></div>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading notifications...</p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Unread Section */}
              <div>
                {unreadNotifications.length > 0 && (
                  <>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Unread</h3>
                    <ul className="divide-y divide-white/50 dark:divide-white/10">
                      {unreadNotifications.map((notification) => (
                        <li key={notification.id} className="py-4">
                          <div className="flex items-start gap-4">
                            <div className={`flex-shrink-0 p-2 rounded-full ${
                              notification.type === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                              notification.type === 'warranty_expiry' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                              notification.type === 'device' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                              notification.type === 'billing' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              notification.type === 'support' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                              'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                            }`}>
                              {getNotificationIcon(notification.type)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    {isQuoteNotification(notification) ? (
                                      <a
                                        href="/dashboard/user/quote-portal"
                                        className="hover:underline cursor-pointer"
                                        onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await markAsRead(notification.id); try { window.location.href = '/dashboard/user/quote-portal'; } catch {} }}
                                        title="Go to Quote Portal"
                                      >
                                        {notification.title}
                                      </a>
                                    ) : isWarrantyNotification(notification) ? (
                                      <a
                                        href="/dashboard/user/about-device"
                                        className="hover:underline cursor-pointer"
                                        onClick={async (e) => { e.preventDefault(); e.stopPropagation(); await markAsRead(notification.id); try { window.location.href = '/dashboard/user/about-device'; } catch {} }}
                                        title="Go to About Device"
                                      >
                                        {notification.title}
                                      </a>
                                    ) : (
                                      <span>{notification.title}</span>
                                    )}
                                    {notification.status === 'unread' && (
                                      <span className="inline-flex h-2 w-2 rounded-full bg-teal-500" />
                                    )}
                                  </p>
                                  <div className="mt-2 flex items-center gap-4">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {formatDate(notification.createdAt)}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                      notification.type === 'system' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                                      notification.type === 'warranty_expiry' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                      notification.type === 'device' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                      notification.type === 'billing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                      notification.type === 'support' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' :
                                      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                                    }`}>
                                      {notification.type}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  {notification.status === 'unread' && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); if (processing[notification.id]) return; void markAsRead(notification.id); }}
                                      disabled={!!processing[notification.id]}
                                      className={`text-xs font-medium ${processing[notification.id] ? 'opacity-50 cursor-not-allowed' : 'text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300'}`}
                                      aria-busy={processing[notification.id] ? true : undefined}
                                    >
                                      {processing[notification.id] ? 'Marking…' : 'Mark as read'}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (window.confirm('Delete this notification?')) deleteNotification(notification.id);
                                    }}
                                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                    aria-label="Delete notification"
                                    title="Delete notification"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {unreadNotifications.length === 0 && notifications.length === 0 && (
                  <div className="rounded-xl border border-white/50 dark:border-white/10 bg-white/60 dark:bg-gray-900/30 p-6 text-center">
                    <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">You're all caught up</h3>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">No notifications at the moment. Check back later.</p>
                  </div>
                )}
              </div>

              {/* Read Section */}
              {readNotifications.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent</h3>
                  <ul className="divide-y divide-white/50 dark:divide-white/10">
                    {readNotifications.map((notification) => (
                      <li key={notification.id} className="py-4">
                        <div className="flex items-start gap-4">
                          <div className={`flex-shrink-0 p-2 rounded-full ${
                            notification.type === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                            notification.type === 'warranty_expiry' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                            notification.type === 'device' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                            notification.type === 'billing' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            notification.type === 'support' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                            'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {isQuoteNotification(notification) ? (
                                    <a
                                      href="/dashboard/user/quote-portal"
                                      className="hover:underline cursor-pointer"
                                      onClick={async (e) => { e.preventDefault(); e.stopPropagation(); try { window.location.href = '/dashboard/user/quote-portal'; } catch {} }}
                                      title="Go to Quote Portal"
                                    >
                                      {notification.title}
                                    </a>
                                  ) : isWarrantyNotification(notification) ? (
                                    <a
                                      href="/dashboard/user/about-device"
                                      className="hover:underline cursor-pointer"
                                      onClick={async (e) => { e.preventDefault(); e.stopPropagation(); try { window.location.href = '/dashboard/user/about-device'; } catch {} }}
                                      title="Go to About Device"
                                    >
                                      {notification.title}
                                    </a>
                                  ) : (
                                    <span>{notification.title}</span>
                                  )}
                                </p>
                                <div className="mt-2 flex items-center gap-4">
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDate(notification.createdAt)}
                                  </span>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    notification.type === 'system' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                                    notification.type === 'warranty_expiry' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                    notification.type === 'device' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                    notification.type === 'billing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                    notification.type === 'support' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' :
                                    'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                                  }`}>
                                    {notification.type}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4">
                                <button
                                  onClick={() => {
                                    if (window.confirm('Delete this notification?')) deleteNotification(notification.id);
                                  }}
                                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                  aria-label="Delete notification"
                                  title="Delete notification"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </GlassCard>
    </>
  );
};

export default NotificationsPage;
