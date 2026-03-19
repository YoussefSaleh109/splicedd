import { useEffect, useState } from "react";

export type ToastType = "error" | "success" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let toastCounter = 0;
let globalAddToast: ((text: string, type: ToastType) => void) | null = null;

export function showToast(text: string, type: ToastType = "error") {
  if (globalAddToast) {
    globalAddToast(text, type);
  }
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    globalAddToast = (text: string, type: ToastType) => {
      const id = ++toastCounter;
      setToasts(prev => [...prev, { id, text, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    };

    return () => {
      globalAddToast = null;
    };
  }, []);

  function removeToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  const bgColors: Record<ToastType, string> = {
    error: "bg-danger-100 border-danger-300 text-danger-700",
    success: "bg-success-100 border-success-300 text-success-700",
    info: "bg-primary-100 border-primary-300 text-primary-700",
  };

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-lg border shadow-md flex items-start gap-2 animate-fade-in ${bgColors[toast.type]}`}
          onClick={() => removeToast(toast.id)}
          style={{ cursor: "pointer" }}
        >
          <span className="text-sm flex-1">{toast.text}</span>
          <span className="text-xs opacity-60">✕</span>
        </div>
      ))}
    </div>
  );
}
