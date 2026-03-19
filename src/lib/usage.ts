import { createServerSupabaseClient } from './supabase-server';
import type { Profile } from './supabase';

const FREE_ANALYSIS_LIMIT = 10;
const FREE_TRIAL_DAYS = 7;
const PRO_ANALYSIS_LIMIT = 500;

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function canAnalyze(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  usage: { used: number; limit: number; tier: string };
}> {
  const profile = await getProfile(userId);
  if (!profile) {
    return {
      allowed: false,
      reason: 'Profile not found',
      usage: { used: 0, limit: 0, tier: 'free' },
    };
  }

  // Admin bypasses all limits
  if (profile.subscription_tier === 'admin') {
    return {
      allowed: true,
      usage: { used: profile.analysis_count, limit: 999999, tier: 'admin' },
    };
  }

  const limit =
    profile.subscription_tier === 'pro' ? PRO_ANALYSIS_LIMIT : FREE_ANALYSIS_LIMIT;

  // Check free trial expiry
  if (profile.subscription_tier === 'free' && profile.trial_start) {
    const trialStart = new Date(profile.trial_start);
    const now = new Date();
    const diffDays = (now.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > FREE_TRIAL_DAYS) {
      return {
        allowed: false,
        reason: 'Free trial expired. Upgrade to Pro to continue.',
        usage: { used: profile.analysis_count, limit, tier: 'free' },
      };
    }
  }

  if (profile.analysis_count >= limit) {
    return {
      allowed: false,
      reason:
        profile.subscription_tier === 'pro'
          ? 'Monthly analysis limit reached. Contact support for more.'
          : 'Free trial limit reached. Upgrade to Pro for 500 analyses/month.',
      usage: { used: profile.analysis_count, limit, tier: profile.subscription_tier },
    };
  }

  return {
    allowed: true,
    usage: { used: profile.analysis_count, limit, tier: profile.subscription_tier },
  };
}

export async function incrementAnalysisCount(userId: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.rpc('increment_analysis_count', { user_id: userId });
}
