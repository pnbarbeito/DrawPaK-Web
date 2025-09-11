import type { AlertColor } from '@mui/material';

export type NotifyOptions = { message: string; severity?: AlertColor; duration?: number };

const subscribers: Array<(opts: NotifyOptions) => void> = [];

export function subscribe(fn: (opts: NotifyOptions) => void) {
  subscribers.push(fn);
  return () => {
    const idx = subscribers.indexOf(fn);
    if (idx !== -1) subscribers.splice(idx, 1);
  };
}

export function notify(opts: NotifyOptions) {
  subscribers.forEach(s => {
    try { s(opts); } catch { /* ignore */ }
  });
}

export default { subscribe, notify };
