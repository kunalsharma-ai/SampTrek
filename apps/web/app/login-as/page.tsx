'use client';
import { useEffect, useState } from 'react';
import { ErrorBox, Loading } from '@/components/ui';
import { API_URL, LOGIN_AS_KEY } from '@/lib/api';

/**
 * Opened in a new tab by "Login as" (feedback 2026-11-24). Swaps the one-time ticket in the address
 * (after #, so it never reaches a server log) for a session that lives in this tab only.
 */
export default function LoginAsPage() {
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const ticket = window.location.hash.slice(1);
    // The ticket leaves the address bar and history at once.
    history.replaceState(null, '', '/login-as');
    if (!ticket) {
      setError({ message: 'This link is incomplete. Click “Login as” again.' });
      return;
    }
    fetch(`${API_URL}/api/v1/auth/login-as/redeem`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw { message: d?.message ?? 'This link has expired. Click “Login as” again.' };
        sessionStorage.setItem(LOGIN_AS_KEY, d.token);
        window.location.replace(d.home ?? '/');
      })
      .catch(setError);
  }, []);
  return (
    <main className="mx-auto max-w-md p-8">
      {error ? <ErrorBox error={error} /> : <Loading label="Opening the account" />}
    </main>
  );
}
