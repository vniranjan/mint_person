/**
 * Minimal toast hook — wraps Radix Toast for use across the app.
 * UX-DR12: success (emerald-600), error (red-600/destructive), 4s auto-dismiss.
 *
 * Pattern: import { useToast } from "~/hooks/use-toast"
 *          const { toast } = useToast();
 *          toast({ title: "...", variant: "success" });
 *
 * Architecture: module-level state + listener Set (not array).
 * useRef holds each component's stable dispatch reference so cleanup
 * reliably removes it — prevents the unbounded-growth memory leak.
 */
"use client";

import * as React from "react";
import type { ToastProps } from "~/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000; // 4s auto-dismiss (UX-DR12)

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "success" | "destructive";
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "UPDATE_TOAST":
      return {
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };
    case "DISMISS_TOAST": {
      return {
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || !action.toastId ? { ...t, open: false } : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      return {
        toasts: action.toastId
          ? state.toasts.filter((t) => t.id !== action.toastId)
          : [],
      };
  }
}

// Module-level state — single source of truth shared across all useToast instances.
// Listeners stored in a Set; each component registers a stable function ref via useRef.
type Listener = (state: State) => void;
let memoryState: State = { toasts: [] };
const listeners = new Set<Listener>();

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

export function toast(props: Omit<ToasterToast, "id">) {
  const id = genId();
  dispatch({ type: "ADD_TOAST", toast: { id, open: true, ...props } });
  setTimeout(() => dispatch({ type: "DISMISS_TOAST", toastId: id }), TOAST_REMOVE_DELAY);
  return id;
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  // Store stable listener ref so cleanup can reliably remove the exact same function.
  const listenerRef = React.useRef<Listener | null>(null);
  if (!listenerRef.current) {
    listenerRef.current = (s: State) => setState(s);
  }

  React.useEffect(() => {
    const listener = listenerRef.current!;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toastFn = React.useCallback(
    (props: Omit<ToasterToast, "id">) => {
      return toast(props);
    },
    [],
  );

  return {
    toasts: state.toasts,
    toast: toastFn,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}
