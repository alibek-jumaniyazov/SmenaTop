import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/** Server-authenticated SSE; TanStack queries remain the source of truth and polling fallback. */
export function useNotificationsStream(authenticated: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!authenticated || typeof EventSource === 'undefined') return;
    const stream = new EventSource('/api/v1/notifications/stream', { withCredentials: true });
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: ['api', '/notifications'] });
    const expired = () => {
      stream.close();
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    };
    stream.addEventListener('notifications.changed', refresh);
    stream.addEventListener('notification', refresh);
    stream.addEventListener('session.expired', expired);
    return () => stream.close();
  }, [authenticated, queryClient]);
}
