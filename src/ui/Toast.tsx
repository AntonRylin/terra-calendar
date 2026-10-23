import { useEffect } from 'react';
import { useCalendarStore } from '../app/store';
import './toast.css';

export function Toast() {
  const toast = useCalendarStore((s) => s.toast);
  const dismiss = useCalendarStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, 6000);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" onClick={dismiss}>
      {toast}
    </div>
  );
}
