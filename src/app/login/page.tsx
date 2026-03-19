'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/analyze/new';

  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!tosAccepted) {
      setError('You must agree to the Terms of Service to continue.');
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          company,
          tos_accepted: tosAccepted,
          email_consent: emailConsent,
          sms_consent: smsConsent,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Auto-confirm is enabled, so user is immediately signed in
    if (data.user) {
      router.push(redirect);
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <h1
              className="text-3xl font-bold text-accent mb-1"
              style={{ fontFamily: "'Cinzel', serif" }}
            >
              DealUW
            </h1>
          </Link>
          <p className="text-muted text-sm">Smart Property Underwriting</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-8">
          {/* Tabs */}
          <div className="flex mb-6 rounded-lg bg-background p-1">
            <button
              onClick={() => { setTab('login'); setError(''); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'login'
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Log In
            </button>
            <button
              onClick={() => { setTab('signup'); setError(''); }}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                tab === 'signup'
                  ? 'bg-accent/10 text-accent'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-pass/10 border border-pass/20 px-4 py-3 text-sm text-pass">
              {error}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Enter your password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div>
                <label className="block text-xs text-muted mb-1.5">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Min 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1.5">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Company</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    placeholder="Your company"
                  />
                </div>
              </div>

              {/* TOS Checkbox */}
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tosAccepted}
                    onChange={(e) => setTosAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    I agree to the Terms of Service. DealUW provides estimated valuations
                    for informational purposes only. I am responsible for my own due
                    diligence. <span className="text-pass">*</span>
                  </span>
                </label>

                {/* Email Marketing Consent */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailConsent}
                    onChange={(e) => setEmailConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    I agree to receive marketing emails from DealUW. You can unsubscribe
                    at any time.
                  </span>
                </label>

                {/* SMS Consent */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsConsent}
                    onChange={(e) => setSmsConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                  />
                  <span className="text-xs text-muted leading-relaxed">
                    I agree to receive SMS messages from DealUW. Message and data rates
                    may apply. Message frequency varies. Reply STOP to cancel. Reply HELP
                    for help. Consent is not a condition of purchase.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted mt-6">
          by Arctic Acquisitions LLC
        </p>
      </div>
    </div>
  );
}
