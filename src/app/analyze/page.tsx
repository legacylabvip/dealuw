'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { COMP_RULES } from '@/lib/compRules';
import { filterComps, adjustComps, calculateARV, type AdjustedComp, type ARVResult, type Adjustment } from '@/lib/compEngine';
import type { RepairEstimate, RepairLineItem } from '@/lib/repairEstimator';
import type { AllOffers, CashOffer, OwnerFinanceOffer, NovationOffer, NegotiationGuide } from '@/lib/offerCalculator';
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
  // Extended seller info
  seller_motivation: string;
  seller_timeline: string;
  monthly_rent: number | null;
  seller_notes: string;
  // From property lookup
  tax_assessed_value: number | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  subdivision: string | null;
}

interface UploadedPhoto {
  dataUrl: string;
  name: string;
  label: string;
}

interface AnalysisStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

interface FullReport {
  subject: Subject;
  photos: UploadedPhoto[];
  // Comp engine
  rawComps: Record<string, unknown>[];
  qualified: Record<string, unknown>[];
  disqualified: Record<string, unknown>[];
  adjusted: AdjustedComp[];
  arvResult: ARVResult | null;
  // Repairs
  repairEstimate: RepairEstimate | null;
  // Offers
  allOffers: AllOffers | null;
  negotiationGuide: NegotiationGuide | null;
  // Meta
  generatedAt: string;
  confidence: string;
}

type PageStep = 'input' | 'loading' | 'report';

// ─── Helpers ────────────────────────────────────────────────────────────────

const money = (n: number | null | undefined) =>
  n != null ? '$' + Math.round(n).toLocaleString() : '--';

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

const PROPERTY_TYPES = ['ranch', '2-story', 'split-level', 'historic', 'condo', 'townhouse', 'multi-family'];
const MOTIVATIONS = ['', 'Pre-foreclosure', 'Probate', 'Tired Landlord', 'Divorce', 'Relocation', 'Downsizing', 'Tax Liens', 'Other'];
const TIMELINES = ['', 'ASAP', '30 days', '60 days', 'Flexible'];

const defaultSubject: Subject = {
  address: '', city: '', state: '', zip: '',
  beds: null, baths: null, sqft: null, lot_sqft: null, year_built: null,
  property_type: 'ranch', condition: 'fair',
  has_pool: false, has_garage: false, garage_count: 0, has_carport: false,
  has_basement: false, basement_sqft: 0, has_guest_house: false, guest_house_sqft: 0,
  traffic_commercial: 'none', asking_price: null,
  seller_motivation: '', seller_timeline: '', monthly_rent: null, seller_notes: '',
  tax_assessed_value: null, last_sale_price: null, last_sale_date: null, subdivision: null,
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AnalyzePage() {
  const router = useRouter();
  const [step, setStep] = useState<PageStep>('input');
  const [subject, setSubject] = useState<Subject>(defaultSubject);
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [report, setReport] = useState<FullReport | null>(null);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNegGuide, setShowNegGuide] = useState(false);
  const [showDqComps, setShowDqComps] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dataSource, setDataSource] = useState<'zoria' | 'manual' | null>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooLongRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Export PDF ─────────────────────────────────────────────────

  const exportPDF = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const res = await fetch('/api/export-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: report.subject,
          arvResult: report.arvResult,
          repairEstimate: report.repairEstimate,
          allOffers: report.allOffers,
          adjusted: report.adjusted,
          generatedAt: report.generatedAt,
          confidence: report.confidence,
        }),
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DealUW_${report.subject.address.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  // ─── Photo upload ─────────────────────────────────────────────

  const handlePhotoUpload = useCallback((files: FileList | File[]) => {
    const max = 10;
    const remaining = max - photos.length;
    Array.from(files).slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) setPhotos(prev => prev.length < max ? [...prev, { dataUrl, name: file.name, label: '' }] : prev);
      };
      reader.readAsDataURL(file);
    });
  }, [photos.length]);

  // ─── Run Full Analysis ────────────────────────────────────────

  const updateStep = (idx: number, update: Partial<AnalysisStep>) => {
    setAnalysisSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...update } : s));
  };

  // Helper: fetch with abort controller and timeout
  const zoriaFetch = async (url: string, body: unknown, signal?: AbortSignal) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const mergedSignal = signal || controller.signal;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: mergedSignal,
      });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  };

  const runAnalysis = async () => {
    if (!subject.address) return;
    setStep('loading');
    setReport(null);
    setAiAnalysis(null);
    setDataSource(null);
    setLoadingTooLong(false);

    // Cancel any previous request
    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    // Show "taking longer" after 20s
    if (tooLongRef.current) clearTimeout(tooLongRef.current);
    tooLongRef.current = setTimeout(() => setLoadingTooLong(true), 20000);

    const steps: AnalysisStep[] = [
      { label: 'Asking Zoria to research property...', status: 'pending' },
      { label: 'Searching for comparable sales...', status: 'pending' },
      { label: 'Filtering comps (7 appraisal rules)...', status: 'pending' },
      { label: 'Applying adjustments...', status: 'pending' },
      { label: 'Calculating ARV...', status: 'pending' },
      { label: photos.length > 0 ? 'Analyzing photos for repairs...' : 'Estimating repairs...', status: 'pending' },
      { label: 'Running offer strategies...', status: 'pending' },
      { label: 'Generating report...', status: 'pending' },
    ];
    setAnalysisSteps(steps);

    let currentSubject = { ...subject };
    let rawComps: Record<string, unknown>[] = [];
    let source: 'zoria' | 'manual' = 'manual';

    try {
      // Step 0: Property lookup via Zoria
      updateStep(0, { status: 'running' });
      try {
        const lookupRes = await zoriaFetch('/api/lookup/property', {
          address: subject.address, city: subject.city, state: subject.state, zip: subject.zip,
        }, abort.signal);
        const lookupData = await lookupRes.json();
        if (lookupData.available && lookupData.property) {
          const p = lookupData.property;
          currentSubject = {
            ...currentSubject,
            address: p.address || currentSubject.address,
            city: p.city || currentSubject.city,
            state: p.state || currentSubject.state,
            zip: p.zip || currentSubject.zip,
            beds: p.beds ?? currentSubject.beds,
            baths: p.baths ?? currentSubject.baths,
            sqft: p.sqft ?? currentSubject.sqft,
            lot_sqft: p.lot_sqft ?? currentSubject.lot_sqft,
            year_built: p.year_built ?? currentSubject.year_built,
            property_type: p.property_type || currentSubject.property_type,
            has_pool: p.has_pool ?? currentSubject.has_pool,
            has_garage: p.has_garage ?? currentSubject.has_garage,
            garage_count: p.garage_count ?? currentSubject.garage_count,
            has_carport: p.has_carport ?? currentSubject.has_carport,
            has_basement: p.has_basement ?? currentSubject.has_basement,
            basement_sqft: p.basement_sqft ?? currentSubject.basement_sqft,
            has_guest_house: p.has_guest_house ?? currentSubject.has_guest_house,
            guest_house_sqft: p.guest_house_sqft ?? currentSubject.guest_house_sqft,
            tax_assessed_value: p.tax_assessed_value ?? null,
            last_sale_price: p.last_sale_price ?? null,
            last_sale_date: p.last_sale_date ?? null,
            subdivision: p.subdivision ?? null,
          };
          setSubject(currentSubject);
          source = 'zoria';
          updateStep(0, { status: 'done', detail: `${currentSubject.beds}bd/${currentSubject.baths}ba, ${currentSubject.sqft?.toLocaleString()} sqft` });
        } else {
          updateStep(0, { status: 'done', detail: 'Auto-lookup unavailable — using manual data' });
        }
      } catch (err) {
        if (abort.signal.aborted) throw err;
        updateStep(0, { status: 'done', detail: 'Zoria unavailable — using manual data' });
      }

      // Step 1: Pull comps via Zoria
      updateStep(1, { status: 'running' });
      try {
        const compsRes = await zoriaFetch('/api/lookup/comps', {
          address: currentSubject.address,
          city: currentSubject.city,
          state: currentSubject.state,
          zip: currentSubject.zip,
          subject_details: currentSubject,
        }, abort.signal);
        const compsData = await compsRes.json();
        if (compsData.available && compsData.comps?.length > 0) {
          rawComps = compsData.comps;
          source = 'zoria';
          updateStep(1, { status: 'done', detail: `${rawComps.length} comps found via Zoria` });
        } else {
          updateStep(1, { status: 'done', detail: 'No comps found — add manually' });
        }
      } catch (err) {
        if (abort.signal.aborted) throw err;
        updateStep(1, { status: 'done', detail: 'Comp search failed — add manually' });
      }

      setDataSource(source);

      // Step 2: Filter comps
      updateStep(2, { status: 'running' });
      const filtered = filterComps(currentSubject, rawComps);
      const qualified = filtered.qualified;
      const disqualified = filtered.disqualified;
      updateStep(2, { status: 'done', detail: `${qualified.length} qualified, ${disqualified.length} excluded` });

      // Step 3: Adjust comps
      updateStep(3, { status: 'running' });
      const adjusted = adjustComps(currentSubject, qualified);
      const totalAdj = adjusted.reduce((s, c) => s + Math.abs(c.total_adjustment), 0);
      updateStep(3, { status: 'done', detail: `${adjusted.length} comps adjusted, ${money(totalAdj)} total adjustments` });

      // Step 4: Calculate ARV
      updateStep(4, { status: 'running' });
      const arvResult = adjusted.length > 0 ? calculateARV(currentSubject, adjusted) : null;
      updateStep(4, { status: 'done', detail: arvResult ? `${money(arvResult.arv)} (${arvResult.confidence} confidence)` : 'No comps for ARV' });

      // Step 5: Repair estimate — photos go through Zoria, otherwise algorithmic
      updateStep(5, { status: 'running' });
      let repairEstimate: RepairEstimate | null = null;
      if (photos.length > 0) {
        // Try Zoria photo analysis first
        try {
          const repairRes = await zoriaFetch('/api/lookup/repairs', {
            photos: photos.map(p => ({ base64: p.dataUrl, label: p.label })),
            property: currentSubject,
          }, abort.signal);
          if (repairRes.ok) {
            repairEstimate = await repairRes.json();
            updateStep(5, { status: 'done', detail: `${money(repairEstimate?.total_recommended)} (Zoria AI photo)` });
          } else {
            throw new Error('Zoria photo analysis failed');
          }
        } catch (err) {
          if (abort.signal.aborted) throw err;
          // Fallback: try direct Anthropic API
          try {
            const fallbackRes = await zoriaFetch('/api/estimate-repairs', {
              property: currentSubject,
              photos: photos.map(p => p.dataUrl),
              mode: 'ai_photo',
            }, abort.signal);
            if (fallbackRes.ok) {
              repairEstimate = await fallbackRes.json();
              updateStep(5, { status: 'done', detail: `${money(repairEstimate?.total_recommended)} (AI photo fallback)` });
            } else {
              throw new Error('Photo fallback failed');
            }
          } catch (err2) {
            if (abort.signal.aborted) throw err2;
            // Final fallback: algorithmic
            try {
              const algoRes = await zoriaFetch('/api/estimate-repairs', {
                property: currentSubject,
                mode: 'algorithmic',
              }, abort.signal);
              if (algoRes.ok) {
                repairEstimate = await algoRes.json();
                updateStep(5, { status: 'done', detail: `${money(repairEstimate?.total_recommended)} (algorithmic fallback)` });
              }
            } catch { /* ignore */ }
            if (!repairEstimate) updateStep(5, { status: 'done', detail: 'Estimate unavailable' });
          }
        }
      } else {
        // No photos — algorithmic estimate
        try {
          const repairRes = await zoriaFetch('/api/estimate-repairs', {
            property: currentSubject,
            mode: 'algorithmic',
          }, abort.signal);
          if (repairRes.ok) {
            repairEstimate = await repairRes.json();
            updateStep(5, { status: 'done', detail: `${money(repairEstimate?.total_recommended)} (algorithmic)` });
          } else {
            updateStep(5, { status: 'done', detail: 'Estimate unavailable' });
          }
        } catch (err) {
          if (abort.signal.aborted) throw err;
          updateStep(5, { status: 'done', detail: 'Estimate failed' });
        }
      }

      // Step 6: Offer strategies
      updateStep(6, { status: 'running' });
      let allOffers: AllOffers | null = null;
      let negotiationGuide: NegotiationGuide | null = null;
      const arv = arvResult?.arv ?? 0;
      const repairs = repairEstimate?.total_recommended ?? 0;
      if (arv > 0) {
        const { calculateAllOffers, generateNegotiationGuide } = await import('@/lib/offerCalculator');
        allOffers = calculateAllOffers({
          arv,
          repairs,
          asking_price: currentSubject.asking_price,
          property: currentSubject,
          market_rent: currentSubject.monthly_rent,
        });
        negotiationGuide = generateNegotiationGuide(allOffers, currentSubject.asking_price);
        updateStep(6, { status: 'done', detail: `Best: ${allOffers.best_strategy}` });
      } else {
        updateStep(6, { status: 'done', detail: 'Need ARV for offers' });
      }

      // Step 7: Generate report
      updateStep(7, { status: 'running' });
      const confidence = arvResult?.confidence ?? 'low';
      const fullReport: FullReport = {
        subject: currentSubject,
        photos,
        rawComps,
        qualified,
        disqualified,
        adjusted,
        arvResult,
        repairEstimate,
        allOffers,
        negotiationGuide,
        generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        confidence,
      };
      setReport(fullReport);
      updateStep(7, { status: 'done', detail: 'Complete' });

      // Clear timers
      if (tooLongRef.current) clearTimeout(tooLongRef.current);
      setLoadingTooLong(false);

      // Transition to report
      setTimeout(() => setStep('report'), 600);
    } catch (err) {
      if (tooLongRef.current) clearTimeout(tooLongRef.current);
      if (abort.signal.aborted) {
        setAnalysisSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: 'Cancelled' } : s));
      } else {
        const msg = err instanceof Error ? err.message : 'Analysis failed';
        setAnalysisSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s));
      }
    }
  };

  // ─── Re-pull from Zoria ─────────────────────────────────────────

  const repullProperty = async () => {
    if (!report) return;
    setDataSource(null);
    try {
      const res = await fetch('/api/lookup/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: report.subject.address, city: report.subject.city, state: report.subject.state, zip: report.subject.zip }),
      });
      const data = await res.json();
      if (data.available && data.property) {
        const p = data.property;
        const updated = { ...report.subject, ...p };
        setSubject(updated);
        setReport({ ...report, subject: updated });
        setDataSource('zoria');
      }
    } catch { /* ignore */ }
  };

  const repullComps = async () => {
    if (!report) return;
    try {
      const res = await fetch('/api/lookup/comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: report.subject.address,
          city: report.subject.city,
          state: report.subject.state,
          zip: report.subject.zip,
          subject_details: report.subject,
        }),
      });
      const data = await res.json();
      if (data.available && data.comps?.length > 0) {
        const newFiltered = filterComps(report.subject, data.comps);
        const newAdjusted = adjustComps(report.subject, newFiltered.qualified);
        const newArv = newAdjusted.length > 0 ? calculateARV(report.subject, newAdjusted) : null;
        setReport({
          ...report,
          rawComps: data.comps,
          qualified: newFiltered.qualified,
          disqualified: newFiltered.disqualified,
          adjusted: newAdjusted,
          arvResult: newArv,
          confidence: newArv?.confidence ?? 'low',
        });
        setDataSource('zoria');
      }
    } catch { /* ignore */ }
  };

  // ─── Save to Pipeline ─────────────────────────────────────────

  const saveToPipeline = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const r = report;
      await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...r.subject,
          arv_raw: r.arvResult?.arv,
          arv_adjusted: r.arvResult?.arv,
          repair_estimate: r.repairEstimate?.total_recommended,
          mao: r.allOffers?.cash.mao,
          assignment_fee: r.allOffers?.cash.assignment_fee.target,
          recommendation: r.allOffers?.best_strategy === 'Pass' ? 'pass' : r.allOffers?.cash.works ? 'go' : 'negotiate',
          confidence: r.confidence,
          status: 'analyzing',
          comps_data: JSON.stringify(r.adjusted),
          repair_breakdown: JSON.stringify(r.repairEstimate),
          adjustments_applied: JSON.stringify(r.arvResult?.adjustments_summary),
        }),
      });
      setSaving(false);
      router.push('/pipeline');
    } catch {
      setSaving(false);
    }
  };

  // ─── AI Second Opinion ────────────────────────────────────────

  const runAiOpinion = async () => {
    if (!report || !report.arvResult || !report.allOffers) return;
    setAiLoading(true);
    try {
      const r = report;
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: r.subject,
          compsUsed: r.adjusted.map(c => ({
            address: c.address, sale_price: c.sale_price, adjusted_price: c.adjusted_price,
            days_old: c.days_old, sqft: c.sqft, distance_miles: c.distance_miles, adjustments: c.adjustments,
          })),
          compsDisqualified: r.disqualified.map((c: Record<string, unknown>) => ({
            address: c.address, sale_price: c.sale_price, disqualified_reasons: c.disqualified_reasons,
          })),
          arvResult: r.arvResult,
          maoResult: { mao: r.allOffers!.cash.mao, breakdown: { asking_price: r.subject.asking_price, spread: r.allOffers!.cash.spread } },
          repairEstimate: r.repairEstimate?.total_recommended ?? 0,
          repairBreakdown: r.repairEstimate?.line_items.map(i => `${i.category}: ${money(i.recommended)}`).join(', ') ?? '',
        }),
      });
      if (res.ok) {
        setAiAnalysis(await res.json());
      }
    } catch { /* ignore */ }
    setAiLoading(false);
  };

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-8">

        {/* ═══ STEP 1: INPUT ═══ */}
        {step === 'input' && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl font-bold text-foreground mb-1">New Deal Analysis</h1>
            <p className="text-sm text-muted mb-8">Enter property details and run a full CMA with offer strategies.</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Left: Address */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Property Address</h3>
                <input
                  type="text"
                  placeholder="Enter property address..."
                  value={subject.address}
                  onChange={e => setSubject(s => ({ ...s, address: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-5 py-4 text-lg text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none transition-colors mb-3"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input placeholder="City" value={subject.city} onChange={e => setSubject(s => ({ ...s, city: e.target.value }))} className="input-std" />
                  <input placeholder="State" value={subject.state} onChange={e => setSubject(s => ({ ...s, state: e.target.value }))} className="input-std" />
                  <input placeholder="ZIP" value={subject.zip} onChange={e => setSubject(s => ({ ...s, zip: e.target.value }))} className="input-std" />
                </div>
              </div>

              {/* Right: Photos */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Seller Photos <span className="text-muted font-normal">(optional)</span></h3>
                <div
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-accent'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('border-accent'); }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-accent'); handlePhotoUpload(e.dataTransfer.files); }}
                  onClick={() => document.getElementById('photo-input')?.click()}
                  className="rounded-lg border-2 border-dashed border-border bg-background/30 p-4 text-center cursor-pointer hover:border-accent/50 transition-colors"
                >
                  <input id="photo-input" type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple className="hidden" onChange={e => { if (e.target.files) handlePhotoUpload(e.target.files); e.target.value = ''; }} />
                  <p className="text-sm text-muted">Drop photos or click to browse</p>
                  <p className="text-xs text-muted/50 mt-1">JPG, PNG, HEIC &middot; Max 10 &middot; AI analyzes visible repairs</p>
                </div>
                {photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative group">
                        <img src={p.dataUrl} alt={p.name} className="w-16 h-16 object-cover rounded-lg border border-border" />
                        <button onClick={e => { e.stopPropagation(); setPhotos(prev => prev.filter((_, j) => j !== i)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pass text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                        <select value={p.label} onChange={e => setPhotos(prev => prev.map((ph, j) => j === i ? { ...ph, label: e.target.value } : ph))} onClick={e => e.stopPropagation()} className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-white border-0 py-0 px-0.5 rounded-b-lg">
                          <option value="">Label</option>
                          {['Kitchen', 'Bathroom', 'Exterior', 'Roof', 'Living Room', 'Bedroom', 'Basement', 'Yard'].map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                    ))}
                    <span className="text-[10px] text-muted self-end">{photos.length}/10</span>
                  </div>
                )}
              </div>
            </div>

            {/* Seller Info */}
            <div className="rounded-xl border border-border bg-card p-6 mb-6">
              <h3 className="text-sm font-semibold text-accent mb-4">Seller Info <span className="text-muted font-normal">(optional — from your conversation)</span></h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Asking Price</label>
                  <input type="number" placeholder="$0" value={subject.asking_price ?? ''} onChange={e => setSubject(s => ({ ...s, asking_price: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Motivation</label>
                  <select value={subject.seller_motivation} onChange={e => setSubject(s => ({ ...s, seller_motivation: e.target.value }))} className="input-std w-full">
                    {MOTIVATIONS.map(m => <option key={m} value={m}>{m || 'Select...'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Timeline</label>
                  <select value={subject.seller_timeline} onChange={e => setSubject(s => ({ ...s, seller_timeline: e.target.value }))} className="input-std w-full">
                    {TIMELINES.map(t => <option key={t} value={t}>{t || 'Select...'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">Monthly Rent (if rented)</label>
                  <input type="number" placeholder="$0" value={subject.monthly_rent ?? ''} onChange={e => setSubject(s => ({ ...s, monthly_rent: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} />
                </div>
              </div>
              <textarea placeholder="Notes from seller conversation..." value={subject.seller_notes} onChange={e => setSubject(s => ({ ...s, seller_notes: e.target.value }))} rows={2} className="input-std w-full resize-none" />
            </div>

            {/* Run Button */}
            <button onClick={runAnalysis} disabled={!subject.address} className="w-full rounded-xl bg-accent py-5 text-lg font-bold text-white transition-all hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed">
              Run Full Analysis
            </button>
          </div>
        )}

        {/* ═══ STEP 2: LOADING ═══ */}
        {step === 'loading' && (
          <div className="animate-fadeIn max-w-xl mx-auto py-16">
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-foreground mb-2">Analyzing Deal...</h2>
              <p className="text-sm text-muted">{subject.address}</p>
              <p className="text-xs text-muted/50 mt-2">Zoria is searching the web for data. This may take 15-30 seconds.</p>
            </div>
            <div className="space-y-4">
              {analysisSteps.map((s, i) => (
                <div key={i} className={`flex items-start gap-3 transition-opacity duration-300 ${s.status === 'pending' ? 'opacity-30' : 'opacity-100'}`}>
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center mt-0.5">
                    {s.status === 'done' && <span className="text-go text-lg">&#10003;</span>}
                    {s.status === 'running' && (
                      <svg className="animate-spin h-5 w-5 text-accent" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                    )}
                    {s.status === 'error' && <span className="text-pass text-lg">&#10007;</span>}
                    {s.status === 'pending' && <span className="w-2 h-2 rounded-full bg-border" />}
                  </div>
                  <div>
                    <p className={`text-sm ${s.status === 'running' ? 'text-accent font-medium' : s.status === 'done' ? 'text-foreground' : 'text-muted'}`}>{s.label}</p>
                    {s.detail && <p className="text-xs text-muted/70 mt-0.5">{s.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
            {loadingTooLong && (
              <div className="mt-8 text-center animate-fadeIn">
                <p className="text-xs text-negotiate mb-3">Taking longer than expected...</p>
                <button
                  onClick={() => { if (abortRef.current) abortRef.current.abort(); setStep('input'); setLoadingTooLong(false); }}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:text-foreground transition-colors"
                >
                  Switch to manual entry
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: THE REPORT ═══ */}
        {step === 'report' && report && (
          <div className="animate-fadeIn">
            {/* Report Header */}
            <div className="rounded-xl border border-accent/20 bg-card p-6 mb-8">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xs font-bold tracking-widest text-accent mb-1" style={{ fontFamily: "'Cinzel', serif" }}>DealUW Analysis Report</h1>
                  <p className="text-xl font-bold text-foreground">{report.subject.address}</p>
                  <p className="text-sm text-muted">{report.subject.city}{report.subject.state ? `, ${report.subject.state}` : ''} {report.subject.zip}</p>
                  <p className="text-xs text-muted mt-1">Generated: {report.generatedAt}</p>
                  {dataSource && (
                    <p className="text-xs mt-2">
                      <span className={`rounded-full px-2 py-0.5 ${dataSource === 'zoria' ? 'bg-accent/10 text-accent' : 'bg-border text-muted'}`}>
                        {dataSource === 'zoria' ? 'Data: Zoria (AI-powered)' : 'Data: Manual entry'}
                      </span>
                    </p>
                  )}
                </div>
                <ConfidenceBadge level={report.confidence} />
              </div>
            </div>

            {/* ═══ SECTION 1: Property Overview ═══ */}
            <div className="flex items-center justify-between mb-4 mt-2">
              <SectionHeader title="Property Overview" />
              <button onClick={repullProperty} className="text-[11px] text-accent/60 hover:text-accent transition-colors flex items-center gap-1">
                <span>&#8635;</span> Re-pull from Zoria
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="space-y-2 text-sm">
                  <DataRow label="Address" value={report.subject.address} />
                  <DataRow label="Location" value={`${report.subject.city || '—'}, ${report.subject.state || '—'} ${report.subject.zip || ''}`} />
                  <DataRow label="Beds / Baths" value={`${report.subject.beds ?? '—'} / ${report.subject.baths ?? '—'}`} />
                  <DataRow label="Square Feet" value={report.subject.sqft?.toLocaleString() ?? '—'} mono />
                  <DataRow label="Lot Sqft" value={report.subject.lot_sqft?.toLocaleString() ?? '—'} mono />
                  <DataRow label="Year Built" value={String(report.subject.year_built ?? '—')} />
                  <DataRow label="Type" value={report.subject.property_type} />
                  <DataRow label="Condition" value={report.subject.condition} />
                  {report.subject.has_pool && <DataRow label="Pool" value="Yes" />}
                  {report.subject.has_garage && <DataRow label="Garage" value={`${report.subject.garage_count} bay${report.subject.garage_count !== 1 ? 's' : ''}`} />}
                  {report.subject.has_basement && <DataRow label="Basement" value={`${report.subject.basement_sqft} sqft (valued at 50%)`} />}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                {report.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {report.photos.slice(0, 4).map((p, i) => (
                      <img key={i} src={p.dataUrl} alt={p.label || p.name} className="w-24 h-24 object-cover rounded-lg border border-border" />
                    ))}
                    {report.photos.length > 4 && <span className="text-xs text-muted self-end">+{report.photos.length - 4} more</span>}
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  {report.subject.tax_assessed_value && <DataRow label="Tax Assessed" value={money(report.subject.tax_assessed_value)} mono />}
                  {report.subject.last_sale_price && <DataRow label="Last Sale" value={`${money(report.subject.last_sale_price)} on ${report.subject.last_sale_date || '—'}`} mono />}
                  <DataRow label="Asking Price" value={report.subject.asking_price ? money(report.subject.asking_price) : 'Not disclosed'} mono />
                  {report.subject.seller_motivation && <DataRow label="Motivation" value={report.subject.seller_motivation} />}
                  {report.subject.seller_timeline && <DataRow label="Timeline" value={report.subject.seller_timeline} />}
                  {report.subject.monthly_rent && <DataRow label="Current Rent" value={`${money(report.subject.monthly_rent)}/mo`} mono />}
                </div>
              </div>
            </div>

            {/* ═══ SECTION 2: Comparable Sales ═══ */}
            <div className="flex items-center justify-between mb-4 mt-2">
              <SectionHeader title="Comparable Sales Analysis" badge={`${report.qualified.length + report.disqualified.length} found`} />
              <button onClick={repullComps} className="text-[11px] text-accent/60 hover:text-accent transition-colors flex items-center gap-1">
                <span>&#8635;</span> Re-pull from Zoria
              </button>
            </div>

            {/* Summary bar */}
            <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 mb-4 flex items-center gap-4 text-xs text-muted flex-wrap">
              <span><span className="text-go font-bold">{report.qualified.length}</span> qualified</span>
              <span className="text-border">|</span>
              <span><span className="text-pass font-bold">{report.disqualified.length}</span> disqualified</span>
              <span className="text-border">|</span>
              <span>Confidence: <ConfidenceBadge level={report.confidence} /></span>
            </div>

            {/* Comp cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {report.adjusted.slice(0, 6).map((comp, i) => (
                <CompCard key={i} comp={comp} subject={report.subject} />
              ))}
            </div>

            {/* Disqualified comps */}
            {report.disqualified.length > 0 && (
              <div className="mb-4">
                <button onClick={() => setShowDqComps(!showDqComps)} className="text-xs text-muted hover:text-foreground transition-colors">
                  {showDqComps ? 'Hide' : 'Show'} {report.disqualified.length} excluded comp{report.disqualified.length !== 1 ? 's' : ''} &#9662;
                </button>
                {showDqComps && (
                  <div className="mt-2 space-y-2">
                    {report.disqualified.map((c: Record<string, unknown>, i: number) => (
                      <div key={i} className="rounded-lg border border-pass/20 bg-pass/5 px-4 py-2 text-xs">
                        <span className="text-foreground font-medium">{String(c.address)}</span>
                        <span className="text-muted ml-2">{money(c.sale_price as number)}</span>
                        <span className="text-pass ml-2">{(c.disqualified_reasons as string[])?.join('; ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ARV Result */}
            {report.arvResult && (
              <div className="rounded-xl border border-gold/30 bg-card p-6 mb-8 text-center">
                <p className="text-xs text-muted mb-1">After Repair Value (ARV)</p>
                <p className="text-4xl font-black text-gold mb-2" style={mono}>{money(report.arvResult.arv)}</p>
                <p className="text-sm text-muted mb-3">{report.arvResult.method}</p>
                <ConfidenceBadge level={report.arvResult.confidence} />
                <p className="text-xs text-muted mt-2 max-w-lg mx-auto">{report.arvResult.confidence_reasoning}</p>
              </div>
            )}

            {/* ═══ SECTION 3: Repair Estimate ═══ */}
            {report.repairEstimate && (
              <>
                <SectionHeader title="Estimated Repairs" badge={money(report.repairEstimate.total_recommended)} />
                {report.repairEstimate.mode === 'ai_photo' && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="rounded-full bg-accent/10 text-accent px-3 py-0.5 text-xs font-bold">AI Photo Analysis</span>
                    <span className="text-xs text-muted">Condition: {report.repairEstimate.overall_condition}</span>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted">
                        <th className="text-left px-4 py-2.5 font-medium">Category</th>
                        <th className="text-left px-4 py-2.5 font-medium">Description</th>
                        <th className="text-right px-4 py-2.5 font-medium">Low</th>
                        <th className="text-right px-4 py-2.5 font-medium">Recommended</th>
                        <th className="text-right px-4 py-2.5 font-medium">High</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.repairEstimate.line_items.map((item: RepairLineItem, i: number) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 capitalize font-medium flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${item.urgency === 'high' ? 'bg-pass' : item.urgency === 'medium' ? 'bg-negotiate' : 'bg-go'}`} />
                            {item.category.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-2.5 text-muted">{item.description}</td>
                          <td className="px-4 py-2.5 text-right text-muted" style={mono}>{money(item.estimate_low)}</td>
                          <td className="px-4 py-2.5 text-right text-gold font-semibold" style={mono}>{money(item.recommended)}</td>
                          <td className="px-4 py-2.5 text-right text-muted" style={mono}>{money(item.estimate_high)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-bold">
                        <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                        <td className="px-4 py-3 text-right text-muted" style={mono}>{money(report.repairEstimate.total_low)}</td>
                        <td className="px-4 py-3 text-right text-gold text-lg" style={mono}>{money(report.repairEstimate.total_recommended)}</td>
                        <td className="px-4 py-3 text-right text-muted" style={mono}>{money(report.repairEstimate.total_high)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}

            {/* ═══ SECTION 4: Three Offers ═══ */}
            {report.allOffers && (
              <>
                <SectionHeader title="Offer Strategies" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
                  <CashOfferCard offer={report.allOffers.cash} />
                  <OwnerFinanceCard offer={report.allOffers.owner_finance} />
                  <NovationCard offer={report.allOffers.novation} />
                </div>

                {/* Best Strategy Banner */}
                <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 mb-8">
                  <p className="text-sm font-bold text-gold mb-2">Recommended Strategy</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{report.allOffers.strategy_reasoning}</p>
                </div>

                {/* Deal Comparison Table */}
                <div className="rounded-xl border border-border bg-card overflow-hidden mb-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted">
                        <th className="text-left px-4 py-2.5 font-medium">Metric</th>
                        <th className="text-center px-4 py-2.5 font-medium">Cash</th>
                        <th className="text-center px-4 py-2.5 font-medium">Owner Finance</th>
                        <th className="text-center px-4 py-2.5 font-medium">Novation</th>
                      </tr>
                    </thead>
                    <tbody>
                      <CompareRow label="Seller Gets" cash={money(report.allOffers.cash.mao)} of={`${money(report.allOffers.owner_finance.total_seller_receives)} (over ${report.allOffers.owner_finance.term_years}yr)`} nov={money(report.allOffers.novation.seller_price)} />
                      <CompareRow label="Your Profit" cash={`${money(report.allOffers.cash.assignment_fee.conservative)}-${money(report.allOffers.cash.assignment_fee.aggressive)}`} of={`${money(report.allOffers.owner_finance.assignment_fee)} + ${money(report.allOffers.owner_finance.monthly_cashflow)}/mo`} nov={money(report.allOffers.novation.wholesaler_profit)} />
                      <CompareRow label="Time to Close" cash="7-14 days" of="30 days" nov={report.allOffers.novation.estimated_timeline} />
                      <CompareRow label="Works?" cash={report.allOffers.cash.works ? 'Yes' : 'No'} of={report.allOffers.owner_finance.works ? 'Yes' : 'No'} nov={report.allOffers.novation.works ? 'Yes' : 'No'} />
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ═══ SECTION 5: Negotiation Guide ═══ */}
            {report.negotiationGuide && (
              <>
                <button onClick={() => setShowNegGuide(!showNegGuide)} className="w-full rounded-xl border border-accent/20 bg-accent/5 px-6 py-4 flex items-center justify-between hover:bg-accent/10 transition-colors mb-2">
                  <span className="text-sm font-semibold text-accent">Negotiation Guide</span>
                  <span className={`text-muted transition-transform ${showNegGuide ? 'rotate-180' : ''}`}>&#9662;</span>
                </button>
                {showNegGuide && (
                  <div className="rounded-xl border border-border bg-card p-6 mb-8 space-y-5 animate-fadeIn">
                    <NegSection title="Opening" text={report.negotiationGuide.opening} />
                    <NegSection title="If Rejected" text={report.negotiationGuide.if_rejected} />
                    <NegSection title="If Still Rejected" text={report.negotiationGuide.if_still_rejected} />
                    <NegSection title="Walk Away" text={report.negotiationGuide.walk_away} />
                    <div>
                      <p className="text-xs font-bold text-muted mb-2 tracking-wider">KEY POINTS</p>
                      <ul className="space-y-1.5">
                        {report.negotiationGuide.key_points.map((pt, i) => (
                          <li key={i} className="text-xs text-muted/80 flex items-start gap-2">
                            <span className="text-accent mt-0.5">&#8226;</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ═══ AI Second Opinion ═══ */}
            {aiAnalysis && (
              <div className="mb-8 space-y-3">
                <h3 className="text-sm font-semibold text-accent">AI Second Opinion</h3>
                {aiAnalysis.points.map(pt => (
                  <div key={pt.number} className="rounded-lg border border-border bg-card p-4 flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center" style={mono}>{pt.number}</span>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{pt.text}</p>
                  </div>
                ))}
                <p className="text-xs text-muted/40 text-center">AI analysis: ~$0.01 &middot; {aiAnalysis.usage.input_tokens + aiAnalysis.usage.output_tokens} tokens</p>
              </div>
            )}

            {/* ═══ Action Buttons ═══ */}
            <div className="flex items-center justify-center gap-4 flex-wrap py-4">
              <button onClick={saveToPipeline} disabled={saving} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save to Pipeline'}
              </button>
              <button onClick={exportPDF} disabled={exporting} className="rounded-xl border border-accent/50 px-6 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
                {exporting ? 'Generating...' : 'Export PDF'}
              </button>
              <button disabled className="rounded-xl border border-border px-6 py-3 text-sm text-muted cursor-not-allowed opacity-50">
                Share Report
              </button>
              <button onClick={runAiOpinion} disabled={aiLoading || !report.arvResult} className="rounded-xl border border-accent/50 px-6 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-50">
                {aiLoading ? 'Analyzing...' : aiAnalysis ? 'Re-run AI Opinion' : 'Get AI Second Opinion'}
              </button>
              <button onClick={() => { setSubject(defaultSubject); setPhotos([]); setReport(null); setAiAnalysis(null); setStep('input'); }} className="rounded-xl border border-border px-6 py-3 text-sm text-muted hover:text-foreground transition-colors">
                New Analysis
              </button>
            </div>
          </div>
        )}
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
      `}</style>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4 mt-2">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {badge && <span className="rounded-full bg-accent/10 px-3 py-0.5 text-xs font-bold text-accent">{badge}</span>}
    </div>
  );
}

function DataRow({ label, value, mono: useMono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0">
      <span className="text-muted text-xs">{label}</span>
      <span className={`text-foreground text-sm ${useMono ? 'font-semibold' : ''}`} style={useMono ? { fontFamily: "'JetBrains Mono', monospace" } : undefined}>{value}</span>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = { high: 'bg-go/10 text-go border-go/30', medium: 'bg-negotiate/10 text-negotiate border-negotiate/30', low: 'bg-pass/10 text-pass border-pass/30' };
  return <span className={`rounded-full border px-3 py-0.5 text-xs font-bold uppercase ${colors[level] || colors.low}`}>{level}</span>;
}

function CompCard({ comp, subject }: { comp: AdjustedComp; subject: Subject }) {
  const hasFlagWarnings = comp.warnings && comp.warnings.length > 0;
  return (
    <div className={`rounded-xl border bg-card p-4 ${hasFlagWarnings ? 'border-negotiate/30' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-foreground">{comp.address}</p>
        {comp.same_subdivision && <span className="text-[10px] bg-go/10 text-go rounded-full px-2 py-0.5">Same subdivision</span>}
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-muted text-xs">Sold:</span>
        <span className="text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(comp.sale_price)}</span>
        <span className="text-muted text-xs">&rarr;</span>
        <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: comp.total_adjustment >= 0 ? '#22C55E' : '#EF4444' }}>
          {money(comp.adjusted_price)}
        </span>
      </div>
      <p className="text-xs text-muted mb-2">
        {comp.beds}bd/{comp.baths}ba &middot; {comp.sqft?.toLocaleString()} sqft &middot; {comp.distance_miles?.toFixed(1)} mi &middot; {comp.days_old}d ago
      </p>
      {comp.adjustments.filter((a: Adjustment) => a.amount !== 0).length > 0 && (
        <div className="border-t border-border/50 pt-2 mt-1 space-y-0.5">
          {comp.adjustments.filter((a: Adjustment) => a.amount !== 0).map((adj: Adjustment, i: number) => (
            <p key={i} className="text-[11px] text-muted">
              <span className="capitalize">{adj.type.replace(/_/g, ' ')}</span>: <span className={adj.amount >= 0 ? 'text-go' : 'text-pass'} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{adj.amount >= 0 ? '+' : ''}{money(adj.amount)}</span>
            </p>
          ))}
          <p className="text-[11px] font-semibold text-muted">
            Net: <span className={comp.total_adjustment >= 0 ? 'text-go' : 'text-pass'} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{comp.total_adjustment >= 0 ? '+' : ''}{money(comp.total_adjustment)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function CashOfferCard({ offer }: { offer: CashOffer }) {
  return (
    <div className={`rounded-xl border p-5 ${offer.works ? 'border-go/30 bg-go/[0.03]' : 'border-border bg-card'}`}>
      <p className="text-xs text-muted mb-1">CASH OFFER</p>
      <p className="text-sm text-muted mb-3">Fast close. Lowest price. Highest certainty.</p>
      <p className="text-xs text-muted mb-0.5">Maximum Offer (MAO)</p>
      <p className="text-3xl font-black text-gold mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.mao)}</p>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted">Start at:</span><span className="text-foreground font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.suggested_starting_offer)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Walk away above:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.walk_away_price)}</span></div>
        <div className="h-px bg-border" />
        <div className="flex justify-between"><span className="text-muted">Your Profit:</span><span className="text-go font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.assignment_fee.conservative)}-{money(offer.assignment_fee.aggressive)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Buyer Profit:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.buyer_profit_at_mao)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Buyer ROI:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{offer.buyer_roi}%</span></div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${offer.works ? 'bg-go/10 text-go' : 'bg-pass/10 text-pass'}`}>
        {offer.works ? 'Deal works at MAO' : 'Numbers don\'t work'}
      </div>
    </div>
  );
}

function OwnerFinanceCard({ offer }: { offer: OwnerFinanceOffer }) {
  return (
    <div className={`rounded-xl border p-5 ${offer.works ? 'border-accent/30 bg-accent/[0.03]' : 'border-border bg-card'}`}>
      <p className="text-xs text-muted mb-1">OWNER FINANCE</p>
      <p className="text-sm text-muted mb-3">Higher price for seller. Monthly income stream.</p>
      <p className="text-xs text-muted mb-0.5">Purchase Price</p>
      <p className="text-3xl font-black text-gold mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.purchase_price)}</p>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted">Down:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.down_payment)} ({(offer.down_payment_pct * 100).toFixed(0)}%)</span></div>
        <div className="flex justify-between"><span className="text-muted">Terms:</span><span className="text-foreground">{(offer.interest_rate * 100).toFixed(0)}% / {offer.term_years}yr</span></div>
        <div className="flex justify-between"><span className="text-muted">Monthly:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.monthly_payment)}</span></div>
        <div className="h-px bg-border" />
        <div className="flex justify-between"><span className="text-muted">Start at:</span><span className="text-foreground font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.suggested_starting_offer.price)} / {(offer.suggested_starting_offer.interest_rate * 100).toFixed(0)}%</span></div>
        <div className="h-px bg-border" />
        <div className="flex justify-between"><span className="text-muted">Cash Flow:</span><span className={`font-semibold ${offer.monthly_cashflow >= 0 ? 'text-go' : 'text-pass'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.market_rent)} - {money(offer.monthly_payment)} = {money(offer.monthly_cashflow)}/mo</span></div>
        <div className="flex justify-between"><span className="text-muted">Your Fee:</span><span className="text-go font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.assignment_fee)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Seller Total:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.total_seller_receives)}</span></div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${offer.works ? 'bg-accent/10 text-accent' : 'bg-pass/10 text-pass'}`}>
        {offer.works ? 'Works if seller wants monthly income' : 'Negative cash flow'}
      </div>
    </div>
  );
}

function NovationCard({ offer }: { offer: NovationOffer }) {
  return (
    <div className={`rounded-xl border p-5 ${offer.works ? 'border-negotiate/30 bg-negotiate/[0.03]' : 'border-border bg-card'}`}>
      <p className="text-xs text-muted mb-1">NOVATION</p>
      <p className="text-sm text-muted mb-3">Highest payout for seller. You coordinate the rehab.</p>
      <p className="text-xs text-muted mb-0.5">Seller Net Price</p>
      <p className="text-3xl font-black text-gold mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.seller_price)}</p>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between"><span className="text-muted">Renovate for:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.renovation_cost)}</span></div>
        <div className="flex justify-between"><span className="text-muted">List at:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.listing_price)}</span></div>
        <div className="h-px bg-border" />
        <div className="flex justify-between"><span className="text-muted">Commission:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.agent_commission)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Closing:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.closing_costs)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Holding:</span><span className="text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.holding_costs)} ({offer.estimated_holding_months}mo)</span></div>
        <div className="h-px bg-border" />
        <div className="flex justify-between"><span className="text-muted">Start at:</span><span className="text-foreground font-semibold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.suggested_starting_offer.seller_price)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Your Profit:</span><span className="text-go font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{money(offer.wholesaler_profit)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Timeline:</span><span className="text-foreground">~{offer.estimated_timeline}</span></div>
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${offer.works ? 'bg-negotiate/10 text-negotiate' : 'bg-pass/10 text-pass'}`}>
        {offer.works ? 'Best if seller wants maximum price' : 'Insufficient margin'}
      </div>
    </div>
  );
}

function CompareRow({ label, cash, of, nov }: { label: string; cash: string; of: string; nov: string }) {
  return (
    <tr className="border-b border-border/50">
      <td className="px-4 py-2.5 text-muted font-medium">{label}</td>
      <td className="px-4 py-2.5 text-center text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{cash}</td>
      <td className="px-4 py-2.5 text-center text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{of}</td>
      <td className="px-4 py-2.5 text-center text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{nov}</td>
    </tr>
  );
}

function NegSection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-bold text-accent mb-1 tracking-wider uppercase">{title}</p>
      <p className="text-sm text-foreground/80 leading-relaxed italic bg-background/50 rounded-lg p-3 border border-border/50">{text}</p>
    </div>
  );
}
