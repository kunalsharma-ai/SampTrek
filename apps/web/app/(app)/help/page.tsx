'use client';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader, Section } from '@/components/ui';

/** A numbered arrow on a screenshot: x and y are where it points, in % of the picture. */
interface Callout { x: number; y: number; text: string; /** Where the number sits, in %, when the default spot would cover something. */ from?: [number, number] }
interface Guide { id: string; title: string; intro: string; image: string; alt: string; callouts: Callout[]; tips?: string[] }

const W = 1600;
const H = 1000;

const GUIDES: Guide[] = [
  {
    id: 'start', title: 'Find your way around', image: '/help/dashboard.jpg', alt: 'The dashboard',
    intro: 'The dashboard shows your projects, clients, vendors and live traffic. The menu on the left opens every page.',
    callouts: [
      { x: 67, y: 3.5, from: [60, 10], text: 'New project starts the Create project form from any page.' },
      { x: 30, y: 3.5, from: [45, 10], text: 'Search finds projects, clients, vendors and surveys. Press Ctrl K from anywhere.' },
      { x: 10, y: 31, text: 'The menu: Clients, Vendors, Projects and Reports first, then fieldwork, finance and Admin.' },
      { x: 29.5, y: 11.5, text: 'Every (i) explains the item next to it: what it is, how to use it and where it applies.' },
    ],
  },
  {
    id: 'create', title: 'Create a project', image: '/help/create-project.jpg', alt: 'The Create project form',
    intro: 'Fill in the basics once, add your target markets, choose devices and security, and save.',
    callouts: [
      { x: 35, y: 21, text: 'Start from a blank project, a template or a won bid.' },
      { x: 59, y: 49, text: 'Category. When a Survey library set is ticked for this category, its gate survey is filled in for you.' },
      { x: 33, y: 60, text: 'Client, category and project manager can be changed later from the project page.' },
      { x: 95, y: 60.5, text: 'Devices and systems allowed: Windows, Mac, Linux on desktop; Android, iOS on mobile and tablet.' },
      { x: 95, y: 85, text: 'Security switches, including the gate survey. Vendors can have their own settings.' },
    ],
    tips: [
      'Target markets: click Template to download the Excel file, fill one row per market, then Upload Excel. Pasting copied cells still works with Paste.',
      'The client survey link must contain {uid}. SampTrek puts the respondent ID (UID) there, and the client sends it back on the redirect.',
      'Target group is typed per market and is not saved as a dropdown option.',
    ],
  },
  {
    id: 'project', title: 'Run a project', image: '/help/project-page.jpg', alt: 'A project page',
    intro: 'The project page shows live status, money and the tabs: Overview, Client unique links, Vendors & links, Vendor unique links and more.',
    callouts: [
      { x: 67, y: 20, from: [80, 11], text: 'Status: switch between Test, Live, On hold and Closed. Test traffic is never billed.' },
      { x: 59, y: 20, from: [66, 11], text: 'Redirects: the links the client survey sends respondents back to.' },
      { x: 48, y: 20, from: [56, 12], text: 'Client dashboard: a live link to share with the client.' },
      { x: 25, y: 32, text: 'Completes, terminates, quota full and quality: updated live.' },
      { x: 88, y: 62, text: 'Revenue, vendor cost and profit for each currency.' },
    ],
  },
  {
    id: 'vendors-links', title: 'Add vendors and share links', image: '/help/vendors-links.jpg', alt: 'The Vendors & links tab',
    intro: 'Each vendor gets its own entry link per market. Their respondent ID goes in the link variable (for example ?vid=[UID]).',
    callouts: [
      { x: 45, y: 17, text: 'Name vendors see: Work order + survey ID unless you change it.' },
      { x: 94, y: 26.5, text: 'Group by vendor (default) or by market.', from: [80, 12] },
      { x: 86, y: 37.5, from: [72, 50], text: 'Copy all links of the project. Each vendor card also has Copy all links, Security and View report.' },
      { x: 93, y: 65, text: 'Add vendor. With a payout share set on the vendor, the payout fills in from the client CPI.' },
      { x: 84, y: 84, text: 'Live link and Test link. A test link works without a real ID: SampTrek makes a TEST- ID for you.' },
    ],
    tips: [
      'View report on a vendor card lists every respondent: UID, respondent ID, country, IP, target group, LOI, status, gate answers, start and end time. Choose 10, 25 or 100 per page, search, pick fields and download.',
      'Security on a vendor card sets switches for that vendor in this project only. Vendors → a vendor → Security sets them for every project.',
    ],
  },
  {
    id: 'security', title: 'Gate survey and security', image: '/help/gate-security.jpg', alt: 'The Gate & security tab',
    intro: 'Choose which checks run before the client survey. Live links block; test links run every check but only log it.',
    callouts: [
      { x: 69, y: 28, text: 'Gate survey: your screening questions before the client survey.' },
      { x: 69, y: 46.5, from: [60, 41], text: 'Captcha: a free human check.' },
      { x: 69, y: 65, from: [60, 58], text: 'Duplicate detection stops the same IP and browser coming in again, including in another tab.' },
      { x: 86, y: 79, text: 'Open test entry to walk through the gate as a respondent.' },
    ],
  },
  {
    id: 'audience', title: 'Add questions to audience sets', image: '/help/audience-sets.jpg', alt: 'The Audience question sets window',
    intro: 'Audience sets are ready gate surveys. Change them once in Admin → Survey and every new project in that category starts with them.',
    callouts: [
      { x: 29, y: 52.5, from: [17, 60], text: 'Add to project copies the set into this project, where you can still change it.' },
      { x: 39, y: 52.5, from: [50, 45], text: 'See questions before adding.' },
      { x: 63, y: 91, text: "Save this project's questions as a new set for your team." },
    ],
    tips: [
      'To add a question to a set: open Admin → Survey, pick the set, click Add question (or Library for a ready demographic question), type the question and answers, choose which answers qualify or screen out, then Save.',
      'Tick the project categories under the set name. A new project in that category starts with this set.',
    ],
  },
  {
    id: 'vendor-setup', title: 'Set up a vendor', image: '/help/vendors.jpg', alt: 'The Vendors page',
    intro: 'Vendors are your sample suppliers. Their page holds the payout share, link variable, redirects and security.',
    callouts: [
      { x: 42.5, y: 19, from: [52, 28], text: 'Add vendor: name, code, payout share % (10 USD × 60% = 6 USD payout), auto assign, link variable and redirects.' },
      { x: 33, y: 19, from: [28, 32], text: 'Bulk add vendors from a file.' },
      { x: 46, y: 36, text: 'Score from the last 180 days. The list also shows projects, completes after reconcile, success and expense.' },
      { x: 77, y: 36, text: 'Redirect setup for the vendor.' },
    ],
  },
  {
    id: 'respondents', title: 'Check respondents', image: '/help/respondents.jpg', alt: 'The Respondents tab',
    intro: 'Every session with its vendor, market, status and why it ended.',
    callouts: [
      { x: 93, y: 12, text: 'Include test sessions to see your own test runs.' },
      { x: 48.5, y: 36, text: 'Status: complete, terminate, quota full, quality fail or security.' },
      { x: 58, y: 61, text: 'The reason, for example did not qualify on the prescreener.' },
    ],
  },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'What are UID and VID?', a: 'UID is the respondent ID shared between you and the client: SampTrek puts it in the client survey link where {uid} is, and the client sends it back on the redirect. VID is the vendor’s own respondent ID: it comes in on the vendor entry link (for example ?vid=…) and goes back to the vendor on their redirect.' },
  { q: 'Why will my survey link not save?', a: 'A live client survey link must contain {uid}, for example https://survey.example.com/s/123?rid={uid}. Without it the client cannot send the respondent back.' },
  { q: 'Can one IP open the survey in two tabs?', a: 'Not on a live link: while one session from an IP is still open, a second one from the same IP ends as Duplicate, even with duplicate detection off. Test links run every check but never block, so QA can click through. Test links end in test=1 so you can tell them apart.' },
  { q: 'Why does the report show an IP ID instead of the IP?', a: 'SampTrek never stores raw IP addresses (privacy). The report shows a short ID made from the IP, so the same IP always shows the same ID.' },
  { q: 'What is the Form gallery?', a: 'A showcase of the form controls used in SampTrek (date pickers, dropdowns and so on). Nothing on it is saved. It is now only in the menu for the Super Admin.' },
  { q: 'How do I remove a target group someone saved before?', a: 'Target groups are no longer saved as dropdown options. Old ones can be removed in Settings → Dropdown options.' },
];

function Shot({ g }: { g: Guide }) {
  return (
    <figure className="relative overflow-hidden rounded-lg border border-line bg-sunken">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={g.image} alt={g.alt} className="block h-auto w-full" loading="lazy" width={1200} height={750} />
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <marker id={`arrow-${g.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#e11d48" />
          </marker>
        </defs>
        {g.callouts.map((c, i) => {
          const tx = (c.x / 100) * W;
          const ty = (c.y / 100) * H;
          // The number sits towards the middle of the picture, and the arrow points out to the spot.
          const bx = c.from ? (c.from[0] / 100) * W : Math.min(W - 40, Math.max(40, tx + (tx > W / 2 ? -140 : 140)));
          const by = c.from ? (c.from[1] / 100) * H : Math.min(H - 40, Math.max(40, ty + (ty > H / 2 ? -110 : 110)));
          const len = Math.hypot(tx - bx, ty - by);
          const sx = bx + ((tx - bx) / len) * 26;
          const sy = by + ((ty - by) / len) * 26;
          const ex = tx - ((tx - bx) / len) * 18;
          const ey = ty - ((ty - by) / len) * 18;
          return (
            <g key={i}>
              <circle cx={tx} cy={ty} r={16} fill="none" stroke="#e11d48" strokeWidth={4} />
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#e11d48" strokeWidth={5} markerEnd={`url(#arrow-${g.id})`} />
              <circle cx={bx} cy={by} r={24} fill="#e11d48" stroke="#fff" strokeWidth={4} />
              <text x={bx} y={by + 9} textAnchor="middle" fontSize={26} fontWeight={700} fill="#fff">{i + 1}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** Help: the main pages with numbered arrows on screenshots, step text and common questions. */
export default function HelpPage() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const guides = useMemo(() => GUIDES.filter((g) => !term || [g.title, g.intro, ...g.callouts.map((c) => c.text), ...(g.tips ?? [])].join(' ').toLowerCase().includes(term)), [term]);
  const faq = FAQ.filter((f) => !term || `${f.q} ${f.a}`.toLowerCase().includes(term));
  return (
    <>
      <PageHeader title="Help" subtitle="How SampTrek works, page by page. Numbers on each picture match the steps beside it. Every (i) on a page also explains that item. Pictures may look slightly different from your screen." />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help, e.g. vendor link" aria-label="Search help" />
        </label>
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="Help topics">
          {GUIDES.map((g) => <a key={g.id} href={`#${g.id}`} className={clsx('rounded-full border border-line px-3 py-1 hover:bg-surface-2', !guides.includes(g) && 'opacity-40')}>{g.title}</a>)}
          <a href="#faq" className="rounded-full border border-line px-3 py-1 hover:bg-surface-2">Questions</a>
        </nav>
      </div>
      <div className="space-y-6">
        {guides.map((g) => (
          <Section key={g.id} id={g.id} title={g.title}>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Shot g={g} />
              <div className="space-y-3 text-sm">
                <p className="text-muted">{g.intro}</p>
                <ol className="space-y-2">
                  {g.callouts.map((c, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">{i + 1}</span>
                      <span>{c.text}</span>
                    </li>
                  ))}
                </ol>
                {g.tips && (
                  <ul className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-xs">
                    {g.tips.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </Section>
        ))}
        <Section id="faq" title="Common questions">
          {faq.length ? (
            <div className="divide-y divide-line">
              {faq.map((f) => (
                <details key={f.q} className="py-3 text-sm">
                  <summary className="cursor-pointer font-medium">{f.q}</summary>
                  <p className="mt-2 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          ) : <p className="text-sm text-muted">Nothing matches “{q}”.</p>}
        </Section>
      </div>
    </>
  );
}
