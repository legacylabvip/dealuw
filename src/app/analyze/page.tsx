'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import AddressAutocomplete from '@/components/AddressAutocomplete';
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
  seller_motivation: string;
  seller_timeline: string;
  monthly_rent: number | null;
  seller_notes: string;
  tax_assessed_value: number | null;
  last_sale_price: number | null;
  last_sale_date: string | null;
  subdivision: string | null;
}

interface ManualComp {
  address: string;
  sale_price: number;
  sale_date: string;
  sqft: number;
  beds: number;
  baths: number;
  year_built: number;
  distance_miles: number;
  same_subdivision: boolean;
  property_type: string;
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
  rawComps: Record<string, unknown>[];
  qualified: Record<string, unknown>[];
  disqualified: Record<string, unknown>[];
  adjusted: AdjustedComp[];
  arvResult: ARVResult | null;
  repairEstimate: RepairEstimate | null;
  allOffers: AllOffers | null;
  negotiationGuide: NegotiationGuide | null;
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

const emptyManualComp: ManualComp = {
  address: '', sale_price: 0, sale_date: '', sqft: 0, beds: 3, baths: 2,
  year_built: 2000, distance_miles: 0.5, same_subdivision: false, property_type: 'ranch',
};

// Monthly payment calc
function calcMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || annualRate <= 0 || years <= 0) return 0;
  const r = annualRate / 12;
  const n = years * 12;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── Toast ──────────────────────────────────────────────────────────────────

function Toast({ message, type, onDone }: { message: string; type: 'success' | 'error' | 'info'; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const bg = type === 'success' ? 'bg-go/90' : type === 'error' ? 'bg-pass/90' : 'bg-accent/90';
  return (
    <div className={`fixed bottom-6 right-6 z-50 ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-fadeIn`}>
      {message}
    </div>
  );
}

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
  const [dataSource, setDataSource] = useState<'zoria' | 'manual' | null>(null);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const tooLongRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual comps
  const [manualComps, setManualComps] = useState<ManualComp[]>([]);
  const [showCompForm, setShowCompForm] = useState(false);
  const [compDraft, setCompDraft] = useState<ManualComp>({ ...emptyManualComp });

  // Force-included comps (promoted from disqualified)
  const [forcedCompAddresses, setForcedCompAddresses] = useState<Set<string>>(new Set());

  // ARV override
  const [arvOverride, setArvOverride] = useState<number | null>(null);

  // Editable offer params
  const [ofInterestRate, setOfInterestRate] = useState(6);
  const [ofTermYears, setOfTermYears] = useState(30);
  const [ofEstimatedRent, setOfEstimatedRent] = useState(1200);
  const [novHoldingCosts, setNovHoldingCosts] = useState(6000);

  // Editing property fields in report
  const [editingField, setEditingField] = useState<string | null>(null);

  // Property lookup
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // ─── Compute effective ARV and offers reactively ────────────────

  const effectiveArv = useMemo(() => {
    if (arvOverride != null && arvOverride > 0) return arvOverride;
    return report?.arvResult?.arv ?? 0;
  }, [arvOverride, report?.arvResult?.arv]);

  const effectiveRepairs = report?.repairEstimate?.total_recommended ?? 0;

  // Real-time three-offer calculation
  const liveOffers = useMemo(() => {
    if (effectiveArv <= 0) return null;
    const arv = effectiveArv;
    const repairs = effectiveRepairs;
    const asking = report?.subject.asking_price ?? subject.asking_price;

    // CASH
    const mao = Math.round(arv * 0.70 - repairs);
    const cashStart = Math.round(mao * 0.85);
    const cashAssignCon = Math.max(5000, Math.round(mao * 0.05));
    const cashAssignTgt = Math.max(8000, Math.round(mao * 0.08));
    const cashAssignAgg = Math.max(10000, Math.round(mao * 0.12));
    const buyerProfit = arv - mao - repairs;
    const buyerInvestment = mao + repairs;
    const buyerRoi = buyerInvestment > 0 ? (buyerProfit / buyerInvestment) * 100 : 0;
    const spread = asking != null && asking > 0 ? mao - asking : null;
    const cashWorks = mao > 0 && buyerProfit > 0;

    // OWNER FINANCE
    const ofPurchase = Math.round(arv * 0.80 - repairs);
    const ofDown = Math.round(ofPurchase * 0.10);
    const ofFinanced = ofPurchase - ofDown;
    const ofRate = ofInterestRate / 100;
    const ofMonthly = Math.round(calcMonthlyPayment(ofFinanced, ofRate, ofTermYears));
    const rent = ofEstimatedRent;
    const ofCashflow = rent - ofMonthly;
    const ofAssignment = Math.round(ofDown * 0.50);
    const ofTotalSeller = (ofMonthly * ofTermYears * 12) + ofDown;
    const ofStartPrice = Math.round(ofPurchase * 0.90);
    const ofStartDown = Math.round(ofPurchase * 0.05);
    const ofWorks = ofPurchase > 0 && ofCashflow > 0;

    // NOVATION
    const novSeller = Math.round(arv * 0.75 - repairs * 0.50);
    const novReno = repairs;
    const novList = Math.round(arv * 0.98);
    const novCommission = Math.round(novList * 0.05);
    const novClosing = Math.round(novList * 0.02);
    const novHolding = novHoldingCosts;
    const novTotalCosts = novReno + novCommission + novClosing + novHolding;
    const novProfit = novList - novSeller - novTotalCosts;
    const novStartSeller = Math.round(novSeller * 0.90);
    const novWorks = novProfit > 0 && novSeller > 0;

    // Best strategy
    const profits = [
      { name: 'Cash', profit: cashAssignTgt, works: cashWorks },
      { name: 'Owner Finance', profit: ofAssignment + ofCashflow * 12, works: ofWorks },
      { name: 'Novation', profit: novProfit, works: novWorks },
    ].filter(s => s.works).sort((a, b) => b.profit - a.profit);
    const best = profits.length > 0 ? profits[0].name : 'Pass';

    return {
      arv, repairs, asking, mao, cashStart, cashAssignCon, cashAssignTgt, cashAssignAgg,
      buyerProfit, buyerRoi, spread, cashWorks,
      ofPurchase, ofDown, ofFinanced, ofRate, ofMonthly, rent, ofCashflow, ofAssignment,
      ofTotalSeller, ofStartPrice, ofStartDown, ofWorks,
      novSeller, novReno, novList, novCommission, novClosing, novHolding, novTotalCosts,
      novProfit, novStartSeller, novWorks,
      best,
    };
  }, [effectiveArv, effectiveRepairs, report?.subject.asking_price, subject.asking_price,
      ofInterestRate, ofTermYears, ofEstimatedRent, novHoldingCosts]);

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

  // ─── Add manual comp ──────────────────────────────────────────

  const addManualComp = () => {
    if (!compDraft.address || !compDraft.sale_price) return;
    if (manualComps.length >= 10) return;
    setManualComps(prev => [...prev, { ...compDraft }]);
    setCompDraft({ ...emptyManualComp });
    setShowCompForm(false);
  };

  const removeManualComp = (idx: number) => {
    setManualComps(prev => prev.filter((_, i) => i !== idx));
  };

  const promoteComp = (address: string) => {
    setForcedCompAddresses(prev => new Set([...prev, address.toLowerCase()]));
  };

  const demoteComp = (address: string) => {
    setForcedCompAddresses(prev => {
      const next = new Set(prev);
      next.delete(address.toLowerCase());
      return next;
    });
  };

  // Re-run comp engine when manual comps or forced comps change (in report view)
  useEffect(() => {
    if (step !== 'report' || !report) return;
    if (manualComps.length === 0 && report.rawComps.length === 0) return;

    // Merge manual comps with Zoria comps
    const manualAsRaw: Record<string, unknown>[] = manualComps.map(c => ({
      address: c.address,
      sale_price: c.sale_price,
      sale_date: c.sale_date,
      sqft: c.sqft,
      beds: c.beds,
      baths: c.baths,
      year_built: c.year_built,
      distance_miles: c.distance_miles,
      same_subdivision: c.same_subdivision,
      property_type: c.property_type || report.subject.property_type,
      lot_sqft: 0,
      has_pool: false,
      has_garage: false,
      garage_count: 0,
      has_carport: false,
      has_basement: false,
      basement_sqft: 0,
      crosses_major_road: false,
      days_old: c.sale_date ? Math.floor((Date.now() - new Date(c.sale_date).getTime()) / 86400000) : 0,
      source: 'manual',
    }));

    const allRaw = [...report.rawComps.filter((c: Record<string, unknown>) => c.source !== 'manual'), ...manualAsRaw];
    const sub = report.subject;
    const filtered = filterComps(sub, allRaw);

    // Move force-included comps from disqualified to qualified
    const finalQualified = [...filtered.qualified];
    const finalDisqualified: Record<string, unknown>[] = [];
    for (const comp of filtered.disqualified) {
      const addr = String(comp.address || '').toLowerCase();
      if (forcedCompAddresses.has(addr)) {
        finalQualified.push({ ...comp, force_included: true });
      } else {
        finalDisqualified.push(comp);
      }
    }

    const adjusted = adjustComps(sub, finalQualified);
    const arvResult = adjusted.length > 0 ? calculateARV(sub, adjusted) : null;

    setReport(prev => prev ? {
      ...prev,
      rawComps: allRaw,
      qualified: finalQualified,
      disqualified: finalDisqualified,
      adjusted,
      arvResult,
      confidence: arvResult?.confidence ?? 'low',
    } : prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualComps, forcedCompAddresses, step]);

  // ─── Look Up Property ────────────────────────────────────────

  const lookUpProperty = async () => {
    if (!subject.address) return;
    setLookingUp(true);
    setLookupMessage('Searching for property details...');
    try {
      const res = await fetch('/api/lookup/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: subject.address, city: subject.city, state: subject.state, zip: subject.zip }),
      });
      const data = await res.json();
      if (data.available && data.property) {
        const p = data.property;
        setSubject(s => ({
          ...s,
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
          tax_assessed_value: p.tax_assessed_value ?? s.tax_assessed_value,
          last_sale_price: p.last_sale_price ?? s.last_sale_price,
          last_sale_date: p.last_sale_date ?? s.last_sale_date,
          subdivision: p.subdivision ?? s.subdivision,
        }));
        setDataSource('zoria');
        setLookupMessage(`Found! ${p.beds ?? '?'}bd/${p.baths ?? '?'}ba, ${p.sqft?.toLocaleString() ?? '?'} sqft`);
      } else {
        setLookupMessage("Couldn't find property. Enter details manually.");
      }
    } catch {
      setLookupMessage("Couldn't find property. Enter details manually.");
    }
    setLookingUp(false);
  };

  // ─── Run Full Analysis ────────────────────────────────────────

  const updateStep = (idx: number, update: Partial<AnalysisStep>) => {
    setAnalysisSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...update } : s));
  };

  const zoriaFetch = async (url: string, body: unknown, signal?: AbortSignal) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => { controller.abort(); }, 60000);
    if (signal) signal.addEventListener('abort', () => controller.abort());
    try {
      console.log(`[DealUW] Fetching: ${url}`);
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      clearTimeout(timeout);
      console.log(`[DealUW] Response: ${url} -> ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      console.error(`[DealUW] Fetch failed: ${url}`, err);
      throw err;
    }
  };

  const runAnalysis = async () => {
    if (!subject.address) return;
    console.log('[DealUW] runAnalysis triggered for:', subject.address);

    setLookupStatus('Searching...');
    setLookupFailed(false);
    setStep('loading');
    setReport(null);
    setAiAnalysis(null);
    setDataSource(null);
    setLoadingTooLong(false);
    setArvOverride(null);
    setManualComps([]);

    if (abortRef.current) abortRef.current.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    if (tooLongRef.current) clearTimeout(tooLongRef.current);
    tooLongRef.current = setTimeout(() => setLoadingTooLong(true), 20000);

    const steps: AnalysisStep[] = [
      { label: 'Looking up property details...', status: 'pending' },
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
    let propertyFound = false;

    try {
      // Step 0: Property lookup
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
          propertyFound = true;
          updateStep(0, { status: 'done', detail: `Property found! ${currentSubject.beds}bd/${currentSubject.baths}ba, ${currentSubject.sqft?.toLocaleString()} sqft` });
        } else {
          updateStep(0, { status: 'done', detail: 'Property not found. Enter details manually.' });
        }
      } catch (err) {
        if (abort.signal.aborted) throw err;
        updateStep(0, { status: 'error', detail: 'Lookup failed. Enter details manually.' });
      }

      // Step 1: Comps
      updateStep(1, { status: 'running' });
      try {
        const compsRes = await zoriaFetch('/api/lookup/comps', {
          address: currentSubject.address, city: currentSubject.city,
          state: currentSubject.state, zip: currentSubject.zip,
          subject_details: currentSubject,
        }, abort.signal);
        const compsData = await compsRes.json();
        if (compsData.available && compsData.comps?.length > 0) {
          rawComps = compsData.comps;
          source = 'zoria';
          updateStep(1, { status: 'done', detail: `Found ${rawComps.length} comps!` });
        } else {
          updateStep(1, { status: 'done', detail: 'No comps found. Add comps manually.' });
        }
      } catch (err) {
        if (abort.signal.aborted) throw err;
        updateStep(1, { status: 'error', detail: 'Comp search failed. Add comps manually.' });
      }

      setDataSource(source);

      // Step 2-4: Filter, adjust, ARV
      updateStep(2, { status: 'running' });
      const filtered = filterComps(currentSubject, rawComps);
      updateStep(2, { status: 'done', detail: `${filtered.qualified.length} qualified, ${filtered.disqualified.length} excluded` });

      updateStep(3, { status: 'running' });
      const adjusted = adjustComps(currentSubject, filtered.qualified);
      updateStep(3, { status: 'done', detail: `${adjusted.length} comps adjusted` });

      updateStep(4, { status: 'running' });
      const arvResult = adjusted.length > 0 ? calculateARV(currentSubject, adjusted) : null;
      updateStep(4, { status: 'done', detail: arvResult ? `${money(arvResult.arv)} (${arvResult.confidence})` : 'No comps for ARV' });

      // Step 5: Repairs
      updateStep(5, { status: 'running' });
      let repairEstimate: RepairEstimate | null = null;
      try {
        const repairRes = await zoriaFetch('/api/estimate-repairs', {
          property: currentSubject,
          photos: photos.length > 0 ? photos.map(p => p.dataUrl) : undefined,
          mode: photos.length > 0 ? 'ai_photo' : 'algorithmic',
        }, abort.signal);
        if (repairRes.ok) {
          repairEstimate = await repairRes.json();
          updateStep(5, { status: 'done', detail: `${money(repairEstimate?.total_recommended)}` });
        } else {
          updateStep(5, { status: 'done', detail: 'Estimate unavailable' });
        }
      } catch (err) {
        if (abort.signal.aborted) throw err;
        updateStep(5, { status: 'done', detail: 'Estimate failed' });
      }

      // Step 6: Offers (computed reactively via liveOffers, but also store in report for compatibility)
      updateStep(6, { status: 'running' });
      let allOffers: AllOffers | null = null;
      let negotiationGuide: NegotiationGuide | null = null;
      const arv = arvResult?.arv ?? 0;
      const repairs = repairEstimate?.total_recommended ?? 0;
      if (arv > 0) {
        const { calculateAllOffers, generateNegotiationGuide } = await import('@/lib/offerCalculator');
        allOffers = calculateAllOffers({ arv, repairs, asking_price: currentSubject.asking_price, property: currentSubject, market_rent: currentSubject.monthly_rent });
        negotiationGuide = generateNegotiationGuide(allOffers, currentSubject.asking_price);
        updateStep(6, { status: 'done', detail: `Best: ${allOffers.best_strategy}` });
      } else {
        updateStep(6, { status: 'done', detail: 'Add comps or override ARV' });
      }

      // Set estimated rent from offer calc
      if (allOffers?.owner_finance) {
        setOfEstimatedRent(allOffers.owner_finance.market_rent);
      }

      // Step 7: Report
      updateStep(7, { status: 'running' });
      const fullReport: FullReport = {
        subject: currentSubject, photos, rawComps,
        qualified: filtered.qualified, disqualified: filtered.disqualified,
        adjusted, arvResult, repairEstimate, allOffers, negotiationGuide,
        generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        confidence: arvResult?.confidence ?? 'low',
      };
      setReport(fullReport);
      updateStep(7, { status: 'done', detail: 'Complete' });

      if (tooLongRef.current) clearTimeout(tooLongRef.current);
      setLoadingTooLong(false);
      setTimeout(() => setStep('report'), 600);
    } catch (err) {
      console.error('[DealUW] runAnalysis error:', err);
      if (tooLongRef.current) clearTimeout(tooLongRef.current);
      if (abort.signal.aborted) {
        setAnalysisSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: 'Cancelled' } : s));
      } else {
        setAnalysisSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: 'Failed' } : s));
        // Still show the report so user can add comps/ARV manually
        const fallbackReport: FullReport = {
          subject: { ...subject }, photos, rawComps: [],
          qualified: [], disqualified: [], adjusted: [],
          arvResult: null, repairEstimate: null, allOffers: null, negotiationGuide: null,
          generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          confidence: 'low',
        };
        setReport(fallbackReport);
        setTimeout(() => setStep('report'), 600);
      }
    }
  };

  // ─── Save to Pipeline ─────────────────────────────────────────

  const saveToPipeline = async () => {
    if (!report) return;
    setSaving(true);
    try {
      const r = report;
      const arv = effectiveArv;
      const repairs = effectiveRepairs;
      const mao = liveOffers?.mao ?? 0;
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...r.subject,
          arv_raw: arv,
          arv_adjusted: arv,
          repair_estimate: repairs,
          mao,
          assignment_fee: liveOffers?.cashAssignTgt ?? 0,
          recommendation: liveOffers ? (liveOffers.best === 'Pass' ? 'pass' : liveOffers.cashWorks ? 'go' : 'negotiate') : 'negotiate',
          confidence: r.confidence,
          status: 'analyzing',
          notes: r.subject.seller_notes || null,
        }),
      });
      if (res.ok) {
        setToast({ message: 'Saved to pipeline!', type: 'success' });
        setSaving(false);
        setTimeout(() => router.push('/pipeline'), 1000);
      } else {
        throw new Error('API failed');
      }
    } catch {
      // Fallback: save to localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('dealuw_local_deals') || '[]');
        saved.push({ ...report.subject, arv: effectiveArv, repairs: effectiveRepairs, savedAt: new Date().toISOString() });
        localStorage.setItem('dealuw_local_deals', JSON.stringify(saved));
        setToast({ message: 'Saved locally (API unavailable)', type: 'info' });
      } catch {
        setToast({ message: 'Save failed', type: 'error' });
      }
      setSaving(false);
    }
  };

  // ─── Export PDF ───────────────────────────────────────────────

  const exportPDF = () => {
    setToast({ message: 'Use your browser\'s Save as PDF option', type: 'info' });
    setTimeout(() => window.print(), 300);
  };

  // ─── AI Second Opinion ────────────────────────────────────────

  const runAiOpinion = () => {
    setToast({ message: 'Coming soon -- AI analysis will review your numbers', type: 'info' });
  };

  // ─── New Analysis ─────────────────────────────────────────────

  const resetAll = () => {
    setSubject(defaultSubject);
    setPhotos([]);
    setReport(null);
    setAiAnalysis(null);
    setManualComps([]);
    setArvOverride(null);
    setShowCompForm(false);
    setLookupStatus(null);
    setLookupFailed(false);
    setOfInterestRate(6);
    setOfTermYears(30);
    setOfEstimatedRent(1200);
    setNovHoldingCosts(6000);
    setStep('input');
    window.scrollTo(0, 0);
  };

  // ─── Editable field helper ────────────────────────────────────

  const updateReportSubject = (field: string, value: unknown) => {
    if (!report) return;
    const updated = { ...report.subject, [field]: value };
    setSubject(updated);
    setReport({ ...report, subject: updated });
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
              {/* Address */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Property Address</h3>
                <AddressAutocomplete
                  value={subject.address}
                  onChange={v => setSubject(s => ({ ...s, address: v }))}
                  onSelect={result => {
                    setSubject(s => ({
                      ...s,
                      address: result.address,
                      city: result.city,
                      state: result.state,
                      zip: result.zip,
                    }));
                  }}
                  placeholder="Enter property address..."
                  className="w-full rounded-xl border border-border bg-background px-5 py-4 text-lg text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none transition-colors mb-3"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input placeholder="City" value={subject.city} onChange={e => setSubject(s => ({ ...s, city: e.target.value }))} className="input-std" />
                  <input placeholder="State" value={subject.state} onChange={e => setSubject(s => ({ ...s, state: e.target.value }))} className="input-std" />
                  <input placeholder="ZIP" value={subject.zip} onChange={e => setSubject(s => ({ ...s, zip: e.target.value }))} className="input-std" />
                </div>
                <button
                  type="button"
                  onClick={lookUpProperty}
                  disabled={!subject.address || lookingUp}
                  className="mt-3 w-full rounded-lg border border-accent/30 bg-accent/5 px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {lookingUp ? 'Searching for property details...' : 'Look Up Property'}
                </button>
                {lookupMessage && !lookingUp && (
                  <p className={`mt-2 text-xs ${dataSource === 'zoria' ? 'text-go' : 'text-negotiate'}`}>{lookupMessage}</p>
                )}
              </div>

              {/* Photos */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h3 className="text-sm font-semibold text-accent mb-4">Seller Photos <span className="text-muted font-normal">(optional)</span></h3>
                <div
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('border-accent'); }}
                  onDragLeave={e => { e.currentTarget.classList.remove('border-accent'); }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove('border-accent'); handlePhotoUpload(e.dataTransfer.files); }}
                  onClick={() => document.getElementById('photo-input')?.click()}
                  className="rounded-lg border-2 border-dashed border-border bg-background/30 p-4 text-center cursor-pointer hover:border-accent/50 transition-colors"
                >
                  <input id="photo-input" type="file" accept="image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif,image/bmp,image/tiff,image/avif" multiple className="hidden" onChange={e => { if (e.target.files) handlePhotoUpload(e.target.files); e.target.value = ''; }} />
                  <p className="text-sm text-muted">Drop photos or click to browse</p>
                  <p className="text-xs text-muted/50 mt-1">JPG, PNG, WebP, HEIC, GIF, AVIF &middot; Max 10</p>
                </div>
                {photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {photos.map((p, i) => (
                      <div key={i} className="relative group">
                        <img src={p.dataUrl} alt={p.name} className="w-16 h-16 object-cover rounded-lg border border-border" />
                        <button onClick={e => { e.stopPropagation(); setPhotos(prev => prev.filter((_, j) => j !== i)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-pass text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
                      </div>
                    ))}
                    <span className="text-[10px] text-muted self-end">{photos.length}/10</span>
                  </div>
                )}
              </div>
            </div>

            {/* Property Details */}
            <div className="rounded-xl border border-border bg-card p-6 mb-6">
              <h3 className="text-sm font-semibold text-accent mb-4">
                Property Details
                {dataSource === 'zoria' && <span className="ml-2 rounded-full bg-accent/10 text-accent px-2 py-0.5 text-xs font-normal">Auto-filled from Zoria</span>}
              </h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div><label className="block text-xs text-muted mb-1">Beds</label><input type="number" placeholder="0" value={subject.beds ?? ''} onChange={e => setSubject(s => ({ ...s, beds: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" /></div>
                <div><label className="block text-xs text-muted mb-1">Baths</label><input type="number" step="0.5" placeholder="0" value={subject.baths ?? ''} onChange={e => setSubject(s => ({ ...s, baths: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" /></div>
                <div><label className="block text-xs text-muted mb-1">Sqft</label><input type="number" placeholder="0" value={subject.sqft ?? ''} onChange={e => setSubject(s => ({ ...s, sqft: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} /></div>
                <div><label className="block text-xs text-muted mb-1">Lot Sqft</label><input type="number" placeholder="0" value={subject.lot_sqft ?? ''} onChange={e => setSubject(s => ({ ...s, lot_sqft: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} /></div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div><label className="block text-xs text-muted mb-1">Year Built</label><input type="number" placeholder="1990" value={subject.year_built ?? ''} onChange={e => setSubject(s => ({ ...s, year_built: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" /></div>
                <div><label className="block text-xs text-muted mb-1">Property Type</label><select value={subject.property_type} onChange={e => setSubject(s => ({ ...s, property_type: e.target.value }))} className="input-std w-full">{PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-xs text-muted mb-1">Condition</label><select value={subject.condition} onChange={e => setSubject(s => ({ ...s, condition: e.target.value }))} className="input-std w-full">{['excellent', 'good', 'fair', 'poor'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-xs text-muted mb-1">Traffic/Commercial</label><select value={subject.traffic_commercial} onChange={e => setSubject(s => ({ ...s, traffic_commercial: e.target.value }))} className="input-std w-full">{['none', 'siding', 'backing', 'fronting'].map(o => <option key={o} value={o}>{o}</option>)}</select></div>
              </div>
              <div className="flex flex-wrap gap-4 mt-3">
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer"><input type="checkbox" checked={subject.has_pool} onChange={e => setSubject(s => ({ ...s, has_pool: e.target.checked }))} className="accent-[#3AADE8]" /> Pool</label>
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer"><input type="checkbox" checked={subject.has_garage} onChange={e => setSubject(s => ({ ...s, has_garage: e.target.checked }))} className="accent-[#3AADE8]" /> Garage</label>
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer"><input type="checkbox" checked={subject.has_basement} onChange={e => setSubject(s => ({ ...s, has_basement: e.target.checked }))} className="accent-[#3AADE8]" /> Basement</label>
                <label className="flex items-center gap-2 text-xs text-muted cursor-pointer"><input type="checkbox" checked={subject.has_carport} onChange={e => setSubject(s => ({ ...s, has_carport: e.target.checked }))} className="accent-[#3AADE8]" /> Carport</label>
              </div>
            </div>

            {/* Seller Info */}
            <div className="rounded-xl border border-border bg-card p-6 mb-6">
              <h3 className="text-sm font-semibold text-accent mb-4">Seller Info <span className="text-muted font-normal">(optional)</span></h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                <div><label className="block text-xs text-muted mb-1">Asking Price</label><input type="number" placeholder="$0" value={subject.asking_price ?? ''} onChange={e => setSubject(s => ({ ...s, asking_price: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} /></div>
                <div><label className="block text-xs text-muted mb-1">Motivation</label><select value={subject.seller_motivation} onChange={e => setSubject(s => ({ ...s, seller_motivation: e.target.value }))} className="input-std w-full">{MOTIVATIONS.map(m => <option key={m} value={m}>{m || 'Select...'}</option>)}</select></div>
                <div><label className="block text-xs text-muted mb-1">Timeline</label><select value={subject.seller_timeline} onChange={e => setSubject(s => ({ ...s, seller_timeline: e.target.value }))} className="input-std w-full">{TIMELINES.map(t => <option key={t} value={t}>{t || 'Select...'}</option>)}</select></div>
                <div><label className="block text-xs text-muted mb-1">Monthly Rent</label><input type="number" placeholder="$0" value={subject.monthly_rent ?? ''} onChange={e => setSubject(s => ({ ...s, monthly_rent: e.target.value ? Number(e.target.value) : null }))} className="input-std w-full" style={mono} /></div>
              </div>
              <textarea placeholder="Notes from seller conversation..." value={subject.seller_notes} onChange={e => setSubject(s => ({ ...s, seller_notes: e.target.value }))} rows={2} className="input-std w-full resize-none" />
            </div>

            {/* Status */}
            {lookupStatus && (
              <div className={`rounded-xl border px-5 py-3 text-sm mb-4 ${lookupFailed ? 'border-negotiate/30 bg-negotiate/5 text-negotiate' : 'border-accent/30 bg-accent/5 text-accent'}`}>
                {lookupStatus}
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={runAnalysis}
              disabled={!subject.address}
              className="w-full rounded-xl bg-accent py-5 text-lg font-bold text-white transition-all hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Create Deal & Begin Analysis
            </button>
          </div>
        )}

        {/* ═══ STEP 2: LOADING ═══ */}
        {step === 'loading' && (
          <div className="animate-fadeIn max-w-xl mx-auto py-16">
            <div className="text-center mb-10">
              <h2 className="text-xl font-bold text-foreground mb-2">Analyzing Deal...</h2>
              <p className="text-sm text-muted">{subject.address}</p>
              <p className="text-xs text-muted/50 mt-2">This may take 15-30 seconds.</p>
            </div>
            <div className="space-y-4">
              {analysisSteps.map((s, i) => (
                <div key={i} className={`flex items-start gap-3 transition-opacity duration-300 ${s.status === 'pending' ? 'opacity-30' : 'opacity-100'}`}>
                  <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center mt-0.5">
                    {s.status === 'done' && <span className="text-go text-lg">&#10003;</span>}
                    {s.status === 'running' && <svg className="animate-spin h-5 w-5 text-accent" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
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
                <button onClick={() => {
                  if (abortRef.current) abortRef.current.abort();
                  setLoadingTooLong(false);
                  const fallbackReport: FullReport = {
                    subject: { ...subject }, photos, rawComps: [],
                    qualified: [], disqualified: [], adjusted: [],
                    arvResult: null, repairEstimate: null, allOffers: null, negotiationGuide: null,
                    generatedAt: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                    confidence: 'low',
                  };
                  setReport(fallbackReport);
                  setStep('report');
                }}
                  className="rounded-lg border border-border px-4 py-2 text-xs text-muted hover:text-foreground transition-colors">
                  Skip to manual entry
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: THE REPORT ═══ */}
        {step === 'report' && report && (
          <div className="animate-fadeIn">
            {/* Report Header */}
            <div className="rounded-xl border border-accent/20 bg-card p-6 mb-8 print:border-gray-300">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xs font-bold tracking-widest text-accent mb-1" style={{ fontFamily: "'Cinzel', serif" }}>DealUW Analysis Report</h1>
                  <p className="text-xl font-bold text-foreground">{report.subject.address}</p>
                  <p className="text-sm text-muted">{report.subject.city}{report.subject.state ? `, ${report.subject.state}` : ''} {report.subject.zip}</p>
                  <p className="text-xs text-muted mt-1">Generated: {report.generatedAt}</p>
                </div>
                <ConfidenceBadge level={report.confidence} />
              </div>
            </div>

            {/* ═══ SECTION 1: Property Overview (editable) ═══ */}
            <SectionHeader title="Property Overview" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="space-y-2 text-sm">
                  <EditableRow label="Address" field="address" value={report.subject.address} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} />
                  <EditableRow label="Beds" field="beds" value={report.subject.beds} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" />
                  <EditableRow label="Baths" field="baths" value={report.subject.baths} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" step="0.5" />
                  <EditableRow label="Square Feet" field="sqft" value={report.subject.sqft} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" />
                  <EditableRow label="Lot Sqft" field="lot_sqft" value={report.subject.lot_sqft} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" />
                  <EditableRow label="Year Built" field="year_built" value={report.subject.year_built} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" />
                  <EditableRow label="Type" field="property_type" value={report.subject.property_type} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} options={PROPERTY_TYPES} />
                  <EditableRow label="Condition" field="condition" value={report.subject.condition} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} options={['excellent', 'good', 'fair', 'poor']} />
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
                  {report.subject.tax_assessed_value != null && <DataRow label="Tax Assessed" value={money(report.subject.tax_assessed_value)} mono />}
                  {report.subject.last_sale_price != null && <DataRow label="Last Sale" value={`${money(report.subject.last_sale_price)} on ${report.subject.last_sale_date || '--'}`} mono />}
                  <EditableRow label="Asking Price" field="asking_price" value={report.subject.asking_price} editing={editingField} setEditing={setEditingField} onSave={updateReportSubject} type="number" />
                  {report.subject.seller_motivation && <DataRow label="Motivation" value={report.subject.seller_motivation} />}
                  {report.subject.seller_timeline && <DataRow label="Timeline" value={report.subject.seller_timeline} />}
                  {report.subject.monthly_rent != null && <DataRow label="Current Rent" value={`${money(report.subject.monthly_rent)}/mo`} mono />}
                </div>
              </div>
            </div>

            {/* ═══ SECTION 2: Comparable Sales ═══ */}
            <SectionHeader title="Comparable Sales Analysis" badge={`${report.adjusted.length} qualified`} />

            {/* Summary bar */}
            <div className="rounded-lg border border-border bg-card/50 px-4 py-2.5 mb-4 flex items-center gap-4 text-xs text-muted flex-wrap">
              <span><span className="text-go font-bold">{report.qualified.length}</span> qualified</span>
              <span className="text-border">|</span>
              <span><span className="text-pass font-bold">{report.disqualified.length}</span> disqualified</span>
              <span className="text-border">|</span>
              <span>Confidence: <ConfidenceBadge level={report.confidence} /></span>
            </div>

            {/* Comp cards */}
            {report.adjusted.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {report.adjusted.slice(0, 6).map((comp, i) => {
                  const isForced = forcedCompAddresses.has(String(comp.address).toLowerCase());
                  return (
                    <CompCard
                      key={i}
                      comp={comp}
                      forceIncluded={isForced}
                      onRemove={isForced ? () => demoteComp(String(comp.address)) : undefined}
                    />
                  );
                })}
              </div>
            )}

            {/* DQ comps */}
            {report.disqualified.length > 0 && (
              <div className="mb-4">
                <button onClick={() => setShowDqComps(!showDqComps)} className="text-xs text-muted hover:text-foreground transition-colors">
                  {showDqComps ? 'Hide' : 'Show'} {report.disqualified.length} excluded comp{report.disqualified.length !== 1 ? 's' : ''} &#9662;
                </button>
                {showDqComps && (
                  <div className="mt-2 space-y-2">
                    {report.disqualified.map((c: Record<string, unknown>, i: number) => (
                      <div key={i} className="rounded-lg border border-pass/20 bg-pass/5 px-4 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-foreground font-medium">{String(c.address)}</span>
                          <span className="text-muted ml-2">{money(c.sale_price as number)}</span>
                          <span className="text-muted ml-2">{Number(c.sqft) > 0 ? `${Number(c.sqft).toLocaleString()} sqft` : ''}</span>
                          <span className="text-pass ml-2">{(c.disqualified_reasons as string[])?.join('; ')}</span>
                        </div>
                        <button
                          onClick={() => promoteComp(String(c.address))}
                          className="shrink-0 rounded-md border border-go/30 bg-go/10 px-3 py-1 text-[11px] font-semibold text-go hover:bg-go/20 transition-colors"
                        >
                          Include
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual comp entry */}
            <div className="mb-4">
              {!showCompForm && manualComps.length < 10 && (
                <button onClick={() => setShowCompForm(true)} className="rounded-lg border border-accent/30 bg-accent/5 px-4 py-2 text-xs text-accent hover:bg-accent/10 transition-colors">
                  + Add Comp Manually
                </button>
              )}
              {showCompForm && (
                <div className="rounded-xl border border-accent/30 bg-card p-4 mt-2 animate-fadeIn">
                  <p className="text-xs font-semibold text-accent mb-3">Add Comparable Sale</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
                    <div className="lg:col-span-2"><input placeholder="Address" value={compDraft.address} onChange={e => setCompDraft(d => ({ ...d, address: e.target.value }))} className="input-std w-full text-xs" /></div>
                    <div><input type="number" placeholder="Sale Price" value={compDraft.sale_price || ''} onChange={e => setCompDraft(d => ({ ...d, sale_price: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                    <div><input type="date" value={compDraft.sale_date} onChange={e => setCompDraft(d => ({ ...d, sale_date: e.target.value }))} className="input-std w-full text-xs" /></div>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-2">
                    <div><label className="text-[10px] text-muted">Sqft</label><input type="number" value={compDraft.sqft || ''} onChange={e => setCompDraft(d => ({ ...d, sqft: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                    <div><label className="text-[10px] text-muted">Beds</label><input type="number" value={compDraft.beds} onChange={e => setCompDraft(d => ({ ...d, beds: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                    <div><label className="text-[10px] text-muted">Baths</label><input type="number" step="0.5" value={compDraft.baths} onChange={e => setCompDraft(d => ({ ...d, baths: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                    <div><label className="text-[10px] text-muted">Year Built</label><input type="number" value={compDraft.year_built} onChange={e => setCompDraft(d => ({ ...d, year_built: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                    <div><label className="text-[10px] text-muted">Distance (mi)</label><input type="number" step="0.1" value={compDraft.distance_miles} onChange={e => setCompDraft(d => ({ ...d, distance_miles: Number(e.target.value) }))} className="input-std w-full text-xs" /></div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
                      <input type="checkbox" checked={compDraft.same_subdivision} onChange={e => setCompDraft(d => ({ ...d, same_subdivision: e.target.checked }))} className="accent-[#3AADE8]" /> Same subdivision
                    </label>
                    <button onClick={addManualComp} disabled={!compDraft.address || !compDraft.sale_price} className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent/80 disabled:opacity-30 transition-colors">Add</button>
                    <button onClick={() => setShowCompForm(false)} className="text-xs text-muted hover:text-foreground transition-colors">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Manual comps table */}
            {manualComps.length > 0 && (
              <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-border text-muted">
                    <th className="text-left px-3 py-2">Address</th><th className="text-right px-3 py-2">Price</th><th className="text-right px-3 py-2">Sqft</th><th className="text-right px-3 py-2">Bd/Ba</th><th className="text-right px-3 py-2">Date</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody>
                    {manualComps.map((c, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="px-3 py-2 text-foreground">{c.address}</td>
                        <td className="px-3 py-2 text-right text-gold" style={mono}>{money(c.sale_price)}</td>
                        <td className="px-3 py-2 text-right text-muted">{c.sqft.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-muted">{c.beds}/{c.baths}</td>
                        <td className="px-3 py-2 text-right text-muted">{c.sale_date}</td>
                        <td className="px-3 py-2 text-right"><button onClick={() => removeManualComp(i)} className="text-pass hover:text-pass/80">&times;</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ARV Result + Override */}
            <div className="rounded-xl border border-gold/30 bg-card p-6 mb-8 text-center">
              <p className="text-xs text-muted mb-1">After Repair Value (ARV)</p>
              {report.arvResult ? (
                <>
                  <p className="text-4xl font-black text-gold mb-2" style={mono}>{money(arvOverride ?? report.arvResult.arv)}</p>
                  <p className="text-sm text-muted mb-3">{report.arvResult.method}</p>
                  <ConfidenceBadge level={report.arvResult.confidence} />
                </>
              ) : (
                <p className="text-lg text-muted mb-2">{arvOverride ? money(arvOverride) : 'No comps -- enter ARV manually below'}</p>
              )}
              <div className="mt-4 flex items-center justify-center gap-2">
                <label className="text-xs text-muted">Override ARV: $</label>
                <input
                  type="number" placeholder="Leave blank to use calculated"
                  value={arvOverride ?? ''}
                  onChange={e => setArvOverride(e.target.value ? Number(e.target.value) : null)}
                  className="input-std w-48 text-center text-sm" style={mono}
                />
              </div>
            </div>

            {/* ═══ SECTION 3: Repair Estimate ═══ */}
            {report.repairEstimate && (
              <>
                <SectionHeader title="Estimated Repairs" badge={money(report.repairEstimate.total_recommended)} />
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

            {/* ═══ SECTION 4: Three Offer Cards (real-time) ═══ */}
            {liveOffers && (
              <>
                <SectionHeader title="Offer Strategies" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
                  {/* CASH */}
                  <div className={`rounded-xl border p-5 ${liveOffers.cashWorks ? 'border-go/30 bg-go/[0.03]' : 'border-border bg-card'}`}>
                    <p className="text-xs text-muted mb-1">CASH OFFER</p>
                    <p className="text-sm text-muted mb-3">Fast close. Lowest price. Highest certainty.</p>
                    <p className="text-xs text-muted mb-0.5">Maximum Offer (MAO)</p>
                    <p className="text-3xl font-black text-gold mb-3" style={mono}>{money(liveOffers.mao)}</p>
                    <div className="space-y-2 text-xs">
                      <OfferLine label="Start at" value={money(liveOffers.cashStart)} bold />
                      <OfferLine label="Walk away above" value={money(liveOffers.mao)} />
                      <div className="h-px bg-border" />
                      <OfferLine label="Your Profit" value={`${money(liveOffers.cashAssignCon)}-${money(liveOffers.cashAssignAgg)}`} green />
                      <OfferLine label="Buyer Profit" value={money(liveOffers.buyerProfit)} />
                      <OfferLine label="Buyer ROI" value={`${liveOffers.buyerRoi.toFixed(1)}%`} />
                      {liveOffers.spread != null && <OfferLine label="Spread vs asking" value={money(liveOffers.spread)} green={liveOffers.spread > 0} red={liveOffers.spread < 0} />}
                    </div>
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${liveOffers.cashWorks ? 'bg-go/10 text-go' : 'bg-pass/10 text-pass'}`}>
                      {liveOffers.cashWorks ? 'Deal works at MAO' : 'Numbers don\'t work'}
                    </div>
                  </div>

                  {/* OWNER FINANCE */}
                  <div className={`rounded-xl border p-5 ${liveOffers.ofWorks ? 'border-[#8B5CF6]/30 bg-[#8B5CF6]/[0.03]' : 'border-border bg-card'}`}>
                    <p className="text-xs text-muted mb-1">OWNER FINANCE</p>
                    <p className="text-sm text-muted mb-3">Higher price for seller. Monthly income stream.</p>
                    <p className="text-xs text-muted mb-0.5">Purchase Price</p>
                    <p className="text-3xl font-black text-gold mb-3" style={mono}>{money(liveOffers.ofPurchase)}</p>
                    <div className="space-y-2 text-xs">
                      <OfferLine label="Down" value={`${money(liveOffers.ofDown)} (10%)`} />
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Rate:</span>
                        <input type="number" step="0.5" min="0" max="20" value={ofInterestRate} onChange={e => setOfInterestRate(Number(e.target.value))} className="input-std w-16 text-right text-xs py-0.5 px-1" style={mono} />
                        <span className="text-muted">%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Term:</span>
                        <input type="number" min="1" max="40" value={ofTermYears} onChange={e => setOfTermYears(Number(e.target.value))} className="input-std w-16 text-right text-xs py-0.5 px-1" style={mono} />
                        <span className="text-muted">yr</span>
                      </div>
                      <OfferLine label="Monthly Payment" value={money(liveOffers.ofMonthly)} />
                      <div className="h-px bg-border" />
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Est. Rent:</span>
                        <span className="flex items-center gap-1">$<input type="number" value={ofEstimatedRent} onChange={e => setOfEstimatedRent(Number(e.target.value))} className="input-std w-20 text-right text-xs py-0.5 px-1" style={mono} /></span>
                      </div>
                      <OfferLine label="Cash Flow" value={`${money(liveOffers.ofCashflow)}/mo`} green={liveOffers.ofCashflow > 0} red={liveOffers.ofCashflow < 0} />
                      <div className="h-px bg-border" />
                      <OfferLine label="Start at" value={`${money(liveOffers.ofStartPrice)} / ${money(liveOffers.ofStartDown)} down / 4%`} bold />
                      <OfferLine label="Your Fee" value={money(liveOffers.ofAssignment)} green />
                      <OfferLine label="Seller Total" value={money(liveOffers.ofTotalSeller)} />
                    </div>
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${liveOffers.ofWorks ? 'bg-[#8B5CF6]/10 text-[#8B5CF6]' : 'bg-pass/10 text-pass'}`}>
                      {liveOffers.ofWorks ? 'Works if seller wants monthly income' : 'Negative cash flow'}
                    </div>
                  </div>

                  {/* NOVATION */}
                  <div className={`rounded-xl border p-5 ${liveOffers.novWorks ? 'border-gold/30 bg-gold/[0.03]' : 'border-border bg-card'}`}>
                    <p className="text-xs text-muted mb-1">NOVATION</p>
                    <p className="text-sm text-muted mb-3">Highest payout for seller. You coordinate the rehab.</p>
                    <p className="text-xs text-muted mb-0.5">Seller Net Price</p>
                    <p className="text-3xl font-black text-gold mb-3" style={mono}>{money(liveOffers.novSeller)}</p>
                    <div className="space-y-2 text-xs">
                      <OfferLine label="Renovate for" value={money(liveOffers.novReno)} />
                      <OfferLine label="List at" value={money(liveOffers.novList)} />
                      <OfferLine label="Commission (5%)" value={money(liveOffers.novCommission)} />
                      <OfferLine label="Closing (2%)" value={money(liveOffers.novClosing)} />
                      <div className="flex justify-between items-center">
                        <span className="text-muted">Holding costs:</span>
                        <span className="flex items-center gap-1">$<input type="number" value={novHoldingCosts} onChange={e => setNovHoldingCosts(Number(e.target.value))} className="input-std w-20 text-right text-xs py-0.5 px-1" style={mono} /></span>
                      </div>
                      <div className="h-px bg-border" />
                      <OfferLine label="Start at" value={money(liveOffers.novStartSeller)} bold />
                      <OfferLine label="Your Profit" value={money(liveOffers.novProfit)} green={liveOffers.novProfit > 0} red={liveOffers.novProfit <= 0} />
                      <OfferLine label="Timeline" value="~4 months" />
                    </div>
                    <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${liveOffers.novWorks ? 'bg-gold/10 text-gold' : 'bg-pass/10 text-pass'}`}>
                      {liveOffers.novWorks ? 'Best if seller wants maximum price' : 'Insufficient margin'}
                    </div>
                  </div>
                </div>

                {/* Recommendation Banner */}
                <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 mb-6">
                  <p className="text-sm font-bold text-gold mb-2">Recommended Strategy: {liveOffers.best}</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    Start with <strong>CASH</strong> at {money(liveOffers.cashStart)}.
                    {liveOffers.ofWorks && <> If seller rejects, pivot to <strong>OWNER FINANCE</strong> at {money(liveOffers.ofStartPrice)} with {money(liveOffers.ofStartDown)} down and 4% interest.</>}
                    {liveOffers.novWorks && <> For maximum seller price, propose <strong>NOVATION</strong> at {money(liveOffers.novStartSeller)}.</>}
                  </p>
                </div>

                {/* Comparison Table */}
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
                      <CompareRow label="Seller Gets" cash={money(liveOffers.mao)} of={money(liveOffers.ofTotalSeller)} nov={money(liveOffers.novSeller)} />
                      <CompareRow label="Your Profit" cash={money(liveOffers.cashAssignTgt)} of={`${money(liveOffers.ofAssignment)} + ${money(liveOffers.ofCashflow)}/mo`} nov={money(liveOffers.novProfit)} />
                      <CompareRow label="Time to Close" cash="7-14 days" of="30 days" nov="~4 months" />
                      <CompareRow label="Risk Level" cash="Low" of="Medium" nov="Higher" />
                      <CompareRow label="Works?" cash={liveOffers.cashWorks ? 'Yes' : 'No'} of={liveOffers.ofWorks ? 'Yes' : 'No'} nov={liveOffers.novWorks ? 'Yes' : 'No'} />
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* No offers message */}
            {!liveOffers && (
              <div className="rounded-xl border border-border bg-card p-8 mb-8 text-center">
                <p className="text-muted text-sm">Add comps or override ARV above to see offer strategies.</p>
              </div>
            )}

            {/* ═══ SECTION 5: Negotiation Guide ═══ */}
            {report.negotiationGuide && (
              <>
                <button onClick={() => setShowNegGuide(!showNegGuide)} className="w-full rounded-xl border border-accent/20 bg-accent/5 px-6 py-4 flex items-center justify-between hover:bg-accent/10 transition-colors mb-2 print:hidden">
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
                          <li key={i} className="text-xs text-muted/80 flex items-start gap-2"><span className="text-accent mt-0.5">&#8226;</span><span>{pt}</span></li>
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
              </div>
            )}

            {/* ═══ Action Buttons ═══ */}
            <div className="flex items-center justify-center gap-4 flex-wrap py-4 print:hidden">
              <button onClick={saveToPipeline} disabled={saving} className="rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white hover:bg-accent/80 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save to Pipeline'}
              </button>
              <button onClick={exportPDF} className="rounded-xl border border-accent/50 px-6 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors">
                Export PDF
              </button>
              <button onClick={runAiOpinion} className="rounded-xl border border-accent/50 px-6 py-3 text-sm font-medium text-accent hover:bg-accent/10 transition-colors">
                {aiAnalysis ? 'Re-run AI Opinion' : 'Get AI Second Opinion'}
              </button>
              <button onClick={resetAll} className="rounded-xl border border-border px-6 py-3 text-sm text-muted hover:text-foreground transition-colors">
                New Analysis
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}

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

        @media print {
          nav, .print\\:hidden { display: none !important; }
          body { background: white !important; color: black !important; }
          .bg-card, .bg-background { background: white !important; }
          .text-foreground { color: black !important; }
          .text-muted { color: #666 !important; }
          .text-gold { color: #B8860B !important; }
          .text-accent { color: #2980B9 !important; }
          .border-border { border-color: #ccc !important; }
        }
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

function EditableRow({ label, field, value, editing, setEditing, onSave, type = 'text', step, options }: {
  label: string; field: string; value: unknown; editing: string | null; setEditing: (f: string | null) => void;
  onSave: (field: string, value: unknown) => void; type?: string; step?: string; options?: string[];
}) {
  const display = value != null && value !== '' ? String(value) : '--';
  const isEditing = editing === field;

  if (isEditing) {
    if (options) {
      return (
        <div className="flex items-center justify-between py-1 border-b border-accent/30">
          <span className="text-accent text-xs">{label}</span>
          <select
            autoFocus
            value={String(value ?? '')}
            onChange={e => { onSave(field, e.target.value); setEditing(null); }}
            onBlur={() => setEditing(null)}
            className="input-std text-xs py-0.5 px-2 w-32"
          >
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between py-1 border-b border-accent/30">
        <span className="text-accent text-xs">{label}</span>
        <input
          autoFocus type={type} step={step}
          defaultValue={value != null ? String(value) : ''}
          onBlur={e => {
            const v = type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value;
            onSave(field, v);
            setEditing(null);
          }}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="input-std text-xs py-0.5 px-2 w-32 text-right"
          style={type === 'number' ? { fontFamily: "'JetBrains Mono', monospace" } : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1 border-b border-border/30 last:border-0 group cursor-pointer hover:bg-white/[0.02]" onClick={() => setEditing(field)}>
      <span className="text-muted text-xs">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`text-foreground text-sm ${type === 'number' ? 'font-semibold' : ''}`} style={type === 'number' ? { fontFamily: "'JetBrains Mono', monospace" } : undefined}>
          {type === 'number' && value != null ? (field === 'asking_price' ? money(value as number) : Number(value).toLocaleString()) : display}
        </span>
        <span className="text-muted/0 group-hover:text-muted/50 text-[10px] transition-colors">&#9998;</span>
      </span>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = { high: 'bg-go/10 text-go border-go/30', medium: 'bg-negotiate/10 text-negotiate border-negotiate/30', low: 'bg-pass/10 text-pass border-pass/30' };
  return <span className={`rounded-full border px-3 py-0.5 text-xs font-bold uppercase ${colors[level] || colors.low}`}>{level}</span>;
}

function CompCard({ comp, forceIncluded, onRemove }: { comp: AdjustedComp; forceIncluded?: boolean; onRemove?: () => void }) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${forceIncluded ? 'border-accent/30' : comp.warnings?.length > 0 ? 'border-negotiate/30' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-foreground">{comp.address}</p>
        <div className="flex items-center gap-1.5">
          {forceIncluded && (
            <button onClick={onRemove} className="text-[10px] bg-pass/10 text-pass rounded-full px-2 py-0.5 hover:bg-pass/20 transition-colors">
              Exclude
            </button>
          )}
          {comp.same_subdivision && <span className="text-[10px] bg-go/10 text-go rounded-full px-2 py-0.5">Same subdivision</span>}
        </div>
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

function OfferLine({ label, value, bold, green, red }: { label: string; value: string; bold?: boolean; green?: boolean; red?: boolean }) {
  let cls = 'text-foreground';
  if (green) cls = 'text-go font-semibold';
  if (red) cls = 'text-pass font-semibold';
  if (bold) cls += ' font-semibold';
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}:</span>
      <span className={cls} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
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
