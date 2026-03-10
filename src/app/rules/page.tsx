import Navbar from '@/components/Navbar';

const mono = { fontFamily: "'JetBrains Mono', monospace" } as const;

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="text-center mb-12">
          <h1
            className="text-3xl font-bold text-accent mb-2"
            style={{ fontFamily: "'Cinzel', serif" }}
          >
            DealUW Appraisal Rules
          </h1>
          <p className="text-sm text-muted">
            Professional-grade underwriting standards built into every analysis.
          </p>
        </div>

        {/* ═══ SECTION 1: COMP SELECTION RULES ═══ */}
        <SectionHeader number="01" title="Comp Selection Rules" subtitle="How DealUW filters comparable sales" />

        <div className="grid grid-cols-2 gap-4 mb-12">
          <RuleCard
            icon={<CalendarIcon />}
            title="Graduated Aging"
            description="Comps sold within 180 days are preferred. Older comps are allowed with graduated penalties: 2% at 150 days, 5% at 180 days, 7.5% at 270 days, and 12.5% at 365+ days."
            value="No cutoff"
          />
          <RuleCard
            icon={<RulerIcon />}
            title="+/- 250 Square Feet"
            description="Comps must be within 250 sqft of the subject property. A 1,500 sqft home shouldn't be compared to a 2,000 sqft home."
            value="250 sqft"
          />
          <RuleCard
            icon={<HomeIcon />}
            title="Same Property Type"
            description="Ranch comps for ranch homes. 2-story comps for 2-story homes. Never mix property types — they trade differently."
            value="Exact match"
          />
          <RuleCard
            icon={<RoadIcon />}
            title="No Major Road Crossings"
            description="Comps must be on the same side of major roads. Crossing a highway or arterial road changes the neighborhood."
            value="Same side"
          />
          <RuleCard
            icon={<YearIcon />}
            title="+/- 10 Year Build Date"
            description="A home built in 2005 shouldn't be compared to one built in 1965. Systems, layout, and appeal are fundamentally different."
            value="10 years"
          />
          <RuleCard
            icon={<LotIcon />}
            title="+/- 2,500 Sqft Lot Size"
            description="Lot size matters. A home on a quarter acre shouldn't be compared to one on a full acre."
            value="2,500 sqft"
          />
          <div className="col-span-2">
            <RuleCard
              icon={<SubdivisionIcon />}
              title="Same Subdivision Preferred"
              description="Same subdivision comps are always best. It's better to leave the subdivision for a better comp than to time-travel with an old one. Different subdivision comps are flagged but not automatically disqualified."
              value="Preferred"
              wide
            />
          </div>
        </div>

        {/* ═══ SECTION 2: ADJUSTMENT RULES ═══ */}
        <SectionHeader number="02" title="Feature Adjustments" subtitle="Dollar adjustments applied when comps differ from the subject" />

        <div className="rounded-xl border border-border bg-card overflow-hidden mb-12">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-5 text-xs font-semibold text-muted uppercase tracking-wider">Feature</th>
                <th className="text-right py-3 px-5 text-xs font-semibold text-muted uppercase tracking-wider">Adjustment</th>
                <th className="text-left py-3 px-5 text-xs font-semibold text-muted uppercase tracking-wider">How It Works</th>
              </tr>
            </thead>
            <tbody>
              <AdjustmentRow
                feature="Bedroom"
                adjustment="+/- $10K - $25K"
                note="Scaled by price range: $10K (under $200K), $15K ($200-400K), $25K (over $400K)"
                highlight
              />
              <AdjustmentRow
                feature="Bathroom"
                adjustment="+/- $10,000"
                note="Per full or half bath difference between subject and comp"
              />
              <AdjustmentRow
                feature="Garage"
                adjustment="+/- $10,000"
                note="Per garage bay difference. No garage vs 2-car = $20K adjustment"
                highlight
              />
              <AdjustmentRow
                feature="Carport"
                adjustment="+/- $5,000"
                note="Applied when one property has a carport and the other doesn't"
              />
              <AdjustmentRow
                feature="Pool"
                adjustment="+/- $10,000"
                note="Applied when one property has a pool and the other doesn't"
                highlight
              />
            </tbody>
          </table>
        </div>

        {/* ═══ SECTION 3: TRAFFIC & COMMERCIAL ═══ */}
        <SectionHeader number="03" title="Traffic & Commercial" subtitle="Adjustments for properties with road or commercial exposure" />

        <div className="grid grid-cols-2 gap-4 mb-12">
          {/* Under $500K */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent" style={mono}>Under $500K</span>
              <span className="text-xs text-muted">Flat dollar amounts</span>
            </div>
            <div className="space-y-3">
              <TrafficRow label="Siding" sublabel="Backs to commercial / busy road" value="-$10,000" />
              <TrafficRow label="Backing" sublabel="Backs to something undesirable" value="-$10,000" />
              <TrafficRow label="Fronting" sublabel="Fronts major road / commercial" value="-$10K to -$20K" highlight />
            </div>
          </div>

          {/* Over $500K */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="rounded-full bg-gold/10 px-3 py-1 text-xs font-bold text-gold" style={mono}>Over $500K</span>
              <span className="text-xs text-muted">Percentage of ARV</span>
            </div>
            <div className="space-y-3">
              <TrafficRow label="Siding" sublabel="Backs to commercial / busy road" value="-10%" />
              <TrafficRow label="Backing" sublabel="Backs to something undesirable" value="-15%" />
              <TrafficRow label="Fronting" sublabel="Fronts major road / commercial" value="-20%" highlight />
            </div>
          </div>
        </div>

        {/* ═══ SECTION 4: SPECIAL RULES ═══ */}
        <SectionHeader number="04" title="Special Rules" subtitle="Additional adjustments that protect your margins" />

        <div className="grid grid-cols-2 gap-4 mb-12">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                <BasementIcon />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Basement / Guest House</h4>
                <p className="text-xs text-muted">Valued at 50% of $/sqft</p>
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Below-grade and detached living space is never worth the same as primary square footage. DealUW automatically calculates effective square footage at 50% value for basements and guest houses.
            </p>
            <div className="mt-4 rounded-lg bg-background border border-border px-4 py-3">
              <p className="text-xs text-muted mb-1">Example</p>
              <p className="text-sm text-foreground" style={mono}>
                1,500 sqft main + 800 sqft basement
              </p>
              <p className="text-sm text-gold font-semibold" style={mono}>
                = 1,900 effective sqft
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-10 h-10 rounded-lg bg-negotiate/10 flex items-center justify-center text-negotiate">
                <ClockIcon />
              </span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Aging Comp Penalty</h4>
                <p className="text-xs text-muted">Graduated penalties for older comps</p>
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              Older comps are less reliable as market conditions change. DealUW applies graduated penalties based on age, with a hard cutoff at 365 days.
            </p>
            <div className="mt-4 rounded-lg bg-background border border-border px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">0-120 days</span>
                <span className="text-go font-semibold">No penalty</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">120-150 days</span>
                <span className="text-negotiate font-semibold">Warning flag</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">150-180 days</span>
                <span className="text-pass font-semibold">-2% penalty</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">180-270 days</span>
                <span className="text-pass font-semibold">-5% penalty</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">270-365 days</span>
                <span className="text-pass font-semibold">-7.5% penalty</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">365+ days</span>
                <span className="text-pass font-semibold">-12.5% penalty</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 5: THE 70% RULE ═══ */}
        <SectionHeader number="05" title="The 70% Rule" subtitle="The foundation of every wholesale deal" />

        <div className="rounded-2xl border border-gold/20 bg-card p-8 mb-8 shadow-[0_0_40px_rgba(212,175,55,0.05)]">
          <div className="text-center mb-6">
            <p className="text-xs text-muted tracking-widest uppercase mb-4">Maximum Allowable Offer</p>
            <div className="flex items-center justify-center gap-3 flex-wrap" style={mono}>
              <span className="text-2xl font-bold text-accent">MAO</span>
              <span className="text-xl text-muted">=</span>
              <span className="text-xl text-foreground">(</span>
              <span className="text-2xl font-bold text-accent">ARV</span>
              <span className="text-xl text-muted">&times;</span>
              <span className="text-2xl font-bold text-gold">70%</span>
              <span className="text-xl text-foreground">)</span>
              <span className="text-xl text-muted">&minus;</span>
              <span className="text-2xl font-bold text-pass">Repairs</span>
            </div>
          </div>

          <div className="max-w-xl mx-auto">
            <div className="rounded-xl bg-background border border-border p-5 mb-6">
              <p className="text-xs text-muted mb-3">Example Deal</p>
              <div className="space-y-2">
                <FormulaRow label="ARV (After Repair Value)" value="$250,000" color="text-accent" />
                <FormulaRow label="x 70% Rule" value="$175,000" color="text-gold" />
                <FormulaRow label="- Estimated Repairs" value="$35,000" color="text-pass" />
                <div className="h-px bg-border my-2" />
                <FormulaRow label="MAO (Your max offer)" value="$140,000" color="text-gold" bold />
              </div>
            </div>

            <p className="text-sm text-muted text-center leading-relaxed">
              The 30% margin covers your assignment fee, buyer&apos;s profit, closing costs,
              holding costs, and a cushion for the unexpected. This is the industry standard
              that keeps deals profitable and protects everyone in the chain.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border">
          <p className="text-xs text-muted">
            These rules are based on professional appraisal standards and years of wholesaling experience.
          </p>
          <p className="text-xs text-muted mt-1">
            DealUW applies them automatically to every analysis.
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ number, title, subtitle }: { number: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-6">
      <span className="text-xs font-bold text-accent/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{number}</span>
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function RuleCard({ icon, title, description, value, wide }: {
  icon: React.ReactNode; title: string; description: string; value: string; wide?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 hover:border-accent/20 transition-colors ${wide ? '' : ''}`}>
      <div className="flex items-start gap-4">
        <span className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <span className="rounded-full bg-background border border-border px-2.5 py-0.5 text-[11px] font-bold text-accent shrink-0"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {value}
            </span>
          </div>
          <p className="text-sm text-muted leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

function AdjustmentRow({ feature, adjustment, note, highlight }: {
  feature: string; adjustment: string; note: string; highlight?: boolean;
}) {
  return (
    <tr className={`border-b border-border/50 ${highlight ? 'bg-white/[0.01]' : ''}`}>
      <td className="py-3.5 px-5 text-sm font-medium text-foreground">{feature}</td>
      <td className="py-3.5 px-5 text-right">
        <span className="text-sm font-bold text-gold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{adjustment}</span>
      </td>
      <td className="py-3.5 px-5 text-sm text-muted">{note}</td>
    </tr>
  );
}

function TrafficRow({ label, sublabel, value, highlight }: {
  label: string; sublabel: string; value: string; highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${highlight ? 'bg-pass/5 border border-pass/10' : 'bg-background border border-border'}`}>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted">{sublabel}</p>
      </div>
      <span className={`text-sm font-bold ${highlight ? 'text-pass' : 'text-negotiate'}`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

function FormulaRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-sm ${bold ? 'text-lg font-black' : 'font-bold'} ${color}`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </span>
    </div>
  );
}

// ─── Icons (simple SVG) ─────────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
      <path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function RoadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19 8 3" /><path d="M16 3l4 16" /><line x1="12" y1="5" x2="12" y2="7" /><line x1="12" y1="11" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="19" />
    </svg>
  );
}

function YearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function LotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 22 16 8" /><path d="m3.47 18.5 1.06-3.19c.29-.85 1.32-1.17 2.03-.6L17 22" /><path d="M15.22 13.53 20 7h-8Z" /><path d="M22 22H2" />
    </svg>
  );
}

function SubdivisionIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="6" height="6" rx="1" /><rect x="16" y="7" width="6" height="6" rx="1" /><rect x="9" y="2" width="6" height="6" rx="1" /><rect x="9" y="14" width="6" height="6" rx="1" /><path d="M12 8v6" /><path d="M8 10h3" /><path d="M13 10h3" />
    </svg>
  );
}

function BasementIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="15" x2="9" y2="21" /><line x1="15" y1="15" x2="15" y2="21" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 8 14" />
    </svg>
  );
}
