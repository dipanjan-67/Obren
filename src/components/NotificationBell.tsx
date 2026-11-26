import React, { useEffect, useState } from 'react';
import { Bell, Clock, Radio, Sparkles } from 'lucide-react';
import { fetchNotifications, markNotificationRead } from '../lib/teacherClient';
import type { ClassNotification } from '../../server/teacherRoutes';

interface NotificationBellProps {
  userId: string;
  onJoinLiveClass?: (groupId: string) => void;
  onOpenTest?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  userId,
  onJoinLiveClass,
  onOpenTest,
}) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ClassNotification[]>([]);

  const loadNotifications = async () => {
    if (!userId) return;
    try {
      const list = await fetchNotifications(userId);
      setNotifications(list);
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => clearInterval(interval);
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    await markNotificationRead(undefined, userId, true);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleItemClick = async (notif: ClassNotification) => {
    if (!notif.read) {
      await markNotificationRead(notif.id, userId, false);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    if (notif.type === 'LIVE_CLASS_STARTED' && onJoinLiveClass) {
      onJoinLiveClass(notif.groupId);
      setOpen(false);
    } else if (
      (notif.type === 'TEST_ASSIGNED' || notif.type === 'TEST_RESULTS_RELEASED') &&
      onOpenTest
    ) {
      onOpenTest();
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                    {unreadCount} new
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs">
                  No notifications right now
                </div>
              ) : (
                notifications.slice(0, 15).map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleItemClick(notif)}
                    className={`p-3 transition-colors cursor-pointer text-left flex gap-3 items-start ${
                      notif.read
                        ? 'opacity-70 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        : 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 font-medium'
                    }`}
                  >
                    <div className="mt-0.5">
                      {notif.type === 'LIVE_CLASS_STARTED' ? (
                        <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                          <Radio className="w-3.5 h-3.5 animate-pulse" />
                        </div>
                      ) : notif.type === 'TEST_ASSIGNED' || notif.type === 'TEST_RESULTS_RELEASED' ? (
                        <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {notif.title}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {notif.message}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {new Date(notif.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
