import { UserNotification } from '../types';

const NOTIFICATION_SERVICE_WORKER_PATH = `${import.meta.env.BASE_URL}dreon-notification-sw.js`;
const NOTIFICATION_DISPLAY_LOCK_PREFIX = 'dreon-notification-display-lock';
const NOTIFICATION_DISPLAY_LOCK_TTL_MS = 15_000;

let notificationServiceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

const resolveNotificationRoute = (notification: UserNotification) => {
  const entityType = notification.relatedEntityType?.toLowerCase() || '';

  if (/(task|schedule|agenda|calendar)/i.test(entityType)) {
    return '/calendar';
  }

  if (/(protocol)/i.test(entityType)) {
    return '/protocols';
  }

  if (/(visit|route)/i.test(entityType)) {
    return '/routes';
  }

  if (/(quote|orcamento)/i.test(entityType)) {
    return '/quotes';
  }

  return '/';
};

const buildNotificationUrl = (notification: UserNotification) => {
  if (typeof window === 'undefined') {
    return '#/';
  }

  const route = resolveNotificationRoute(notification);
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${route}`;
};

export const ensureNotificationServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!notificationServiceWorkerRegistrationPromise) {
    notificationServiceWorkerRegistrationPromise = navigator.serviceWorker
      .register(NOTIFICATION_SERVICE_WORKER_PATH)
      .then(async () => {
        try {
          return await navigator.serviceWorker.ready;
        } catch {
          return await navigator.serviceWorker.getRegistration(NOTIFICATION_SERVICE_WORKER_PATH) || null;
        }
      })
      .catch(error => {
        console.error('Erro ao registrar service worker de notificacoes.', error);
        notificationServiceWorkerRegistrationPromise = null;
        return null;
      });
  }

  return notificationServiceWorkerRegistrationPromise;
};

export const claimNotificationDisplay = (notificationId: string): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }

  const storageKey = `${NOTIFICATION_DISPLAY_LOCK_PREFIX}:${notificationId}`;
  const now = Date.now();

  try {
    const currentLockValue = Number(window.localStorage.getItem(storageKey) || '0');
    if (currentLockValue > now) {
      return false;
    }

    window.localStorage.setItem(storageKey, String(now + NOTIFICATION_DISPLAY_LOCK_TTL_MS));
    window.setTimeout(() => {
      try {
        const persistedValue = Number(window.localStorage.getItem(storageKey) || '0');
        if (persistedValue <= Date.now()) {
          window.localStorage.removeItem(storageKey);
        }
      } catch {
        // Ignora falhas pontuais de storage sem travar o fluxo da notificacao.
      }
    }, NOTIFICATION_DISPLAY_LOCK_TTL_MS + 1_000);

    return true;
  } catch {
    return true;
  }
};

export const requestBrowserNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }

  if (Notification.permission !== 'default') {
    return Notification.permission;
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
};

export const showBrowserNotification = async (notification: UserNotification): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  const title = notification.title || 'Atualizacao operacional';
  const body = notification.body || 'Atualizacao operacional disponivel no sistema.';
  const tag = `dreon-user-notification:${notification.id}`;
  const options: NotificationOptions & { requireInteraction?: boolean } = {
    body,
    tag,
    renotify: false,
    requireInteraction: true,
    data: {
      notificationId: notification.id,
      relatedEntityType: notification.relatedEntityType || null,
      relatedEntityId: notification.relatedEntityId || null,
      url: buildNotificationUrl(notification)
    }
  };

  const registration = await ensureNotificationServiceWorker();

  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return true;
  }

  new Notification(title, options);
  return true;
};
