import React from 'react';
import { Bell, CheckCheck, Volume2, VolumeX, X } from 'lucide-react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { dataService } from '../services/dataService';
import { User, UserNotification } from '../types';
import { publishAgendaRefresh } from '../utils/agendaEvents';
import {
  claimNotificationDisplay,
  ensureNotificationServiceWorker,
  requestBrowserNotificationPermission,
  showBrowserNotification
} from '../utils/browserNotifications';
import { isSoundEnabled, playSoundEffect, setSoundEnabled } from '../utils/soundEffects';

type ToastState = UserNotification & {
  id: string;
};

type NotificationContextValue = {
  notifications: UserNotification[];
  unreadCount: number;
  panelOpen: boolean;
  soundEnabled: boolean;
  togglePanel: () => void;
  closePanel: () => void;
  markAllAsRead: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  toggleSound: () => void;
};

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

const isCompletionNotification = (type?: string) =>
  Boolean(type && /(completed|approved|finished|concluded)/i.test(type));

const normalizeNotificationRow = (row: any): UserNotification => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  body: row.body,
  relatedEntityType: row.related_entity_type,
  relatedEntityId: row.related_entity_id,
  isRead: row.is_read ?? false,
  createdAt: row.created_at
});

const getRealtimePayloadEntityId = (
  payload: RealtimePostgresChangesPayload<Record<string, unknown>>
) => {
  const newRow = (payload.new || {}) as { id?: string };
  const oldRow = (payload.old || {}) as { id?: string };
  return newRow.id || oldRow.id;
};

export const NotificationProvider: React.FC<{
  user: User;
  children: React.ReactNode;
}> = ({ user, children }) => {
  const [notifications, setNotifications] = React.useState<UserNotification[]>([]);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [soundEnabled, setSoundEnabledState] = React.useState(isSoundEnabled());
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const unreadCount = React.useMemo(
    () => notifications.filter(notification => !notification.isRead).length,
    [notifications]
  );

  const loadNotifications = React.useCallback(async () => {
    try {
      const rows = await dataService.getUserNotifications(user.id);
      setNotifications(rows);
    } catch (error) {
      console.error('Erro ao carregar notificacoes.', error);
    }
  }, [user.id]);

  React.useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  React.useEffect(() => {
    void ensureNotificationServiceWorker();
    void requestBrowserNotificationPermission();
  }, []);

  const enqueueToast = React.useCallback(async (notification: UserNotification) => {
    const toastId = `${notification.id}:${Date.now()}`;
    setToasts(currentToasts => [...currentToasts, { ...notification, id: toastId }]);
    window.setTimeout(() => {
      setToasts(currentToasts => currentToasts.filter(toast => toast.id !== toastId));
    }, 4500);

    if (soundEnabled) {
      await playSoundEffect(isCompletionNotification(notification.type) ? 'completed-task' : 'new-task');
    }

    await showBrowserNotification(notification);
  }, [soundEnabled]);

  React.useEffect(() => {
    const createdToastIds = new Set<string>();

    const notificationChannel = supabase
      .channel(`dreon-notifications:${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`
      }, async (payload: RealtimePostgresChangesPayload<any>) => {
        if (payload.eventType === 'INSERT' && payload.new) {
          const notification = normalizeNotificationRow(payload.new);
          setNotifications(current => [notification, ...current]);

          if (!createdToastIds.has(notification.id) && claimNotificationDisplay(notification.id)) {
            createdToastIds.add(notification.id);
            await enqueueToast(notification);
          }
        }

        if (payload.eventType === 'UPDATE' && payload.new) {
          const notification = normalizeNotificationRow(payload.new);
          setNotifications(current =>
            current.map(item => item.id === notification.id ? notification : item)
          );
        }

      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_instances'
      }, payload => {
        publishAgendaRefresh({
          source: 'notification_provider',
          entity: 'task_instances',
          entityId: getRealtimePayloadEntityId(payload)
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'call_schedules'
      }, payload => {
        publishAgendaRefresh({
          source: 'notification_provider',
          entity: 'call_schedules',
          entityId: getRealtimePayloadEntityId(payload)
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'protocols'
      }, payload => {
        publishAgendaRefresh({
          source: 'notification_provider',
          entity: 'protocols',
          entityId: getRealtimePayloadEntityId(payload)
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'visits'
      }, payload => {
        publishAgendaRefresh({
          source: 'notification_provider',
          entity: 'visits',
          entityId: getRealtimePayloadEntityId(payload)
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
    };
  }, [enqueueToast, user.id]);

  const markAllAsRead = React.useCallback(async () => {
    await dataService.markUserNotificationsRead(user.id);
    setNotifications(current => current.map(notification => ({ ...notification, isRead: true })));
  }, [user.id]);

  const markAsRead = React.useCallback(async (notificationId: string) => {
    await dataService.markUserNotificationsRead(user.id, [notificationId]);
    setNotifications(current =>
      current.map(notification => notification.id === notificationId ? { ...notification, isRead: true } : notification)
    );
  }, [user.id]);

  const toggleSound = React.useCallback(() => {
    const nextValue = !soundEnabled;
    setSoundEnabledState(nextValue);
    setSoundEnabled(nextValue);
  }, [soundEnabled]);

  React.useEffect(() => {
    if (!panelOpen || typeof window === 'undefined') return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPanelOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [panelOpen]);

  const value = React.useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    panelOpen,
    soundEnabled,
    togglePanel: () => setPanelOpen(current => !current),
    closePanel: () => setPanelOpen(false),
    markAllAsRead,
    markAsRead,
    toggleSound
  }), [markAllAsRead, markAsRead, notifications, panelOpen, soundEnabled, unreadCount, toggleSound]);

  return (
    <NotificationContext.Provider value={value}>
      {children}

      {!panelOpen && (
        <div className="fixed bottom-6 right-6 z-[220] space-y-3 pointer-events-none">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="pointer-events-auto w-[380px] max-w-[calc(100vw-1.5rem)] rounded-[28px] border border-slate-200 bg-white/96 px-5 py-4 shadow-2xl shadow-slate-900/15 backdrop-blur-md animate-in slide-in-from-bottom-4"
            >
              <div className="flex items-start gap-3">
                <div className={`mt-1 flex h-10 w-10 items-center justify-center rounded-2xl ${isCompletionNotification(toast.type) ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                  <Bell size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Central operacional</p>
                  <h4 className="mt-1 text-sm font-black text-slate-800">{toast.title}</h4>
                  {toast.body && (
                    <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{toast.body}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {panelOpen && (
        <div className="fixed bottom-6 right-6 z-[215] w-[400px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[34px] border border-slate-200 bg-white/98 shadow-2xl shadow-slate-900/20 backdrop-blur-md animate-in slide-in-from-bottom-4">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Notificacoes</p>
              <h3 className="mt-1 text-lg font-black text-slate-900">Inbox operacional</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Fica aberto aqui no canto para voce acompanhar sem travar a tela.</p>
            </div>
            <button
              onClick={() => setPanelOpen(false)}
              className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <button
              onClick={markAllAsRead}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800"
            >
              <CheckCheck size={14} />
              Marcar tudo
            </button>
            <button
              onClick={toggleSound}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${soundEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {soundEnabled ? 'Som ativo' : 'Som mudo'}
            </button>
          </div>

          <div className="max-h-[58vh] overflow-y-auto px-4 py-4">
            {notifications.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
                <Bell className="text-slate-300" size={28} />
                <p className="mt-4 text-sm font-black text-slate-700">Nenhuma notificacao ainda</p>
                <p className="mt-1 text-sm font-medium text-slate-400">As atualizacoes em tempo real vao aparecer aqui.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map(notification => (
                  <button
                    key={notification.id}
                    onClick={() => markAsRead(notification.id)}
                    className={`w-full rounded-[28px] border px-4 py-4 text-left transition-colors ${notification.isRead ? 'border-slate-100 bg-white' : 'border-orange-200 bg-orange-50/70'}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{notification.type}</p>
                        <h4 className="mt-1 text-sm font-black text-slate-800">{notification.title}</h4>
                        {notification.body && (
                          <p className="mt-1 text-sm font-medium leading-relaxed text-slate-500">{notification.body}</p>
                        )}
                      </div>
                      {!notification.isRead && (
                        <span className="mt-1 inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
                      )}
                    </div>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                      {new Date(notification.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = React.useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications deve ser usado dentro de NotificationProvider.');
  }

  return context;
};
