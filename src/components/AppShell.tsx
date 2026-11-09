import Link from 'next/link';
import { ClipboardList,FlaskConical,Users,SlidersHorizontal,Thermometer,ShieldCheck,ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Actor } from '@/lib/rbac';

const navigation = [
  { href: '/assets',label: 'Pipette inventory',icon: ClipboardList },{ href: '/customers',label: 'Customers',icon: Users },
  { href: '/ranges',label: 'Ranges & limits',icon: SlidersHorizontal },{ href: '/instruments',label: 'Lab instruments',icon: Thermometer },
  { href: '/lab-dimensions',label: 'Lab conditions',icon: FlaskConical },
];

export function AppShell({ actor,active,children }: { actor: Actor; active: string; children: ReactNode }) {
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>
    <aside className="sidebar"><Link href="/assets" className="brand"><FlaskConical size={27} /><span>VFL<span className="brand-sub">SCIENCES</span></span></Link>
      <div className="nav-caption">CALIBRATION LAB</div><nav aria-label="Main navigation">{navigation.map(({ href,label,icon: Icon }) => <Link key={href} href={href} className={active===href.slice(1) ? 'nav-link active' : 'nav-link'} aria-current={active===href.slice(1) ? 'page' : undefined}><Icon size={18} />{label}</Link>)}
        {actor.role==='admin' ? <Link href="/users" className={active==='users' ? 'nav-link active' : 'nav-link'}><ShieldCheck size={18} />User access</Link> : null}</nav>
      <div className="sidebar-bottom"><div className="standard-tag">ISO 8655-6:2022</div><span>Gravimetric calibration</span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><span className="topbar-title">Pipette Calibration & Certification</span><div className="user-menu"><span className="avatar">{actor.displayName.slice(0,1)}</span><span>{actor.displayName}<small>{actor.isPreview ? 'Read-only preview' : actor.role}</small></span>{!actor.isPreview ? <Link href="/api/auth/signout" title="Sign out" aria-label="Sign out"><ArrowUpRight size={17} /></Link> : null}</div></header>
      {actor.isPreview ? <div className="preview-banner"><span className="indicator" />Read-only preview<span className="banner-secondary">Sample records · No database connected</span></div> : null}
      <main id="main" className="content">{children}</main><footer className="app-footer">VFL Sciences Private Limited<span>Calibration workspace · v0.1</span></footer>
    </div>
  </div>;
}