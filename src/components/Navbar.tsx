'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Analyze', href: '/analyze' },
  { label: 'Pipeline', href: '/pipeline' },
  { label: 'Rules', href: '/rules' },
  { label: 'Settings', href: '/settings' },
];

export default function Navbar() {
  const pathname = usePathname();

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
        <Link
          href="/analyze/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/80"
        >
          New Analysis
        </Link>
      </div>
    </nav>
  );
}
