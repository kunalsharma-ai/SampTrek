'use client';
import { UserCheck } from 'lucide-react';
import { endLoginAs } from '@/lib/api';

/** Shown in a tab an admin opened with "Login as" (feedback 2026-11-24). */
export function LoginAsBanner({ name, by }: { name: string; by: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-info/40 bg-info/10 px-4 py-2.5 text-sm" role="status" data-login-as>
      <UserCheck className="h-4 w-4 shrink-0 text-info" />
      <span className="min-w-0 flex-1">You are logged in as <b>{name}</b> (opened by {by}). Only this tab; your own session is unchanged. It ends after 2 hours.</span>
      <button className="btn-ghost px-3 py-1 text-xs" onClick={endLoginAs}>Close this login</button>
    </div>
  );
}
