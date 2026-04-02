const AGENDA_REFRESH_EVENT = 'dreon:agenda-refresh';

export type AgendaRefreshPayload = {
  source: string;
  entity?: string;
  entityId?: string;
};

export const publishAgendaRefresh = (payload: AgendaRefreshPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AGENDA_REFRESH_EVENT, { detail: payload }));
};

export const subscribeAgendaRefresh = (listener: (payload: AgendaRefreshPayload) => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const wrappedListener = (event: Event) => {
    const customEvent = event as CustomEvent<AgendaRefreshPayload>;
    listener(customEvent.detail);
  };

  window.addEventListener(AGENDA_REFRESH_EVENT, wrappedListener);
  return () => window.removeEventListener(AGENDA_REFRESH_EVENT, wrappedListener);
};
