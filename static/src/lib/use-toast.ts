// Global toast: pages call `pushToast(msg)` and a singleton <ToastHost>
// at the app root renders the message. Using a module-level pub/sub
// instead of per-component useToast() avoids the infinite-loop trap that
// happens when a page puts `toast` (the function) in a useEffect dep
// array — the function reference changes each render.

type Listener = (msg: string | null) => void;
let currentMsg: string | null = null;
let timer: number | undefined;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l(currentMsg);
};

export function pushToast(msg: string): void {
  currentMsg = msg;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    currentMsg = null;
    notify();
  }, 2000);
  notify();
}

export function useToastMessage(): string | null {
  return React.useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => currentMsg,
    () => null,
  );
}

import * as React from "react";