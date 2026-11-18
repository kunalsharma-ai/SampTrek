'use client';
import { ArrowDown, ArrowUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorBox, Loading, Section, Toggle } from '@/components/ui';
import { api, get } from '@/lib/api';
import type { AiSettings, AiStatus } from '@/lib/ai';
import { Label } from '@/components/help';

interface Usage { byDay: { day: string; requests: number; failed: number; prompt: number; output: number }[]; today: { name: string; requests: number; tokens: number }[]; recentErrors: { createdAt: string; model: string; kind: string; error: string | null }[]; actions: Record<string, number> }
const ALL_PROVIDERS: [string, string][] = [['gemini', 'Google Gemini'], ['anthropic', 'Anthropic Claude'], ['openai', 'OpenAI'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'], ['mistral', 'Mistral'], ['deepseek', 'DeepSeek'], ['openai_compatible', 'Own AI server']];
const ROLES = [['ADMIN', 'Admins'], ['PROJECT_MANAGER', 'Project managers'], ['SALES', 'Sales'], ['VIEWER', 'Viewers']] as const;

/** Admin controls for the AI copilot: who can use it, what it may do, and daily limits. */
export function AiCopilotSettings() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [s, setS] = useState<AiSettings | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    get<AiStatus>('/ai/status').then((x) => { setStatus(x); setS(x.settings ?? null); }).catch(setError);
    get<Usage>('/ai/usage').then(setUsage).catch(() => undefined);
  }, []);
  if (!status || !s) return <Section title="AI copilot" className="mb-6">{error ? <ErrorBox error={error} /> : <Loading />}</Section>;
  const set = (p: Partial<AiSettings>) => { setS({ ...s, ...p }); setSaved(false); };
  const save = async () => {
    setError(null);
    try { setS(await api<AiSettings>('/ai/settings', { method: 'PUT', json: s })); setSaved(true); } catch (e) { setError(e); }
  };
  const num = (k: 'perUserPerMinute' | 'perUserDaily' | 'orgDaily', label: string, max: number) => (
    <label className="block"><span className="label">{label}</span><input type="number" min={1} max={max} className="input" value={s[k]} onChange={(e) => set({ [k]: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })} /></label>
  );
  const week = usage?.byDay.slice(-7) ?? [];
  const order = [...(s.providers ?? []), ...ALL_PROVIDERS.map(([k]) => k).filter((k) => !(s.providers ?? []).includes(k))];
  const ready = new Map(status.providers.map((p) => [p.kind, p]));
  const move = (i: number, by: number) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    set({ providers: next });
  };
  let n = 0;
  return (
    <Section id="ai" title="AI copilot" className="mb-6" actions={<button className="btn-primary" onClick={save}>{saved ? 'Saved' : 'Save'}</button>}>
      <div className="space-y-5">
        <ErrorBox error={error} />
        <p className="text-sm text-muted">
          {status.configured
            ? <>Answers come from <b className="font-medium text-ink">{status.providerLabel}</b> (<code className="font-mono text-xs">{status.model}</code>){status.providers.length > 1 ? <>, then the next provider below when it is busy, out of its free allowance or refuses the key</> : null}. Voice: {status.liveModel ? <>Gemini Live <code className="font-mono text-xs">{status.liveModel}</code></> : 'the browser’s speech (live voice needs Gemini)'}. Keys are stored encrypted and never sent to browsers.</>
            : <>Not set up yet: add a key for Gemini, Claude, OpenAI, Groq, OpenRouter, Mistral, DeepSeek or your own server in <Link href="/settings/integrations" className="text-brand hover:underline">Integrations</Link>. Gemini, Groq, OpenRouter and Mistral have free tiers.</>}
        </p>
        <div>
          <Label>AI providers, in the order they are tried</Label>
          <ol className="divide-y divide-line rounded-lg border border-line">
            {order.map((k, i) => {
              const p = ready.get(k);
              const label = p?.label ?? ALL_PROVIDERS.find(([x]) => x === k)?.[1] ?? k;
              return (
                <li key={k} className={`flex items-center gap-3 px-3 py-2 text-sm ${p ? '' : 'text-muted'}`}>
                  <span className="w-5 text-right tabular-nums text-xs text-muted">{p ? ++n : ''}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{label}</div>
                    <div className="truncate text-xs text-muted">
                      {p ? <>{p.model}{p.fallbackModel ? <> → {p.fallbackModel}</> : null}{p.files.length ? ' · reads PDFs or images' : ' · text only'}{p.voice ? ' · live voice' : ''}</> : <Link href={`/settings/integrations#${k}`} className="text-brand hover:underline">Not set up: add a key</Link>}
                    </div>
                  </div>
                  <button type="button" className="btn-ghost p-1" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className="btn-ghost p-1" aria-label={`Move ${label} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ol>
          <p className="mt-1 text-xs text-muted">Each provider tries its main model, then its fallback model, then hands over to the next one. Files are only sent to providers that can read them. Press Save after changing the order.</p>
        </div>
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">On free tiers (Gemini, Groq, OpenRouter :free models, Mistral Experiment) the provider may use prompts and answers to improve its products. That includes the project, client and finance details the copilot looks up. Use a paid key or your own server before using it with confidential client work.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([['enabled', 'Copilot on', 'Ask questions in the app'], ['actions', 'Propose changes', 'Tasks, project status, vendor links; always confirmed by the person'], ['documents', 'Read uploaded files', 'PDF, text and images up to 10 MB'], ['voice', 'Voice', 'Talk with Gemini Live, or the browser’s speech with any provider']] as const).map(([k, label, hint]) => (
            <div key={k} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <div className="min-w-0 text-sm"><div className="font-medium">{label}</div><div className="text-xs text-muted">{hint}</div></div>
              <Toggle checked={s[k]} onChange={(v) => set({ [k]: v })} label={label} />
            </div>
          ))}
        </div>
        <div>
          <Label>Who can use it</Label>
          <div className="flex flex-wrap gap-4">
            {ROLES.map(([r, label]) => (
              <label key={r} className="inline-flex items-center gap-2 text-sm"><input type="checkbox" disabled={r === 'ADMIN'} checked={r === 'ADMIN' || s.roles.includes(r)} onChange={(e) => set({ roles: e.target.checked ? [...s.roles, r] : s.roles.filter((x) => x !== r) })} />{label}</label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Client and vendor portal users never have the copilot. Each person only sees what their role can see.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {num('perUserPerMinute', 'Questions per person per minute', 60)}
          {num('perUserDaily', 'Questions per person per day', 5000)}
          {num('orgDaily', 'Questions for everyone per day', 100000)}
        </div>
        <p className="-mt-2 text-xs text-muted">Keep these near your providers&rsquo; free limits. When one runs out, the copilot moves to its fallback model and then to the next provider in the list.</p>
        {usage && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Last 7 days</h3>
              {week.length === 0 ? <p className="text-sm text-muted">No use yet.</p> : (
                <table className="w-full text-sm"><thead><tr><th className="th">Day</th><th className="th text-right">Questions</th><th className="th text-right">Failed</th><th className="th text-right">Tokens</th></tr></thead>
                  <tbody>{week.map((d) => <tr key={d.day} className="border-t border-line"><td className="td">{d.day}</td><td className="td text-right tabular-nums">{d.requests}</td><td className="td text-right tabular-nums">{d.failed}</td><td className="td text-right tabular-nums">{(d.prompt + d.output).toLocaleString()}</td></tr>)}</tbody></table>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Today by person</h3>
              {usage.today.length === 0 ? <p className="text-sm text-muted">No questions today.</p> : (
                <table className="w-full text-sm"><thead><tr><th className="th">Person</th><th className="th text-right">Questions</th><th className="th text-right">Tokens</th></tr></thead>
                  <tbody>{usage.today.map((d) => <tr key={d.name} className="border-t border-line"><td className="td">{d.name}</td><td className="td text-right tabular-nums">{d.requests}</td><td className="td text-right tabular-nums">{d.tokens.toLocaleString()}</td></tr>)}</tbody></table>
              )}
              {usage.recentErrors[0] && <p className="mt-2 text-xs text-muted">Last error: {usage.recentErrors[0].error}</p>}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
