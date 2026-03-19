'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase';

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleUpgrade() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login?redirect=/pricing');
      return;
    }

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Failed to create checkout session');
        setLoading(false);
      }
    } catch {
      alert('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="text-center mb-12">
          <h1
            className="text-3xl font-bold text-foreground mb-2"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            Choose Your Plan
          </h1>
          <p className="text-muted">Professional underwriting at your fingertips</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          {/* Free Tier */}
          <div className="rounded-xl border border-border bg-card p-8">
            <h2 className="text-lg font-semibold text-foreground mb-1">Free Trial</h2>
            <p className="text-muted text-sm mb-6">Get started with DealUW</p>
            <div className="mb-6">
              <span
                className="text-4xl font-bold text-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                $0
              </span>
              <span className="text-muted text-sm ml-1">/ 7 days</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-center gap-2 text-muted">
                <CheckIcon />
                <span>10 property analyses</span>
              </li>
              <li className="flex items-center gap-2 text-muted">
                <CheckIcon />
                <span>Full comp engine</span>
              </li>
              <li className="flex items-center gap-2 text-muted">
                <CheckIcon />
                <span>AI-powered recommendations</span>
              </li>
              <li className="flex items-center gap-2 text-muted">
                <CheckIcon />
                <span>PDF export</span>
              </li>
            </ul>
            <div className="rounded-lg border border-border py-2.5 text-center text-sm text-muted">
              Current Plan
            </div>
          </div>

          {/* Pro Tier */}
          <div className="rounded-xl border-2 border-accent bg-card p-8 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-white">
              RECOMMENDED
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Pro</h2>
            <p className="text-muted text-sm mb-6">For serious wholesalers</p>
            <div className="mb-6">
              <span
                className="text-4xl font-bold text-gold"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                $69
              </span>
              <span className="text-muted text-sm ml-1">/ month</span>
            </div>
            <ul className="space-y-3 mb-8 text-sm">
              <li className="flex items-center gap-2 text-foreground">
                <CheckIcon accent />
                <span>500 analyses per month</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <CheckIcon accent />
                <span>Full comp engine</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <CheckIcon accent />
                <span>AI-powered recommendations</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <CheckIcon accent />
                <span>PDF export</span>
              </li>
              <li className="flex items-center gap-2 text-foreground">
                <CheckIcon accent />
                <span>Priority support</span>
              </li>
            </ul>
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function CheckIcon({ accent }: { accent?: boolean }) {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 ${accent ? 'text-accent' : 'text-muted'}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
