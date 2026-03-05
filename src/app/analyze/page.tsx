'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { COMP_RULES, ADJUSTMENTS } from '@/lib/compRules';
import { filterComps, adjustComps, calculateARV, calculateMAO, type AdjustedComp } from '@/lib/compEngine';
import type { AIAnalysisResult } from '@/lib/aiAnalysis';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Subject {
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_sqft: number | null;
  year_built: number | null;
  property_type: string;
  condition: string;
  has_pool: boolean;
  has_garage: boolean;
  garage_count: number;
  has_carport: boolean;
  has_basement: boolean;
  basement_sqft: number;
  has_guest_house: boolean;
  guest_house_sqft: number;
  traffic_commercial: string;
  asking_price: number | null;
}

interface Comp {
  id?: number;
  address: string;
  sale_price: number;
  sale_date: string;
  days_old?: number;
  sqft: number;
  lot_sqft: number;
  beds: number;
  baths: number;
  year_built: number;
  property_type: string;
  distance_miles: number;
  same_subdivision: boolean;
  crosses_major_road: boolean;
  has_pool: boolean;
  has_garage: boolean;
  garage_count: number;
  has_carport: boolean;
  has_basement: boolean;
  basement_sqft: number;
  has_guest_house: boolean;
  guest_house_sqft: number;
  force_include?: boolean;
  // After filtering/adjusting
  disqualified?: boolean;
  disqualified_reasons?: string[];
  warnings?: string[];
  adjusted_price?: number;
  adjustments?: { type: string; amount: number; reason: string }[];
  total_adjustment?: number;
  price_per_sqft?: number;
  selected?: boolean;
}

interface RepairItem {
  label: string;
  key: string;
  max: number;
  value: number;
  enabled: boolean;
  multiplier?: number;
}

type Step = 'address' | 'details' | 'comps' | 'repairs' | 'verdict';

// ─── Helpers ────────────────────────────────────────────────────────────────

const money = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '--';

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const PROPERTY_TYPES = ['ranch', '2-story', 'split-level', 'historic', 'condo', 'townhouse', 'multi-family'];
const CONDITIONS = ['excellent', 'good', 'fair', 'poor'];
const TRAFFIC_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'siding', label: 'Siding (backs to commercial/busy road)' },
  { value: 'backing', label: 'Backing (backs to undesirable)' },
  { value: 'fronting', label: 'Fronting (fronts major road/commercial)' },
];

const defaultSubject: Subject = {
  address: '', city: '', state: '', zip: '',
  beds: null, baths: null, sqft: null, lot_sqft: null, year_built: null,
  property_type: 'ranch', condition: 'fair',
  has_pool: false, has_garage: false, garage_count: 0, has_carport: false,
  has_basement: false, basement_sqft: 0, has_guest_house: false, guest_house_sqft: 0,
  traffic_commercial: 'none', asking_price: null,
};

const defaultRepairItems: RepairItem[] = [
  { label: 'Roof', key: 'roof', max: 20000, value: 0, enabled: false },
  { label: 'Kitchen', key: 'kitchen', max: 25000, value: 0, enabled: false },
  { label: 'Bathrooms', key: 'bathrooms', max: 15000, value: 0, enabled: false, multiplier: 1 },
  { label: 'Flooring', key: 'flooring', max: 15000, value: 0, enabled: false },
  { label: 'Interior Paint', key: 'int_paint', max: 8000, value: 0, enabled: false },
  { label: 'Exterior Paint', key: 'ext_paint', max: 8000, value: 0, enabled: false },
  { label: 'HVAC', key: 'hvac', max: 12000, value: 0, enabled: false },
  { label: 'Plumbing', key: 'plumbing', max: 10000, value: 0, enabled: false },
  { label: 'Electrical', key: 'electrical', max: 10000, value: 0, enabled: false },
  { label: 'Foundation', key: 'foundation', max: 20000, value: 0, enabled: false },
  { label: 'Windows', key: 'windows', max: 12000, value: 0, enabled: false },
  { label: 'Landscaping', key: 'landscaping', max: 5000, value: 0, enabled: false },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('address');
  const [subject, setSubject] = useState<Subject>(defaultSubject);
  const [rawComps, setRawComps] = useState<Comp[]>([]);
  const [overriddenComps, setOverriddenComps] = useState<Set<number>>(new Set());
  const [deselectedComps, setDeselectedComps] = useState<Set<number>>(new Set());
  const [repairMode, setRepairMode] = useState<'quick' | 'detailed'>('quick');
  const [quickRepairRate, setQuickRepairRate] = useState<number>(20);
  const [repairItems, setRepairItems] = useState<RepairItem[]>(defaultRepairItems);
  const [otherRepairLabel, setOtherRepairLabel] = useState('');
  const [otherRepairAmount, setOtherRepairAmount] = useState(0);
  const [arvOverride, setArvOverride] = useState<number | null>(null);
  const [showArvOverride, setShowArvOverride] = useState(false);
  const [showAddComp, setShowAddComp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const [showCompAdjBreakdown, setShowCompAdjBreakdown] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiExpanded, setAiExpanded] = useState(true);
  const [aiCacheKey, setAiCacheKey] = useState<string | null>(null);
  const [autoPullLoading, setAutoPullLoading] = useState(false);
  const [autoPullError, setAutoPullError] = useState<string | null>(null);
  const [autoPullAvailable, setAutoPullAvailable] = useState<boolean | null>(null);
  const [compPullExpansions, setCompPullExpansions] = useState<string[]>([]);

  // Check if auto-pull is available
  useEffect(() => {
    fetch('/api/property-lookup')
      .then(r => r.json())
      .then(d => setAutoPullAvailable(d.available))
      .catch(() => setAutoPullAvailable(false));
  }, []);

  // Load recent addresses
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dealuw_recent_addresses');
      if (saved) setRecentAddresses(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveRecentAddress = useCallback((addr: string) => {
    if (!addr) return;
    const updated = [addr, ...recentAddresses.filter(a => a !== addr)].slice(0, 5);
    setRecentAddresses(updated);
    try { localStorage.setItem('dealuw_recent_addresses', JSON.stringify(updated)); } catch { /* ignore */ }
  }, [recentAddresses]);

  // ─── Auto-pull property data & comps ────────────────────────────

  const handlePullData = async () => {
    if (!subject.address) return;
    saveRecentAddress(subject.address);

    if (!autoPullAvailable) {
      setStep('details');
      return;
    }

    setAutoPullLoading(true);
    setAutoPullError(null);
    setCompPullExpansions([]);

    try {
      // Step 1: Lookup property
      const lookupRes = await fetch('/api/property-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: subject.address, city: subject.city, state: subject.state, zip: subject.zip }),
      });
      const lookupData = await lookupRes.json();

      if (lookupData.available && lookupData.property) {
        const p = lookupData.property;
        setSubject(s => ({
          ...s,
          address: p.address || s.address,
          city: p.city || s.city,
          state: p.state || s.state,
          zip: p.zip || s.zip,
          beds: p.beds ?? s.beds,
          baths: p.baths ?? s.baths,
          sqft: p.sqft ?? s.sqft,
          lot_sqft: p.lot_sqft ?? s.lot_sqft,
          year_built: p.year_built ?? s.year_built,
          property_type: p.property_type || s.property_type,
          has_pool: p.has_pool ?? s.has_pool,
          has_garage: p.has_garage ?? s.has_garage,
          garage_count: p.garage_count ?? s.garage_count,
          has_carport: p.has_carport ?? s.has_carport,
          has_basement: p.has_basement ?? s.has_basement,
          basement_sqft: p.basement_sqft ?? s.basement_sqft,
          has_guest_house: p.has_guest_house ?? s.has_guest_house,
          guest_house_sqft: p.guest_house_sqft ?? s.guest_house_sqft,
        }));

        // Step 2: Pull comps with the property data
        const compsRes = await fetch('/api/pull-comps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property: p }),
        });
        const compsData = await compsRes.json();

        if (compsData.available && compsData.comps?.length > 0) {
          setRawComps(compsData.comps);
          if (compsData.expansions?.length > 0) {
            setCompPullExpansions(compsData.expansions);
          }
        }
      } else {
        setAutoPullError(lookupData.error || 'Property not found. Enter details manually.');
      }
    } catch {
      setAutoPullError('Auto-pull failed. Enter details manually.');
    } finally {
      setAutoPullLoading(false);
      setStep('details');
    }
  };

  // ─── Engine calculations (reactive) ──────────────────────────────

  const { filtered, adjusted, arvResult, repairEstimate, maoResult } = useMemo(() => {
    // Prepare comps with overrides
    const compsForEngine = rawComps.map((c, i) => ({
      ...c,
      force_include: overriddenComps.has(i),
    }));

    const filtered = filterComps(subject, compsForEngine);
    const allProcessed = [
      ...filtered.qualified.map((c) => ({
        ...c,
        _origIdx: rawComps.findIndex(r => r.address === c.address),
        _status: (c.warnings && c.warnings.length > 0) ? 'flagged' as const : 'qualified' as const,
        selected: !deselectedComps.has(rawComps.findIndex(r => r.address === c.address)),
      })),
      ...filtered.disqualified.map((c) => ({
        ...c,
        _origIdx: rawComps.findIndex(r => r.address === c.address),
        _status: 'disqualified' as const,
        selected: overriddenComps.has(rawComps.findIndex(r => r.address === c.address)),
      })),
    ];

    // Get selected comps for adjustment
    const selectedForAdjust = allProcessed.filter(c => c.selected && (c._status !== 'disqualified' || overriddenComps.has(c._origIdx)));
    const adjusted = adjustComps(subject, selectedForAdjust);

    const effectiveArv = arvOverride != null ? arvOverride : null;
    const arvResult = adjusted.length > 0 ? calculateARV(subject, adjusted) : null;
    const finalArv = effectiveArv ?? (arvResult?.arv ?? 0);

    // Repair estimate
    let repairEstimate = 0;
    if (repairMode === 'quick') {
      repairEstimate = quickRepairRate * (subject.sqft || 1500);
    } else {
      repairEstimate = repairItems.reduce((sum, item) => {
        if (!item.enabled) return sum;
        const mult = item.key === 'bathrooms' ? (subject.baths || 1) : 1;
        return sum + (item.value * mult);
      }, 0);
      repairEstimate += otherRepairAmount;
    }

    const maoResult = finalArv > 0
      ? calculateMAO(finalArv, repairEstimate, subject.asking_price, null, arvResult?.confidence ?? 'low')
      : null;

    return { filtered: allProcessed, adjusted, arvResult, repairEstimate, maoResult };
  }, [subject, rawComps, overriddenComps, deselectedComps, arvOverride, repairMode, quickRepairRate, repairItems, otherRepairAmount]);

  const qualifiedCount = filtered.filter(c => c._status === 'qualified').length;
  const flaggedCount = filtered.filter(c => c._status === 'flagged').length;
  const disqualifiedCount = filtered.filter(c => c._status === 'disqualified').length;
  const finalArv = arvOverride ?? (arvResult?.arv ?? 0);

  // ─── Save to Pipeline ────────────────────────────────────────────

  const saveToPipeline = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...subject,
          arv_raw: arvResult?.arv,
          arv_adjusted: finalArv,
          repair_estimate: repairEstimate,
          mao: maoResult?.mao,
          assignment_fee: maoResult?.assignment_fee,
          recommendation: maoResult?.recommendation,
          confidence: arvResult?.confidence,
          status: 'analyzing',
          comps_data: JSON.stringify(adjusted),
          repair_breakdown: JSON.stringify(repairMode === 'quick'
            ? { mode: 'quick', rate: quickRepairRate, sqft: subject.sqft, total: repairEstimate }
            : { mode: 'detailed', items: repairItems.filter(i => i.enabled), other: { label: otherRepairLabel, amount: otherRepairAmount }, total: repairEstimate }
          ),
          adjustments_applied: JSON.stringify(arvResult?.adjustments_summary),
        }),
      });
      const deal = await res.json();
      saveRecentAddress(subject.address);
      router.push(`/analyze/${deal.id}`);
    } catch {
      setSaving(false);
    }
  };

  // ─── AI Analysis ────────────────────────────────────────────────

  const runAiAnalysis = async () => {
    if (!arvResult || !maoResult) return;

    // Build cache key from inputs that matter
    const cacheData = JSON.stringify({
      subject, arv: arvResult.arv, mao: maoResult.mao, repair: repairEstimate,
      comps: adjusted.map(c => c.address).sort(),
    });
    if (cacheData === aiCacheKey && aiAnalysis) return; // Already cached

    setAiLoading(true);
    setAiError(null);
    try {
      const repairBreakdown = repairMode === 'quick'
        ? `${quickRepairRate}/sqft quick estimate`
        : repairItems.filter(i => i.enabled).map(i => `${i.label}: $${i.value.toLocaleString()}`).join(', ') + (otherRepairAmount > 0 ? `, Other: $${otherRepairAmount.toLocaleString()}` : '');

      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          compsUsed: adjusted.map(c => ({
            address: c.address, sale_price: c.sale_price, adjusted_price: c.adjusted_price,
            days_old: c.days_old, sqft: c.sqft, distance_miles: c.distance_miles,
            adjustments: c.adjustments,
          })),
          compsDisqualified: filtered.filter(c => c._status === 'disqualified' && !c.selected).map(c => ({
            address: c.address, sale_price: c.sale_price, disqualified_reasons: c.disqualified_reasons,
          })),
          arvResult,
          maoResult,
          repairEstimate,
          repairBreakdown,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'AI analysis failed');
      }

      const result: AIAnalysisResult = await res.json();
      setAiAnalysis(result);
      setAiCacheKey(cacheData);
      setAiExpanded(true);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'AI analysis failed');
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Add manual comp ─────────────────────────────────────────────

  const addManualComp = (comp: Comp) => {
    setRawComps(prev => [...prev, comp]);
    setShowAddComp(false);
  };

  // ─── Traffic note helper ──────────────────────────────────────────

  const trafficNote = useMemo(() => {
    const tc = subject.traffic_commercial;
    if (tc === 'none') return null;
    const under = ADJUSTMENTS.traffic.under500k;
    const over = ADJUSTMENTS.traffic.over500k;
    const flat = under[tc as keyof typeof under];
    const pct = over[tc as keyof typeof over];
    return `Under $500K: -$${(flat as number).toLocaleString()} | Over $500K: -${((pct as number) * 100).toFixed(0)}%`;
  }, [subject.traffic_commercial]);

  // ─── Adjustment summary ──────────────────────────────────────────

  const adjustmentSummary = useMemo(() => {
    const summary: Record<string, { count: number; net: number }> = {};
    for (const comp of adjusted) {
      for (const adj of (comp.adjustments || [])) {
        if (adj.amount === 0) continue;
        if (!summary[adj.type]) summary[adj.type] = { count: 0, net: 0 };
        summary[adj.type].count++;
        summary[adj.type].net += adj.amount;
      }
    }
    return summary;
  }, [adjusted]);

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Step Indicator */}
        <StepIndicator current={step} onStep={setStep} hasAddress={!!subject.address} hasComps={rawComps.length > 0} />

        {/* ═══ STEP 1: ADDRESS ═══ */}
        {step === 'address' && (
          <div className="animate-fadeIn">
            <div className="rounded-xl border border-border bg-card p-8 max-w-2xl mx-auto">
              <h2 className="text-xl font-bold text-foreground mb-1">Analyze a Property</h2>
              <p className="text-sm text-muted mb-6">Enter the subject property address to begin underwriting.</p>

              <input
                type="text"
                placeholder="Enter property address..."
                value={subject.address}
                onChange={e => setSubject(s => ({ ...s, address: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-5 py-4 text-lg text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none transition-colors mb-4"
              />
              <div className="grid grid-cols-3 gap-3 mb-6">
                <input placeholder="City" value={subject.city} onChange={e => setSubject(s => ({ ...s, city: e.target.value }))} className="input-std" />
                <input placeholder="State" value={subject.state} onChange={e => setSubject(s => ({ ...s, state: e.target.value }))} className="input-std" />
                <input placeholder="ZIP" value={subject.zip} onChange={e => setSubject(s => ({ ...s, zip: e.target.value }))} className="input-std" />
              </div>

              <button
                onClick={handlePullData}
                disabled={!subject.address || autoPullLoading}
                className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white transition-all hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {autoPullLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Pulling property data &amp; comps...
                  </span>
                ) : autoPullAvailable ? 'Pull Data & Analyze' : 'Enter Details Manually'}
              </button>
              {autoPullAvailable === false && (
                <p className="text-xs text-muted/60 text-center mt-2">No RE data API configured. You can enter property details and comps manually.</p>
              )}
              {autoPullError && (
                <p className="text-xs text-amber-400 text-center mt-2">{autoPullError}</p>
              )}

              {recentAddresses.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs text-muted mb-2">Recent</p>
                  <div className="flex flex-wrap gap-2">
                    {recentAddresses.map(addr => (
                      <button
                        key={addr}
                        onClick={() => setSubject(s => ({ ...s, address: addr }))}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                      >
                        {addr}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 2: PROPERTY DETAILS ═══ */}
        {step === 'details' && (
          <div className="animate-fadeIn">
            {autoPullAvailable && rawComps.length > 0 && (
              <div className="mb-4 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 flex items-center gap-2">
                <span className="text-green-400 text-sm">&#10003;</span>
                <p className="text-sm text-green-300">
                  Auto-pulled property data and {rawComps.length} comp{rawComps.length !== 1 ? 's' : ''}. Verify details below.
                </p>
              </div>
            )}
            {autoPullError && (
              <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-sm text-amber-300">{autoPullError}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-6">
              {/* Left: Basic Info */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Basic Info</h3>
                <div className="grid grid-cols-2 gap-3">
                  <LabelInput label="Beds" type="number" value={subject.beds} onChange={v => setSubject(s => ({ ...s, beds: v ? Number(v) : null }))} />
                  <LabelInput label="Baths" type="number" step="0.5" value={subject.baths} onChange={v => setSubject(s => ({ ...s, baths: v ? Number(v) : null }))} />
                  <LabelInput label="Sqft" type="number" value={subject.sqft} onChange={v => setSubject(s => ({ ...s, sqft: v ? Number(v) : null }))} />
                  <LabelInput label="Lot Sqft" type="number" value={subject.lot_sqft} onChange={v => setSubject(s => ({ ...s, lot_sqft: v ? Number(v) : null }))} />
                  <LabelInput label="Year Built" type="number" value={subject.year_built} onChange={v => setSubject(s => ({ ...s, year_built: v ? Number(v) : null }))} />
                  <div>
                    <label className="block text-xs text-muted mb-1">Property Type</label>
                    <select value={subject.property_type} onChange={e => setSubject(s => ({ ...s, property_type: e.target.value }))} className="input-std w-full">
                      {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Right: Features */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Features</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">Condition</label>
                    <select value={subject.condition} onChange={e => setSubject(s => ({ ...s, condition: e.target.value }))} className="input-std w-full">
                      {CONDITIONS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Toggle label="Pool" value={subject.has_pool} onChange={v => setSubject(s => ({ ...s, has_pool: v }))} />
                    <Toggle label="Carport" value={subject.has_carport} onChange={v => setSubject(s => ({ ...s, has_carport: v }))} />
                    <Toggle label="Garage" value={subject.has_garage} onChange={v => setSubject(s => ({ ...s, has_garage: v, garage_count: v ? Math.max(s.garage_count, 1) : 0 }))} />
                  </div>

                  {subject.has_garage && (
                    <div className="animate-fadeIn">
                      <label className="block text-xs text-muted mb-1">Garage Bays</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4].map(n => (
                          <button key={n} onClick={() => setSubject(s => ({ ...s, garage_count: n }))}
                            className={`rounded-lg px-4 py-1.5 text-sm font-medium border transition-colors ${subject.garage_count === n ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted hover:border-accent/30'}`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Toggle label="Basement" value={subject.has_basement} onChange={v => setSubject(s => ({ ...s, has_basement: v, basement_sqft: v ? s.basement_sqft : 0 }))} />
                    <Toggle label="Guest House" value={subject.has_guest_house} onChange={v => setSubject(s => ({ ...s, has_guest_house: v, guest_house_sqft: v ? s.guest_house_sqft : 0 }))} />
                  </div>

                  {subject.has_basement && (
                    <div className="animate-fadeIn">
                      <LabelInput label="Basement Sqft" type="number" value={subject.basement_sqft || ''} onChange={v => setSubject(s => ({ ...s, basement_sqft: Number(v) || 0 }))} />
                      <p className="text-[11px] text-negotiate mt-1">Basement sqft valued at 50% of $/sqft</p>
                    </div>
                  )}
                  {subject.has_guest_house && (
                    <div className="animate-fadeIn">
                      <LabelInput label="Guest House Sqft" type="number" value={subject.guest_house_sqft || ''} onChange={v => setSubject(s => ({ ...s, guest_house_sqft: Number(v) || 0 }))} />
                      <p className="text-[11px] text-negotiate mt-1">Guest house sqft valued at 50% of $/sqft</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-muted mb-1">Traffic / Commercial Exposure</label>
                    <select value={subject.traffic_commercial} onChange={e => setSubject(s => ({ ...s, traffic_commercial: e.target.value }))} className="input-std w-full">
                      {TRAFFIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {trafficNote && <p className="text-[11px] text-negotiate mt-1">{trafficNote}</p>}
                  </div>

                  <LabelInput label="Asking Price ($)" type="number" value={subject.asking_price} onChange={v => setSubject(s => ({ ...s, asking_price: v ? Number(v) : null }))} />
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setStep('comps')} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors">
                Continue to Comps &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3: COMPS TABLE ═══ */}
        {step === 'comps' && (
          <div className="animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-foreground">Comparable Sales</h2>
                <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">{rawComps.length}</span>
              </div>
              <button onClick={() => setShowAddComp(true)} className="rounded-lg border border-accent/30 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/10 transition-colors">
                + Add Comp Manually
              </button>
            </div>

            {/* Search Expansion Warnings */}
            {compPullExpansions.length > 0 && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 mb-4">
                {compPullExpansions.map((exp, i) => (
                  <p key={i} className="text-xs text-amber-300 flex items-center gap-1.5">
                    <span>&#9888;</span> {exp}
                  </p>
                ))}
              </div>
            )}

            {/* Filter Status Bar */}
            <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 mb-4 flex items-center gap-4 text-xs text-muted overflow-x-auto">
              <FilterBadge label={`Within ${COMP_RULES.maxAge} days`} />
              <FilterBadge label={`+/- ${COMP_RULES.maxSqftDifference} sqft`} />
              <FilterBadge label="Same type" />
              <FilterBadge label={`+/- ${COMP_RULES.maxYearBuiltDifference}yr build`} />
              <FilterBadge label={`+/- ${COMP_RULES.maxLotSqftDifference.toLocaleString()} lot sqft`} />
            </div>

            {rawComps.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-12 text-center">
                <p className="text-muted mb-2">No comps added yet</p>
                <p className="text-xs text-muted/60 mb-4">Add comps manually to begin analysis</p>
                <button onClick={() => setShowAddComp(true)} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/80 transition-colors">
                  + Add First Comp
                </button>
              </div>
            ) : (
              <>
                {/* Comps Table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs text-muted">
                          <th className="text-left py-3 px-3 w-8"></th>
                          <th className="text-left py-3 px-2 w-8"></th>
                          <th className="text-left py-3 px-2">Address</th>
                          <th className="text-right py-3 px-2">Sale Price</th>
                          <th className="text-right py-3 px-2">Adjusted</th>
                          <th className="text-right py-3 px-2">Sale Date</th>
                          <th className="text-right py-3 px-2">Sqft</th>
                          <th className="text-right py-3 px-2">Bd/Ba</th>
                          <th className="text-right py-3 px-2">Yr Built</th>
                          <th className="text-right py-3 px-2">Lot</th>
                          <th className="text-right py-3 px-2">Dist</th>
                          <th className="text-center py-3 px-2">Subdiv</th>
                          <th className="text-left py-3 px-2">Adjustments</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((comp, idx) => {
                          const origIdx = comp._origIdx;
                          const isDQ = comp._status === 'disqualified';
                          const isFlagged = comp._status === 'flagged';
                          const isOverridden = overriddenComps.has(origIdx);
                          const isDeselected = deselectedComps.has(origIdx);
                          const isSelected = isDQ ? isOverridden : !isDeselected;
                          const adjComp = adjusted.find(a => a.address === comp.address);
                          const adjPrice = adjComp?.adjusted_price ?? comp.sale_price;
                          const adjDiff = adjComp ? adjComp.total_adjustment : 0;
                          const sqftDiff = subject.sqft && comp.sqft ? Math.abs(subject.sqft - comp.sqft) : 0;
                          const sqftOutOfRange = sqftDiff > COMP_RULES.maxSqftDifference;

                          return (
                            <tr key={idx} className={`border-b border-border/40 transition-colors ${isDQ && !isOverridden ? 'opacity-40 bg-pass/5' : ''} ${isFlagged ? 'bg-negotiate/5' : ''} ${isOverridden ? 'bg-negotiate/10' : ''} hover:bg-white/[0.02]`}>
                              <td className="py-2.5 px-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isDQ) {
                                      setOverriddenComps(prev => {
                                        const next = new Set(prev);
                                        if (next.has(origIdx)) next.delete(origIdx); else next.add(origIdx);
                                        return next;
                                      });
                                    } else {
                                      setDeselectedComps(prev => {
                                        const next = new Set(prev);
                                        if (next.has(origIdx)) next.delete(origIdx); else next.add(origIdx);
                                        return next;
                                      });
                                    }
                                  }}
                                  className="accent-accent"
                                />
                              </td>
                              <td className="py-2.5 px-2">
                                {isDQ ? (
                                  <span className="text-pass text-base cursor-help" title={comp.disqualified_reasons?.join('; ')}>&#10060;</span>
                                ) : isFlagged ? (
                                  <span className="text-negotiate text-base cursor-help" title={comp.warnings?.join('; ')}>&#9888;&#65039;</span>
                                ) : (
                                  <span className="text-go text-base">&#9989;</span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-foreground font-medium max-w-[180px] truncate">{comp.address}</td>
                              <td className="py-2.5 px-2 text-right text-gold" style={mono}>{money(comp.sale_price)}</td>
                              <td className="py-2.5 px-2 text-right" style={mono}>
                                <span className="text-gold">{money(adjPrice)}</span>
                                {adjDiff !== 0 && (
                                  <span className={`ml-1 text-[10px] ${adjDiff > 0 ? 'text-go' : 'text-pass'}`}>
                                    {adjDiff > 0 ? '+' : ''}{money(adjDiff)}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 text-right text-muted">
                                {comp.sale_date}
                                <span className="ml-1 text-[10px] text-muted/60">{comp.days_old}d</span>
                              </td>
                              <td className={`py-2.5 px-2 text-right ${sqftOutOfRange ? 'text-pass font-semibold' : 'text-muted'}`} style={mono}>
                                {comp.sqft?.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-2 text-right text-muted">{comp.beds}/{comp.baths}</td>
                              <td className="py-2.5 px-2 text-right text-muted">{comp.year_built}</td>
                              <td className="py-2.5 px-2 text-right text-muted" style={mono}>{comp.lot_sqft?.toLocaleString()}</td>
                              <td className="py-2.5 px-2 text-right text-muted">{comp.distance_miles}mi</td>
                              <td className="py-2.5 px-2 text-center">{comp.same_subdivision ? <span className="text-go">&#10003;</span> : <span className="text-pass">&#10007;</span>}</td>
                              <td className="py-2.5 px-2">
                                {adjComp?.adjustments && adjComp.adjustments.length > 0 ? (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-accent hover:underline">{adjComp.adjustments.filter(a => a.amount !== 0).length} adj</summary>
                                    <div className="mt-1 space-y-0.5 text-muted">
                                      {adjComp.adjustments.filter(a => a.amount !== 0).map((a, ai) => (
                                        <p key={ai}>{a.reason}</p>
                                      ))}
                                    </div>
                                  </details>
                                ) : isDQ ? (
                                  <span className="text-[10px] text-pass">{comp.disqualified_reasons?.[0]}</span>
                                ) : (
                                  <span className="text-xs text-muted/40">--</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary badges */}
                <div className="flex items-center gap-4 mb-4 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-go" /> Qualified: {qualifiedCount}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-negotiate" /> Flagged: {flaggedCount}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pass" /> Disqualified: {disqualifiedCount}</span>
                </div>

                {qualifiedCount + flaggedCount < 3 && (
                  <div className="rounded-lg border border-negotiate/30 bg-negotiate/5 px-4 py-3 mb-4 text-sm text-negotiate">
                    Low comp count ({qualifiedCount + flaggedCount} qualified) — ARV confidence will be LOW
                  </div>
                )}

                {/* Comp Adjustments Breakdown */}
                {Object.keys(adjustmentSummary).length > 0 && (
                  <div className="rounded-xl border border-border bg-card mb-4">
                    <button onClick={() => setShowCompAdjBreakdown(!showCompAdjBreakdown)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-foreground hover:bg-white/[0.02] transition-colors">
                      <span>Comp Adjustments Breakdown</span>
                      <span className="text-muted text-xs">{showCompAdjBreakdown ? '▲' : '▼'}</span>
                    </button>
                    {showCompAdjBreakdown && (
                      <div className="px-5 pb-4 space-y-1.5">
                        {Object.entries(adjustmentSummary).map(([type, data]) => (
                          <div key={type} className="flex items-center justify-between text-sm">
                            <span className="text-muted capitalize">{type.replace(/_/g, ' ')} adjustments: {data.count} comp{data.count !== 1 ? 's' : ''}</span>
                            <span className={data.net >= 0 ? 'text-go' : 'text-pass'} style={mono}>
                              net {data.net >= 0 ? '+' : ''}{money(data.net)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ARV Calculation Box */}
                {adjusted.length > 0 && arvResult && (
                  <div className="rounded-xl border border-border bg-card p-6 mb-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-accent">ARV Calculation</h3>
                      <ConfidenceBadge level={arvResult.confidence} />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="text-xs text-muted">Method: <span className="text-foreground">{arvResult.method}</span></div>
                        <div>
                          <p className="text-xs text-muted mb-1.5">Comps Used</p>
                          {arvResult.comps_used.map((c: { address: string; sale_price: number; adjusted_price: number }, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs py-0.5">
                              <span className="text-muted truncate max-w-[180px]">{c.address}</span>
                              <span className="text-gold" style={mono}>{money(c.adjusted_price)}</span>
                            </div>
                          ))}
                        </div>
                        {arvResult.warnings.length > 0 && (
                          <div className="space-y-1">
                            {arvResult.warnings.map((w: string, i: number) => (
                              <p key={i} className="text-[11px] text-negotiate">{w}</p>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-muted">{arvResult.confidence_reasoning}</p>
                      </div>
                      <div className="space-y-3 text-right">
                        <div>
                          <p className="text-xs text-muted">RAW ARV</p>
                          <p className="text-2xl font-bold text-accent" style={mono}>{money(arvResult.arv)}</p>
                        </div>
                        {subject.traffic_commercial !== 'none' && (
                          <div>
                            <p className="text-xs text-muted">Traffic/Commercial Adj</p>
                            <p className="text-sm text-pass" style={mono}>{trafficNote}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted">ADJUSTED ARV</p>
                          <p className="text-3xl font-bold text-gold" style={mono}>{money(arvOverride ?? arvResult.arv)}</p>
                        </div>
                        {!showArvOverride ? (
                          <button onClick={() => setShowArvOverride(true)} className="text-xs text-muted hover:text-accent transition-colors">
                            Override ARV
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-2 animate-fadeIn">
                            <input
                              type="number"
                              placeholder="Manual ARV"
                              value={arvOverride ?? ''}
                              onChange={e => setArvOverride(e.target.value ? Number(e.target.value) : null)}
                              className="input-std w-32 text-right"
                              style={mono}
                            />
                            <button onClick={() => { setArvOverride(null); setShowArvOverride(false); }} className="text-xs text-muted hover:text-pass">Reset</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep('details')} className="rounded-xl border border-border px-6 py-3 text-sm text-muted hover:text-foreground transition-colors">
                &larr; Property Details
              </button>
              <button onClick={() => setStep('repairs')} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors">
                Continue to Repairs &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: REPAIR ESTIMATE ═══ */}
        {step === 'repairs' && (
          <div className="animate-fadeIn max-w-3xl mx-auto">
            <h2 className="text-lg font-bold text-foreground mb-4">Repair Estimate</h2>

            {/* Mode Toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden mb-6 w-fit">
              <button onClick={() => setRepairMode('quick')} className={`px-5 py-2 text-sm font-medium transition-colors ${repairMode === 'quick' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
                Quick Mode
              </button>
              <button onClick={() => setRepairMode('detailed')} className={`px-5 py-2 text-sm font-medium transition-colors ${repairMode === 'detailed' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>
                Detailed Mode
              </button>
            </div>

            {repairMode === 'quick' ? (
              <div className="grid grid-cols-3 gap-4 mb-6">
                <QuickRepairCard
                  label="Light Rehab"
                  range="$10-15/sqft"
                  desc="Cosmetic only: paint, carpet, minor fixtures"
                  color="go"
                  active={quickRepairRate >= 10 && quickRepairRate <= 15}
                  onClick={() => setQuickRepairRate(12)}
                />
                <QuickRepairCard
                  label="Medium Rehab"
                  range="$15-25/sqft"
                  desc="Kitchen, bathrooms, flooring, some mechanicals"
                  color="negotiate"
                  active={quickRepairRate > 15 && quickRepairRate <= 25}
                  onClick={() => setQuickRepairRate(20)}
                />
                <QuickRepairCard
                  label="Heavy Rehab"
                  range="$25-40/sqft"
                  desc="Full gut: structural, all mechanicals, everything"
                  color="pass"
                  active={quickRepairRate > 25}
                  onClick={() => setQuickRepairRate(32)}
                />
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {repairItems.map((item, idx) => (
                  <RepairSlider
                    key={item.key}
                    item={item}
                    bathCount={subject.baths || 1}
                    onChange={(updated) => {
                      setRepairItems(prev => prev.map((p, i) => i === idx ? updated : p));
                    }}
                  />
                ))}
                <div className="flex items-center gap-3 mt-2">
                  <input placeholder="Other label" value={otherRepairLabel} onChange={e => setOtherRepairLabel(e.target.value)} className="input-std flex-1" />
                  <input type="number" placeholder="$0" value={otherRepairAmount || ''} onChange={e => setOtherRepairAmount(Number(e.target.value) || 0)} className="input-std w-28" style={mono} />
                </div>
              </div>
            )}

            {/* Quick mode rate slider */}
            {repairMode === 'quick' && (
              <div className="rounded-xl border border-border bg-card p-5 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted">Rate: ${quickRepairRate}/sqft</span>
                  <span className="text-xs text-muted">{subject.sqft?.toLocaleString() || '1,500'} sqft</span>
                </div>
                <input type="range" min="5" max="50" value={quickRepairRate} onChange={e => setQuickRepairRate(Number(e.target.value))} className="w-full accent-accent" />
              </div>
            )}

            {/* Running Total */}
            <div className="rounded-xl border border-gold/30 bg-card p-6 text-center">
              <p className="text-xs text-muted mb-1">Estimated Repairs</p>
              <p className="text-4xl font-bold text-gold" style={mono}>{money(repairEstimate)}</p>
              {repairMode === 'quick' && (
                <p className="text-xs text-muted mt-1">${quickRepairRate}/sqft x {(subject.sqft || 1500).toLocaleString()} sqft</p>
              )}
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep('comps')} className="rounded-xl border border-border px-6 py-3 text-sm text-muted hover:text-foreground transition-colors">
                &larr; Comps
              </button>
              <button onClick={() => setStep('verdict')} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors">
                See The Verdict &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 5: THE VERDICT ═══ */}
        {step === 'verdict' && maoResult && (
          <div className="animate-verdictIn max-w-3xl mx-auto">
            <VerdictCard
              subject={subject}
              finalArv={finalArv}
              repairEstimate={repairEstimate}
              maoResult={maoResult}
              arvResult={arvResult}
              adjusted={adjusted}
              adjustmentSummary={adjustmentSummary}
            />
            <div className="flex items-center justify-center gap-4 mt-8">
              <button onClick={saveToPipeline} disabled={saving} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save to Pipeline'}
              </button>
              <button onClick={runAiAnalysis} disabled={aiLoading} className="rounded-xl border border-accent/50 px-6 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
                {aiLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    Analyzing...
                  </span>
                ) : aiAnalysis ? 'Re-run AI Analysis' : 'Get AI Analysis'}
              </button>
              <button disabled className="rounded-xl border border-border px-6 py-3 text-sm text-muted cursor-not-allowed opacity-50">
                Export PDF
              </button>
              <button onClick={() => { setSubject(defaultSubject); setRawComps([]); setOverriddenComps(new Set()); setDeselectedComps(new Set()); setArvOverride(null); setAiAnalysis(null); setAiCacheKey(null); setAiError(null); setStep('address'); }}
                className="rounded-xl border border-border px-6 py-3 text-sm text-muted hover:text-foreground transition-colors">
                New Analysis
              </button>
            </div>

            {/* ═══ AI Analysis Section ═══ */}
            {aiError && (
              <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-center">
                <p className="text-red-400 text-sm">{aiError}</p>
                {aiError.includes('ANTHROPIC_API_KEY') && (
                  <p className="text-xs text-muted mt-1">Set ANTHROPIC_API_KEY in your .env.local file</p>
                )}
              </div>
            )}

            {aiAnalysis && (
              <div className="mt-6 animate-fadeIn">
                <button
                  onClick={() => setAiExpanded(!aiExpanded)}
                  className="w-full flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 px-6 py-4 hover:bg-accent/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                    </svg>
                    <span className="text-sm font-semibold text-accent">AI Analysis</span>
                    <span className="text-xs text-muted">by Claude Haiku</span>
                  </div>
                  <svg className={`w-4 h-4 text-muted transition-transform ${aiExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {aiExpanded && (
                  <div className="mt-2 space-y-3">
                    {aiAnalysis.points.map((point) => (
                      <div key={point.number} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex gap-3">
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {point.number}
                          </span>
                          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{point.text}</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-center text-xs text-muted/50 pt-1">
                      AI analysis: ~$0.01 per analysis &middot; {aiAnalysis.usage.input_tokens + aiAnalysis.usage.output_tokens} tokens used
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 'verdict' && !maoResult && (
          <div className="max-w-3xl mx-auto text-center py-20">
            <p className="text-muted text-lg mb-4">Not enough data to calculate verdict</p>
            <p className="text-sm text-muted/60">Add comps and repair estimates first</p>
            <button onClick={() => setStep('comps')} className="mt-4 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/80">
              &larr; Back to Comps
            </button>
          </div>
        )}

        {/* ═══ Add Comp Modal ═══ */}
        {showAddComp && <AddCompModal subject={subject} onAdd={addManualComp} onClose={() => setShowAddComp(false)} />}
      </main>

      <style jsx global>{`
        .input-std {
          background: #070B14;
          border: 1px solid #1A2332;
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #E2E8F0;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-std:focus { border-color: #3AADE8; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }

        @keyframes verdictIn {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-verdictIn { animation: verdictIn 0.5s ease-out; }
      `}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function StepIndicator({ current, onStep, hasAddress, hasComps }: {
  current: Step; onStep: (s: Step) => void; hasAddress: boolean; hasComps: boolean;
}) {
  const steps: { key: Step; label: string; num: number }[] = [
    { key: 'address', label: 'Address', num: 1 },
    { key: 'details', label: 'Details', num: 2 },
    { key: 'comps', label: 'Comps', num: 3 },
    { key: 'repairs', label: 'Repairs', num: 4 },
    { key: 'verdict', label: 'Verdict', num: 5 },
  ];
  const currentIdx = steps.findIndex(s => s.key === current);

  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {steps.map((s, i) => {
        const isActive = s.key === current;
        const isPast = i < currentIdx;
        const canClick = s.key === 'address' || (s.key === 'details' && hasAddress) || (s.key === 'comps' && hasAddress) || (s.key === 'repairs' && hasAddress) || (s.key === 'verdict' && hasAddress && hasComps);
        return (
          <div key={s.key} className="flex items-center">
            <button
              onClick={() => canClick && onStep(s.key)}
              disabled={!canClick}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                isActive ? 'bg-accent/15 text-accent' : isPast ? 'text-accent/60 hover:text-accent' : 'text-muted/40'
              } ${canClick ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isActive ? 'bg-accent text-white' : isPast ? 'bg-accent/20 text-accent' : 'bg-border text-muted/40'
              }`}>{s.num}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && <div className={`w-8 h-px mx-1 ${i < currentIdx ? 'bg-accent/30' : 'bg-border'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function LabelInput({ label, type = 'text', step, value, onChange }: {
  label: string; type?: string; step?: string; value: string | number | null | undefined; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-muted mb-1">{label}</label>
      <input
        type={type}
        step={step}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="input-std w-full"
      />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        value ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent/30'
      }`}
    >
      <span className={`w-4 h-4 rounded-sm border flex items-center justify-center text-[10px] ${
        value ? 'bg-accent border-accent text-white' : 'border-muted/40'
      }`}>{value ? '&#10003;' : ''}</span>
      {label}
    </button>
  );
}

function FilterBadge({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span className="text-go">&#10003;</span> {label}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors = { high: 'bg-go/10 text-go border-go/30', medium: 'bg-negotiate/10 text-negotiate border-negotiate/30', low: 'bg-pass/10 text-pass border-pass/30' };
  return (
    <span className={`rounded-full border px-3 py-0.5 text-xs font-bold uppercase ${colors[level as keyof typeof colors] || colors.low}`}>
      {level}
    </span>
  );
}

function QuickRepairCard({ label, range, desc, color, active, onClick }: {
  label: string; range: string; desc: string; color: string; active: boolean; onClick: () => void;
}) {
  const colorMap: Record<string, string> = {
    go: active ? 'border-go bg-go/10' : 'border-border hover:border-go/30',
    negotiate: active ? 'border-negotiate bg-negotiate/10' : 'border-border hover:border-negotiate/30',
    pass: active ? 'border-pass bg-pass/10' : 'border-border hover:border-pass/30',
  };
  const textMap: Record<string, string> = { go: 'text-go', negotiate: 'text-negotiate', pass: 'text-pass' };

  return (
    <button onClick={onClick} className={`rounded-xl border p-5 text-left transition-all ${colorMap[color]}`}>
      <p className={`text-sm font-bold mb-1 ${active ? textMap[color] : 'text-foreground'}`}>{label}</p>
      <p className={`text-lg font-bold mb-2 ${textMap[color]}`} style={mono}>{range}</p>
      <p className="text-xs text-muted">{desc}</p>
    </button>
  );
}

function RepairSlider({ item, bathCount, onChange }: { item: RepairItem; bathCount: number; onChange: (i: RepairItem) => void }) {
  const mult = item.key === 'bathrooms' ? bathCount : 1;
  const total = item.value * mult;
  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors ${item.enabled ? 'border-border bg-card' : 'border-border/50 bg-transparent'}`}>
      <div className="flex items-center justify-between mb-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={item.enabled} onChange={e => onChange({ ...item, enabled: e.target.checked, value: e.target.checked ? item.value || Math.round(item.max * 0.4) : 0 })} className="accent-accent" />
          <span className={item.enabled ? 'text-foreground' : 'text-muted'}>{item.label}</span>
          {item.key === 'bathrooms' && mult > 1 && <span className="text-[10px] text-muted">(x{mult})</span>}
        </label>
        <span className="text-sm text-gold" style={mono}>{money(total)}</span>
      </div>
      {item.enabled && (
        <input type="range" min="0" max={item.max} step="500" value={item.value} onChange={e => onChange({ ...item, value: Number(e.target.value) })} className="w-full accent-accent" />
      )}
    </div>
  );
}

// ─── Verdict Card ───────────────────────────────────────────────────────────

function VerdictCard({ subject, finalArv, repairEstimate, maoResult, arvResult, adjusted, adjustmentSummary }: {
  subject: Subject;
  finalArv: number;
  repairEstimate: number;
  maoResult: ReturnType<typeof calculateMAO>;
  arvResult: ReturnType<typeof calculateARV> | null;
  adjusted: AdjustedComp[];
  adjustmentSummary: Record<string, { count: number; net: number }>;
}) {
  const rec = maoResult.recommendation;
  const glowMap: Record<string, string> = {
    go: 'shadow-[0_0_40px_rgba(34,197,94,0.15)] border-go/30',
    negotiate: 'shadow-[0_0_40px_rgba(245,158,11,0.15)] border-negotiate/30',
    pass: 'shadow-[0_0_40px_rgba(239,68,68,0.15)] border-pass/30',
  };
  const recColors: Record<string, string> = { go: 'text-go', negotiate: 'text-negotiate', pass: 'text-pass' };
  const recBg: Record<string, string> = { go: 'bg-go/10', negotiate: 'bg-negotiate/10', pass: 'bg-pass/10' };

  // Dynamic recommendation text
  let recText = '';
  if (rec === 'go') {
    recText = `Strong deal at ${money(maoResult.mao)}. ${money(maoResult.spread ?? 0)} spread with ${arvResult?.confidence ?? 'unknown'} confidence. Move fast.`;
  } else if (rec === 'negotiate') {
    const gap = subject.asking_price && maoResult.mao ? subject.asking_price - maoResult.mao : 0;
    recText = gap > 0
      ? `Offer ${money(maoResult.mao)}. Seller needs to come down ${money(gap)} for this deal to work. ARV confidence is ${arvResult?.confidence ?? 'unknown'} — verify with a drive-by before offering.`
      : `Numbers are tight with ${money(maoResult.spread ?? 0)} spread. Negotiate hard — there may be a deal here if you can lock it up at ${money(maoResult.mao)} or below.`;
  } else {
    const spread = maoResult.spread ?? 0;
    recText = `Numbers don't work. Negative spread of ${money(spread)}. Seller would need to come down to ${money(maoResult.mao)} for this to make sense. Move on.`;
  }

  return (
    <div className={`rounded-2xl border bg-card p-8 ${glowMap[rec] || glowMap.pass}`}>
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xs font-bold tracking-widest text-accent mb-1" style={{ fontFamily: "'Cinzel', serif" }}>DealUW</h2>
        <p className="text-sm font-bold text-foreground tracking-wide uppercase">Underwriting Summary</p>
      </div>

      {/* Property */}
      <div className="text-center mb-6 text-sm text-muted">
        <p className="text-foreground font-medium">{subject.address}{subject.city ? `, ${subject.city}` : ''}{subject.state ? `, ${subject.state}` : ''}</p>
        <p>{subject.beds || '?'}bd/{subject.baths || '?'}ba | {subject.sqft?.toLocaleString() || '?'} sqft | {subject.property_type} | Built {subject.year_built || '?'}</p>
      </div>

      <div className="w-full h-px bg-border mb-6" />

      {/* The Numbers */}
      <p className="text-center text-xs tracking-widest text-muted mb-4">THE NUMBERS</p>

      <div className="space-y-3 max-w-md mx-auto mb-6">
        <NumberRow label="ARV (Adjusted)" value={money(finalArv)} />
        <NumberRow label="x 70% Rule" value={money(Math.round(finalArv * 0.70))} />
        <NumberRow label="- Repairs" value={money(repairEstimate)} negative />
        <div className="h-px bg-border" />
        <NumberRow label="MAO" value={money(maoResult.mao)} highlight />
        <div className="h-px bg-border/50" />
        {subject.asking_price && (
          <>
            <NumberRow label="Asking Price" value={money(subject.asking_price)} />
            <NumberRow
              label="Spread"
              value={money(maoResult.spread ?? 0)}
              negative={(maoResult.spread ?? 0) < 0}
              positive={(maoResult.spread ?? 0) > 0}
            />
          </>
        )}
      </div>

      {/* Adjustments Applied */}
      {Object.keys(adjustmentSummary).length > 0 && (
        <>
          <div className="w-full h-px bg-border mb-4" />
          <p className="text-center text-xs tracking-widest text-muted mb-3">ADJUSTMENTS APPLIED</p>
          <div className="space-y-1.5 max-w-md mx-auto mb-6">
            {Object.entries(adjustmentSummary).map(([type, data]) => (
              <p key={type} className="text-xs text-muted">
                <span className="capitalize">{type.replace(/_/g, ' ')}</span>: {data.count} comp{data.count !== 1 ? 's' : ''}, net{' '}
                <span className={data.net >= 0 ? 'text-go' : 'text-pass'} style={mono}>{data.net >= 0 ? '+' : ''}{money(data.net)}</span>
              </p>
            ))}
          </div>
        </>
      )}

      {/* Confidence */}
      {arvResult && (
        <>
          <div className="w-full h-px bg-border mb-4" />
          <p className="text-center text-xs tracking-widest text-muted mb-3">CONFIDENCE</p>
          <div className="text-center mb-6">
            <ConfidenceBadge level={arvResult.confidence} />
            <p className="text-xs text-muted mt-2">{arvResult.confidence_reasoning}</p>
          </div>
        </>
      )}

      {/* Recommendation */}
      <div className="w-full h-px bg-border mb-4" />
      <p className="text-center text-xs tracking-widest text-muted mb-4">RECOMMENDATION</p>
      <div className={`rounded-xl ${recBg[rec]} p-6 text-center`}>
        <p className={`text-3xl font-black uppercase tracking-wider mb-3 ${recColors[rec]}`}>{rec}</p>
        <p className="text-sm text-muted leading-relaxed max-w-lg mx-auto">{recText}</p>
      </div>
    </div>
  );
}

function NumberRow({ label, value, highlight, negative, positive }: {
  label: string; value: string; highlight?: boolean; negative?: boolean; positive?: boolean;
}) {
  let valueColor = 'text-foreground';
  if (highlight) valueColor = 'text-gold';
  if (negative) valueColor = 'text-pass';
  if (positive) valueColor = 'text-go';

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-lg font-bold ${valueColor} ${highlight ? 'text-2xl' : ''}`} style={mono}>{value}</span>
    </div>
  );
}

// ─── Add Comp Modal ─────────────────────────────────────────────────────────

function AddCompModal({ subject, onAdd, onClose }: { subject: Subject; onAdd: (c: Comp) => void; onClose: () => void }) {
  const [comp, setComp] = useState<Partial<Comp>>({
    address: '', sale_price: undefined, sale_date: '', sqft: undefined, lot_sqft: undefined,
    beds: undefined, baths: undefined, year_built: undefined, property_type: subject.property_type,
    distance_miles: undefined, same_subdivision: true, crosses_major_road: false,
    has_pool: false, has_garage: false, garage_count: 0, has_carport: false,
    has_basement: false, basement_sqft: 0, has_guest_house: false, guest_house_sqft: 0,
  });

  const handleSubmit = () => {
    if (!comp.address || !comp.sale_price || !comp.sale_date) return;
    const daysOld = Math.floor((Date.now() - new Date(comp.sale_date).getTime()) / (1000 * 60 * 60 * 24));
    onAdd({
      address: comp.address,
      sale_price: Number(comp.sale_price),
      sale_date: comp.sale_date,
      days_old: daysOld,
      sqft: Number(comp.sqft) || 0,
      lot_sqft: Number(comp.lot_sqft) || 0,
      beds: Number(comp.beds) || 0,
      baths: Number(comp.baths) || 0,
      year_built: Number(comp.year_built) || 0,
      property_type: comp.property_type || '',
      distance_miles: Number(comp.distance_miles) || 0,
      same_subdivision: comp.same_subdivision ?? true,
      crosses_major_road: comp.crosses_major_road ?? false,
      has_pool: comp.has_pool ?? false,
      has_garage: comp.has_garage ?? false,
      garage_count: Number(comp.garage_count) || 0,
      has_carport: comp.has_carport ?? false,
      has_basement: comp.has_basement ?? false,
      basement_sqft: Number(comp.basement_sqft) || 0,
      has_guest_house: comp.has_guest_house ?? false,
      guest_house_sqft: Number(comp.guest_house_sqft) || 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fadeIn" onClick={onClose}>
      <div className="rounded-2xl border border-border bg-card p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">Add Comparable Sale</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg">&times;</button>
        </div>
        <div className="space-y-3">
          <input placeholder="Address *" value={comp.address} onChange={e => setComp(c => ({ ...c, address: e.target.value }))} className="input-std w-full" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Sale Price *</label>
              <input type="number" value={comp.sale_price ?? ''} onChange={e => setComp(c => ({ ...c, sale_price: Number(e.target.value) || undefined }))} className="input-std w-full" />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Sale Date *</label>
              <input type="date" value={comp.sale_date} onChange={e => setComp(c => ({ ...c, sale_date: e.target.value }))} className="input-std w-full" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><label className="block text-xs text-muted mb-1">Sqft</label><input type="number" value={comp.sqft ?? ''} onChange={e => setComp(c => ({ ...c, sqft: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">Lot Sqft</label><input type="number" value={comp.lot_sqft ?? ''} onChange={e => setComp(c => ({ ...c, lot_sqft: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">Beds</label><input type="number" value={comp.beds ?? ''} onChange={e => setComp(c => ({ ...c, beds: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
            <div><label className="block text-xs text-muted mb-1">Baths</label><input type="number" step="0.5" value={comp.baths ?? ''} onChange={e => setComp(c => ({ ...c, baths: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs text-muted mb-1">Year Built</label><input type="number" value={comp.year_built ?? ''} onChange={e => setComp(c => ({ ...c, year_built: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
            <div>
              <label className="block text-xs text-muted mb-1">Type</label>
              <select value={comp.property_type} onChange={e => setComp(c => ({ ...c, property_type: e.target.value }))} className="input-std w-full">
                {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="block text-xs text-muted mb-1">Distance (mi)</label><input type="number" step="0.1" value={comp.distance_miles ?? ''} onChange={e => setComp(c => ({ ...c, distance_miles: Number(e.target.value) || undefined }))} className="input-std w-full" /></div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={comp.same_subdivision} onChange={e => setComp(c => ({ ...c, same_subdivision: e.target.checked }))} className="accent-accent" /> Same subdivision
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={comp.crosses_major_road} onChange={e => setComp(c => ({ ...c, crosses_major_road: e.target.checked }))} className="accent-accent" /> Crosses major road
            </label>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={comp.has_pool} onChange={e => setComp(c => ({ ...c, has_pool: e.target.checked }))} className="accent-accent" /> Pool
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={comp.has_garage} onChange={e => setComp(c => ({ ...c, has_garage: e.target.checked }))} className="accent-accent" /> Garage
            </label>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={comp.has_carport} onChange={e => setComp(c => ({ ...c, has_carport: e.target.checked }))} className="accent-accent" /> Carport
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!comp.address || !comp.sale_price || !comp.sale_date}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent/80 transition-colors disabled:opacity-30">
            Add Comp
          </button>
        </div>
      </div>
    </div>
  );
}
