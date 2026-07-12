// Reusable toast host — renders the current toast message via a module-level
// pub/sub (see lib/use-toast.ts). One global instance is mounted under the
// router outlet in routes.tsx.

import { useToastMessage } from "@/lib/use-toast";

export function ToastHost() {
  const message = useToastMessage();
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export { pushToast } from "@/lib/use-toast";