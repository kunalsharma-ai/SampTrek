'use client';
import clsx from 'clsx';
import { ChevronDown, ChevronsLeft, ChevronsRight, Clock, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { canEdit, useMe } from '@/components/me';
import { BrandIcon, ProductLogo } from '@/components/brand-mark';
import { DEFAULT_BRAND } from '@/lib/branding';
import { useTheme } from '@/components/theme';
import { isActive, NAV_GROUP_ICON, NAV_GROUP_LABEL, NAV_GROUPS, visibleNav, type NavGroup, type NavItem } from './nav';

const OPEN_KEY = 'samptrek:nav-open';
/** Groups opened by hand, remembered in this browser. */
function readOpen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Collapsible navigation with favorites and recent projects. Compact mode shows icons with labels on hover/focus. */
export function Sidebar({ mobileOpen, onClose, badges = {} }: { mobileOpen: boolean; onClose: () => void; badges?: Record<string, number> }) {
  const { prefs, update } = useTheme();
  const me = useMe();
  const brand = me?.branding ?? DEFAULT_BRAND;
  const pathname = usePathname();
  const compact = prefs.sidebarCollapsed;
  const items = visibleNav(me?.user.role, me?.features);
  const favorites = prefs.favorites.map((h) => items.find((n) => n.href === h)).filter((n): n is NavItem => !!n);
  const toggleFav = (href: string) =>
    update({ favorites: prefs.favorites.includes(href) ? prefs.favorites.filter((f) => f !== href) : [...prefs.favorites, href].slice(0, 20) });

  // Compact menu (feedback 2026-11-18): each main menu folds its pages away as a sub menu, so the
  // whole menu fits without scrolling. The group of the open page is always open; others open on click.
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => setOpen(readOpen()), []);
  const setOpenSaved = (next: string[]) => {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* private window */ }
  };
  const activeGroup = items.find((n) => isActive(pathname, n.href))?.group;
  const isOpen = (g: string) => g === 'Main' || g === activeGroup || open.includes(g);
  const toggleGroup = (g: string) => setOpenSaved(isOpen(g) && g !== activeGroup ? open.filter((x) => x !== g) : [...open.filter((x) => x !== g), g]);
  // The product tour can point at a page inside a closed group.
  useEffect(() => {
    const reveal = (e: Event) => {
      const g = items.find((n) => n.href === (e as CustomEvent<string>).detail)?.group;
      if (g) setOpen((o) => (o.includes(g) ? o : [...o, g]));
    };
    window.addEventListener('samptrek:nav-reveal', reveal);
    return () => window.removeEventListener('samptrek:nav-reveal', reveal);
  }, [items]);
  const [flyout, setFlyout] = useState<{ g: NavGroup; top: number; left: number } | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!flyout) return;
    const close = (e: MouseEvent) => !flyRef.current?.contains(e.target as Node) && setFlyout(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFlyout(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [flyout]);
  useEffect(() => setFlyout(null), [pathname]);

  const Item = ({ n, fav }: { n: NavItem; fav?: boolean }) => {
    const active = isActive(pathname, n.href);
    const starred = prefs.favorites.includes(n.href);
    return (
      <div className="group/item relative">
        <Link
          href={n.href}
          data-tour={fav ? undefined : `nav:${n.href}`}
          aria-current={active ? 'page' : undefined}
          title={compact ? n.label : undefined}
          className={clsx(
            'nav-item relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm outline-offset-0 transition-colors duration-[var(--dur)]',
            compact && 'lg:justify-center lg:px-0',
            active ? 'bg-sidebar-ink/10 font-medium text-sidebar-ink' : 'text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink',
          )}
        >
          {active && <span className="nav-bar absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sidebar-active anim-pop" aria-hidden />}
          <n.icon className={clsx('h-[18px] w-[18px] shrink-0 transition-transform duration-[var(--dur)] group-hover/item:scale-110', active && 'text-sidebar-active')} aria-hidden />
          <span className={clsx('truncate', compact && 'lg:sr-only')}>{n.label}</span>
          {!!badges[n.href] && (
            <span
              className={clsx('ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-active px-1.5 text-[11px] font-semibold text-sidebar', compact && 'lg:absolute lg:right-1 lg:top-0.5 lg:ml-0 lg:h-4 lg:min-w-4 lg:text-[10px]', !compact && 'mr-6')}
              aria-label={`${badges[n.href]} new`}
            >
              {badges[n.href] > 99 ? '99+' : badges[n.href]}
            </span>
          )}
        </Link>
        {!compact && (
          <button
            type="button"
            onClick={() => toggleFav(n.href)}
            aria-label={starred ? `Remove ${n.label} from favorites` : `Add ${n.label} to favorites`}
            aria-pressed={starred}
            className={clsx(
              'absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-sidebar-muted hover:text-sidebar-ink focus-visible:opacity-100',
              starred && !fav ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100 max-lg:opacity-60',
            )}
          >
            <Star className={clsx('h-3.5 w-3.5', starred && 'fill-current text-sidebar-active')} />
          </button>
        )}
      </div>
    );
  };

  const Heading = ({ children }: { children: React.ReactNode }) => (
    <div className={clsx('px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted', compact && 'lg:sr-only')}>{children}</div>
  );

  /** A main menu: a button that opens its pages below it (or beside it, as a flyout, when the sidebar is narrow). */
  const Group = ({ g, label, list }: { g: NavGroup; label: string; list: NavItem[] }) => {
    const Icon = NAV_GROUP_ICON[g];
    const expanded = isOpen(g);
    const holdsActive = g === activeGroup;
    const count = list.reduce((a, n) => a + (badges[n.href] ?? 0), 0);
    return (
      <div className="pt-1">
        <button
          type="button"
          aria-expanded={compact ? flyout?.g === g : expanded}
          title={compact ? label : undefined}
          onClick={(e) => {
            if (compact && window.matchMedia('(min-width: 1024px)').matches) {
              const r = e.currentTarget.getBoundingClientRect();
              setFlyout(flyout?.g === g ? null : { g, top: Math.min(r.top, window.innerHeight - 40 * list.length - 60), left: r.right + 8 });
            } else toggleGroup(g);
          }}
          className={clsx(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors duration-[var(--dur)]',
            compact && 'lg:justify-center lg:px-0',
            holdsActive ? 'text-sidebar-ink' : 'text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink',
          )}
        >
          <Icon className={clsx('h-[18px] w-[18px] shrink-0', holdsActive && 'text-sidebar-active')} aria-hidden />
          <span className={clsx('flex-1 truncate', compact && 'lg:sr-only')}>{label}</span>
          {count > 0 && !expanded && <span className={clsx('grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-active px-1.5 text-[11px] font-semibold text-sidebar', compact && 'lg:hidden')}>{count > 99 ? '99+' : count}</span>}
          <ChevronDown className={clsx('h-4 w-4 shrink-0 transition-transform duration-[var(--dur)]', expanded ? 'rotate-0' : '-rotate-90', compact && 'lg:hidden')} aria-hidden />
        </button>
        {expanded && (
          <div className={clsx('mt-0.5 space-y-0.5 border-l border-sidebar-ink/10 pl-2 ml-[21px]', compact && 'lg:hidden')}>
            {list.map((n) => <Item key={n.href} n={n} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      aria-label="Main navigation"
      className={clsx(
        'neon-rail fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-ink/10 bg-sidebar text-sidebar-ink transition-[transform,width] duration-[var(--dur-slow)] ease-[var(--ease)] lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
        compact ? 'lg:w-[72px]' : 'lg:w-64',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className={clsx('flex h-16 shrink-0 items-center justify-between px-4', compact && 'lg:justify-center lg:px-0')}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight">
          {brand.custom ? (
            <>
              <BrandIcon brand={brand} />
              <span className={clsx('min-w-0 leading-tight', compact && 'lg:sr-only')}>
                <span className="block truncate text-[15px] font-bold tracking-wide">{brand.appName}</span>
                <span className="block truncate text-[11px] font-normal text-sidebar-muted">{brand.tagline ?? 'Research project management'}</span>
              </span>
            </>
          ) : (
            <>
              {/* SampTrek's full logo; only the icon when the sidebar is collapsed. */}
              <BrandIcon brand={brand} className={clsx('hidden', compact && 'lg:block')} />
              <ProductLogo surface="sidebar" className={clsx('h-12', compact && 'lg:hidden')} />
            </>
          )}
        </Link>
        <button className="rounded p-1 lg:hidden" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Heading>Favorites</Heading>
        {favorites.length > 0 ? (
          <div className="space-y-0.5">{favorites.map((n) => <Item key={`f-${n.href}`} n={n} fav />)}</div>
        ) : (
          <p className={clsx('flex items-center gap-1.5 px-3 pb-1 text-xs text-sidebar-muted', compact && 'lg:hidden')}>
            <Star className="h-3 w-3 shrink-0" aria-hidden /> Click the star next to any page to pin it here.
          </p>
        )}
        {NAV_GROUPS.map((g) => {
          const list = items.filter((n) => n.group === g);
          if (!list.length) return null;
          const label = NAV_GROUP_LABEL[g];
          if (!label) return <div key={g} className="space-y-0.5 pt-3">{list.map((n) => <Item key={n.href} n={n} />)}</div>;
          return <Group key={g} g={g} label={label} list={list} />;
        })}
        {flyout && (
          <div ref={flyRef} role="menu" aria-label={NAV_GROUP_LABEL[flyout.g] ?? ''} className="fixed z-50 hidden w-60 rounded-xl border border-sidebar-ink/10 bg-sidebar p-2 text-sidebar-ink shadow-xl lg:block" style={{ top: Math.max(8, flyout.top), left: flyout.left }}>
            <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{NAV_GROUP_LABEL[flyout.g]}</div>
            {items.filter((n) => n.group === flyout.g).map((n) => (
              <Link key={n.href} href={n.href} role="menuitem" className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm', isActive(pathname, n.href) ? 'bg-sidebar-ink/10 font-medium' : 'text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink')}>
                <n.icon className="h-4 w-4 shrink-0" aria-hidden /> <span className="truncate">{n.label}</span>
                {!!badges[n.href] && <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-sidebar-active px-1.5 text-[11px] font-semibold text-sidebar">{badges[n.href]}</span>}
              </Link>
            ))}
          </div>
        )}
        {prefs.recentProjects.length > 0 && (
          <>
            <Heading>Recent projects</Heading>
            <div className="space-y-0.5">
              {prefs.recentProjects.slice(0, 5).map((p) => {
                const href = `/projects/${p.id}`;
                const active = pathname === href;
                return (
                  <Link
                    key={p.id}
                    href={href}
                    title={compact ? `${p.code} · ${p.name}` : p.name}
                    className={clsx('flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors duration-[var(--dur)]', compact && 'lg:justify-center lg:px-0', active ? 'bg-sidebar-ink/10 text-sidebar-ink' : 'text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink')}
                  >
                    <Clock className="h-4 w-4 shrink-0" aria-hidden />
                    <span className={clsx('min-w-0 truncate', compact && 'lg:sr-only')} translate="no">
                      <span className="font-mono text-xs">{p.code}</span> <span className="opacity-80">{p.name}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>

      <div className="hidden shrink-0 border-t border-sidebar-ink/10 p-3 lg:block">
        <button
          type="button"
          onClick={() => update({ sidebarCollapsed: !compact })}
          className={clsx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted hover:bg-sidebar-ink/5 hover:text-sidebar-ink', compact && 'justify-center px-0')}
          aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'}
          title="Toggle sidebar ( [ )"
        >
          {compact ? <ChevronsRight className="h-[18px] w-[18px]" /> : <><ChevronsLeft className="h-[18px] w-[18px]" /> Collapse</>}
        </button>
      </div>
    </aside>
  );
}
