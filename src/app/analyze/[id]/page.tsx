'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';

interface Deal {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  beds: number;
  baths: number;
  sqft: number;
  lot_sqft: number;
  year_built: number;
  property_type: string;
  condition: string;
  asking_price: number;
  arv_raw: number;
  arv_adjusted: number;
  repair_estimate: number;
  mao: number;
  assignment_fee: number;
  recommendation: string;
  confidence: string;
  status: string;
  traffic_commercial: string;
  notes: string;
  comps?: Comp[];
}

interface Comp {
  id: number;
  address: string;
  sale_price: number;
  sale_date: string;
  days_old: number;
  sqft: number;
  beds: number;
  baths: number;
  adjusted_price: number;
  disqualified: number;
  disqualified_reason: string;
  selected: number;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '--';
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function recColor(rec: string): string {
  if (rec === 'go') return 'text-go';
  if (rec === 'negotiate') return 'text-negotiate';
  return 'text-pass';
}

function recBg(rec: string): string {
  if (rec === 'go') return 'bg-go/10 border-go/30';
  if (rec === 'negotiate') return 'bg-negotiate/10 border-negotiate/30';
  return 'bg-pass/10 border-pass/30';
}

export default function DealDetail() {
  const params = useParams();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/deals/${params.id}`)
      .then((r) => r.json())
      .then((d) => { setDeal(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-10 text-center text-muted">Loading...</main>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-7xl px-6 py-10 text-center text-muted">Deal not found</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-foreground">{deal.address}</h1>
            <p className="text-sm text-muted">{[deal.city, deal.state, deal.zip].filter(Boolean).join(', ')}</p>
          </div>
          {deal.recommendation && (
            <div className={`rounded-lg border px-4 py-2 ${recBg(deal.recommendation)}`}>
              <span className={`text-sm font-bold uppercase ${recColor(deal.recommendation)}`}>
                {deal.recommendation}
              </span>
              {deal.confidence && (
                <span className="text-xs text-muted ml-2">({deal.confidence} confidence)</span>
              )}
            </div>
          )}
        </div>

        {/* Key Numbers */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <NumberCard label="Asking Price" value={fmt(deal.asking_price)} />
          <NumberCard label="ARV (Adjusted)" value={fmt(deal.arv_adjusted)} highlight />
          <NumberCard label="Repair Estimate" value={fmt(deal.repair_estimate)} />
          <NumberCard label="MAO" value={fmt(deal.mao)} highlight />
          <NumberCard label="Assignment Fee" value={fmt(deal.assignment_fee)} />
        </div>

        {/* Property Details */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Property Details</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Detail label="Beds" value={deal.beds} />
              <Detail label="Baths" value={deal.baths} />
              <Detail label="Sqft" value={deal.sqft?.toLocaleString()} />
              <Detail label="Lot Sqft" value={deal.lot_sqft?.toLocaleString()} />
              <Detail label="Year Built" value={deal.year_built} />
              <Detail label="Type" value={deal.property_type} />
              <Detail label="Condition" value={deal.condition} />
              <Detail label="Traffic/Commercial" value={deal.traffic_commercial} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Formula</h3>
            <div className="space-y-2 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <p className="text-muted">ARV (Raw): <span className="text-foreground">{fmt(deal.arv_raw)}</span></p>
              <p className="text-muted">ARV (Adjusted): <span className="text-gold">{fmt(deal.arv_adjusted)}</span></p>
              <p className="text-muted">ARV x 0.70: <span className="text-foreground">{fmt(deal.arv_adjusted ? deal.arv_adjusted * 0.7 : null)}</span></p>
              <p className="text-muted">- Repairs: <span className="text-pass">{fmt(deal.repair_estimate)}</span></p>
              <hr className="border-border" />
              <p className="text-muted">MAO: <span className="text-gold font-bold">{fmt(deal.mao)}</span></p>
            </div>
          </div>
        </div>

        {/* Comps */}
        {deal.comps && deal.comps.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-3">Comps ({deal.comps.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted text-xs">
                    <th className="text-left py-2 px-2">Address</th>
                    <th className="text-right py-2 px-2">Sale Price</th>
                    <th className="text-right py-2 px-2">Adjusted</th>
                    <th className="text-right py-2 px-2">Days Old</th>
                    <th className="text-right py-2 px-2">Sqft</th>
                    <th className="text-right py-2 px-2">Beds/Baths</th>
                    <th className="text-center py-2 px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {deal.comps.map((comp) => (
                    <tr key={comp.id} className={`border-b border-border/50 ${comp.disqualified ? 'opacity-40' : ''}`}>
                      <td className="py-2 px-2 text-foreground">{comp.address}</td>
                      <td className="py-2 px-2 text-right text-gold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(comp.sale_price)}</td>
                      <td className="py-2 px-2 text-right text-gold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(comp.adjusted_price)}</td>
                      <td className="py-2 px-2 text-right text-muted">{comp.days_old}</td>
                      <td className="py-2 px-2 text-right text-muted">{comp.sqft?.toLocaleString()}</td>
                      <td className="py-2 px-2 text-right text-muted">{comp.beds}/{comp.baths}</td>
                      <td className="py-2 px-2 text-center">
                        {comp.disqualified ? (
                          <span className="text-xs text-pass" title={comp.disqualified_reason}>DQ</span>
                        ) : (
                          <span className="text-xs text-go">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {deal.notes && (
          <div className="mt-4 rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-accent mb-2">Notes</h3>
            <p className="text-sm text-muted">{deal.notes}</p>
          </div>
        )}
      </main>
    </div>
  );
}

function NumberCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p
        className={`text-xl font-bold ${highlight ? 'text-gold' : 'text-foreground'}`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {value}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{value ?? '--'}</span>
    </>
  );
}
