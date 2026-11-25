'use client';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { post } from '@/lib/api';

/**
 * "Login as" (feedback 2026-11-24): opens SampTrek in a new tab as this user, without their password.
 * The new tab gets its own session; this tab stays signed in as you.
 */
export function LoginAsButton({ userId, name, onError, className = 'btn-ghost px-2.5 py-1 text-xs' }: { userId: string; name: string; onError: (e: unknown) => void; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      title={`Open SampTrek as ${name} in a new tab`}
      aria-label={`Login as ${name}`}
      onClick={async () => {
        // Opened before the request, so the browser does not treat it as a pop-up.
        const w = window.open('about:blank', '_blank');
        setBusy(true);
        try {
          const r = await post<{ url: string }>(`/auth/login-as/${userId}`);
          if (w) {
            w.opener = null;
            w.location.href = r.url;
          } else window.open(r.url, '_blank', 'noopener');
        } catch (e) {
          w?.close();
          onError(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      <LogIn className="h-3.5 w-3.5" /> Login as
    </button>
  );
}
