import React, { useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { query, where, orderBy, onSnapshot, updateDoc, serverTimestamp, Timestamp, getDocs, setDoc } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebase';
import { userNotificationsCollection, userNotificationDoc, userDevicesCollection, type UserNotification } from '../../../models/Collections';
import GlassCard from '../../ui/GlassCard';

const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<(UserNotification & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [userUid, setUserUid] = useState<string | null>(null);

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
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(notifs);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching notifications:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [userUid]);

  // Warranty expiry detection and notification creation (re-enabled)
  useEffect(() => {
    if (!userUid) return;

    const scanWarrantyAndNotify = async () => {
      try {
        // Get all user devices for this user
        const qRef = query(userDevicesCollection(db), where('uid', '==', userUid));
        const snap = await getDocs(qRef);

        const now = Timestamp.now();

        const createNotifIfMissing = async (
          notifId: string,
          payload: {
            uid: string;
            title: string;
            message: string;
            type: string;
            status: 'unread' | 'read';
            createdAt: Timestamp;
            deviceId?: string;
            serialNumber?: string;
            warrantyExpiry?: string;
            key?: string;
          }
        ) => {
          const ref = userNotificationDoc(db, notifId);
          try {
            await setDoc(ref, payload);
          } catch (error: any) {
            if (error.code !== 'already-exists') throw error;
          }
        };

        for (const d of snap.docs) {
          const data = d.data() as any;
          const deviceId = d.id;
          const deviceName = data.deviceName || data.name || 'Device';
          const serials: any[] = Array.isArray(data.serials) ? data.serials : [];

          for (let idx = 0; idx < serials.length; idx++) {
            const s = serials[idx] || {};
            const expiry: string | undefined = s.warrantyExpiry;
            if (!expiry) continue;

            const expired = isPast(expiry);
            const days = daysUntil(expiry) ?? 9999;
            const expiringSoon = !expired && days <= 30;
            const typeKey = expired ? 'warranty_expired' : expiringSoon ? 'warranty_expiring' : null;
            if (!typeKey) continue;

            const serialKey = String(s.serialNumber || s.serial || idx);
            const baseKey = `${userUid}:${deviceId}:${serialKey}`;
            const notifId = `${baseKey}:${typeKey}`.replace(/[^a-zA-Z0-9:_-]/g, '_');

            const title = expired
              ? `Warranty expired for ${deviceName}`
              : `Warranty expiring soon for ${deviceName}`;
            const message = expired
              ? `The warranty for serial ${serialKey} expired on ${expiry}.`
              : `The warranty for serial ${serialKey} expires on ${expiry} (${days} days left).`;

            await createNotifIfMissing(notifId, {
              uid: userUid,
              title,
              message,
              type: 'device',
              status: 'unread',
              createdAt: now,
              deviceId,
              serialNumber: String(s.serialNumber || s.serial || ''),
              warrantyExpiry: expiry,
              key: baseKey,
            });
          }
        }
      } catch (e) {
        console.error('Warranty scan failed', e);
      }
    };

    void scanWarrantyAndNotify();
  }, [userUid]);

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    // Optimistic update so the item disappears immediately
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, status: 'read' } : n));
    try {
      await updateDoc(userNotificationDoc(db, notificationId), {
        status: 'read',
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      // Revert optimistic update on failure
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, status: 'unread' } : n));
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

  // Warranty utility functions
  const parseYMD = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return null;
    // Create date in local TZ at midnight
    return new Date(y, m - 1, d);
  };

  const isPast = (dateStr: string): boolean => {
    const d = parseYMD(dateStr);
    if (!d) return false;
    const today = new Date();
    // Normalize both to midnight for fair comparison
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d < todayMid;
  };

  const daysUntil = (dateStr: string): number | null => {
    const d = parseYMD(dateStr);
    if (!d) return null;
    const today = new Date();
    const diffMs = d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  // Manual test function
  const createManualTestNotification = async () => {
    if (!userUid) {
      alert('No user UID available');
      return;
    }
    
    try {
      console.log('Manual test: Creating notification for user:', userUid);
      console.log('Auth state:', auth.currentUser);
      console.log('Auth UID:', auth.currentUser?.uid);
      
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
      
      console.log('Manual test notification created successfully');
      alert('Test notification created! Check the list below.');
    } catch (error) {
      console.error('Manual test notification failed:', error);
      console.error('Error details:', error);
      alert('Test failed: ' + (error as any).message);
    }
  };

  return (
    <>
      <GlassCard className="p-0 overflow-hidden">
        <div className="px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Notifications
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
                className="text-sm text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium"
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
          ) : unreadCount === 0 ? (
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
          ) : (
            <ul className="divide-y divide-white/50 dark:divide-white/10">
              {unreadNotifications.map((notification) => (
                <li key={notification.id} className="py-4">
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 p-2 rounded-full ${
                      notification.type === 'system' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
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
                            {notification.title}
                            {notification.status === 'unread' && (
                              <span className="inline-flex h-2 w-2 rounded-full bg-teal-500" />
                            )}
                          </p>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{notification.message}</p>
                          <div className="mt-2 flex items-center gap-4">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(notification.createdAt)}
                            </span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              notification.type === 'system' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                              notification.type === 'device' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                              notification.type === 'billing' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                              notification.type === 'support' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200' :
                              'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                            }`}>
                              {notification.type}
                            </span>
                          </div>
                        </div>
                        {notification.status === 'unread' && (
                          <button
                            onClick={() => markAsRead(notification.id)}
                            className="ml-4 text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-medium"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassCard>
    </>
  );
};

export default NotificationsPage;
