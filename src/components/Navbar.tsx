'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const navItems = [
  { label: 'Analyze', href: '/analyze' },
  { label: 'Pipeline', href: '/pipeline' },
  { label: 'Rules', href: '/rules' },
  { label: 'Settings', href: '/settings' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <div className="flex flex-col">
          <span
            className="text-xl font-bold tracking-wide text-accent"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            DealUW
          </span>
          <span className="text-[10px] text-muted -mt-1">by Arctic Acquisitions</span>
        </div>

        {/* Center Nav */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-muted hover:text-foreground hover:bg-white/5'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {!loading && user ? (
            <>
              {profile && (
                <div className="flex items-center gap-2">
                  {profile.subscription_tier === 'admin' && (
                    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold text-gold">
                      Admin
                    </span>
                  )}
                  {profile.subscription_tier === 'pro' && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent">
                      Pro
                    </span>
                  )}
                  {profile.subscription_tier !== 'admin' && (
                    <span
                      className="text-xs text-muted"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {profile.analysis_count ?? 0}/{profile.analysis_limit ?? 10}
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-muted truncate max-w-[140px]">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground hover:border-foreground/20"
              >
                Logout
              </button>
            </>
          ) : !loading ? (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80"
            >
              Sign In
            </Link>
          ) : null}
          <Link
            href="/analyze"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80"
          >
            New Analysis
          </Link>
        </div>
      </div>
    </nav>
  );
}
