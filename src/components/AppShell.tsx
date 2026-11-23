import Link from 'next/link';
import { ClipboardList,ShieldCheck,LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Actor } from '@/lib/rbac';
import { db } from '@/lib/db';
import { signOut } from '@/lib/auth';

const navigation = [
  { href: '/assets',label: 'Pipette inventory',icon: ClipboardList },
];

/** Inactive accounts include new signups awaiting approval, so administrators see them without opening User access. */
async function inactiveUserCount(actor: Actor) {
  if (actor.isPreview || actor.role!=='admin') return 0;
  try { return await db.user.count({ where: { isActive: false } }); } catch { return 0; }
}

export async function AppShell({ actor,active,children }: { actor: Actor; active: string; children: ReactNode }) {
  const pendingCount = await inactiveUserCount(actor);
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar"><Link href="/assets" className="brand"><img src="/VFL_Logo.png" alt="VFL Sciences logo" className="brand-logo" /></Link>
      <div className="nav-caption">CALIBRATION LAB</div><nav aria-label="Main navigation">{navigation.map(({ href,label,icon: Icon }) => <Link key={href} href={href} className={active===href.slice(1) ? 'nav-link active' : 'nav-link'} aria-current={active===href.slice(1) ? 'page' : undefined}><Icon size={18} />{label}</Link>)}
        {actor.role==='admin' ? <Link href="/users" className={active==='users' ? 'nav-link active' : 'nav-link'}><ShieldCheck size={18} />User access{pendingCount>0 ? <span className="nav-badge" title="Accounts awaiting approval or inactive" aria-label={`${pendingCount} awaiting approval`}>{pendingCount}</span> : null}</Link> : null}</nav>
      <div className="sidebar-bottom"><div className="standard-tag">ISO 8655-6:2022</div><span>Gravimetric calibration</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span className="topbar-title">Pipette Calibration & Certification</span><div className="user-menu"><span className="avatar">{actor.displayName.slice(0,1)}</span><span>{actor.displayName}<small>{actor.isPreview ? 'Read-only preview' : actor.role}</small></span>{!actor.isPreview ? <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}><button type="submit" className="icon-button sign-out-button" title="Sign out" aria-label="Sign out"><LogOut size={17} /></button></form> : null}</div></header>
      {actor.isPreview ? <div className="preview-banner"><span className="indicator" />Read-only preview<span className="banner-secondary">Sample records · No database connected</span></div> : null}
      <main id="main" className="content">{children}</main><footer className="app-footer">VFL Sciences Private Limited<span>Calibration workspace · v0.1</span></footer>
    </div>
  </div>;
}