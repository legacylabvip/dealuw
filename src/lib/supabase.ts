import { createBrowserClient } from '@supabase/ssr';

// Browser client for use in Client Components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  subscription_tier: 'free' | 'pro' | 'admin';
  analysis_count: number;
  analysis_limit: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  tos_accepted: boolean;
  email_consent: boolean;
  sms_consent: boolean;
  trial_start: string | null;
  created_at: string;
};
