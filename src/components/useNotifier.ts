import { notify as busNotify } from './notifierBus';
import type { NotifyOptions } from './notifierBus';

type NotifierContextValue = {
  notify: (opts: NotifyOptions) => void;
};

// Minimal compatibility hook: forwards to the notifierBus. This avoids depending on
// a build-time replacement or a provider while keeping the previous API.
export const useNotifier = (): NotifierContextValue => {
  return {
    notify: (opts: NotifyOptions) => {
      try { busNotify(opts); } catch { /* ignore */ }
    }
  };
};

export default useNotifier;
