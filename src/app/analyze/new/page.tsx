'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

const propertyTypes = ['ranch', '2-story', 'split-level', 'historic', 'condo', 'townhouse', 'multi'];
const conditions = ['excellent', 'good', 'fair', 'poor'];
const trafficOptions = ['none', 'siding', 'backing', 'fronting'];

export default function NewAnalysis() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const data = {
      address: form.get('address'),
      city: form.get('city'),
      state: form.get('state'),
      zip: form.get('zip'),
      beds: form.get('beds') ? Number(form.get('beds')) : null,
      baths: form.get('baths') ? Number(form.get('baths')) : null,
      sqft: form.get('sqft') ? Number(form.get('sqft')) : null,
      lot_sqft: form.get('lot_sqft') ? Number(form.get('lot_sqft')) : null,
      year_built: form.get('year_built') ? Number(form.get('year_built')) : null,
      property_type: form.get('property_type'),
      condition: form.get('condition'),
      has_pool: form.get('has_pool') === 'on',
      has_garage: form.get('has_garage') === 'on',
      garage_count: form.get('garage_count') ? Number(form.get('garage_count')) : 0,
      has_carport: form.get('has_carport') === 'on',
      has_basement: form.get('has_basement') === 'on',
      basement_sqft: form.get('basement_sqft') ? Number(form.get('basement_sqft')) : 0,
      has_guest_house: form.get('has_guest_house') === 'on',
      guest_house_sqft: form.get('guest_house_sqft') ? Number(form.get('guest_house_sqft')) : 0,
      traffic_commercial: form.get('traffic_commercial'),
      asking_price: form.get('asking_price') ? Number(form.get('asking_price')) : null,
      notes: form.get('notes'),
    };

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const deal = await res.json();
      router.push(`/analyze/${deal.id}`);
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-6">New Analysis</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Address */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-accent">Property Address</h2>
            <input name="address" required placeholder="Street Address" className="input-field w-full" />
            <div className="grid grid-cols-3 gap-3">
              <input name="city" placeholder="City" className="input-field" />
              <input name="state" placeholder="State" className="input-field" />
              <input name="zip" placeholder="ZIP" className="input-field" />
            </div>
          </div>

          {/* Property Details */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-accent">Property Details</h2>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="label-text">Beds</label>
                <input name="beds" type="number" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Baths</label>
                <input name="baths" type="number" step="0.5" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Sqft</label>
                <input name="sqft" type="number" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Lot Sqft</label>
                <input name="lot_sqft" type="number" className="input-field w-full" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label-text">Year Built</label>
                <input name="year_built" type="number" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Property Type</label>
                <select name="property_type" className="input-field w-full">
                  {propertyTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label-text">Condition</label>
                <select name="condition" className="input-field w-full">
                  {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-accent">Features</h2>
            <div className="grid grid-cols-3 gap-4">
              <label className="checkbox-label">
                <input name="has_pool" type="checkbox" className="checkbox-input" />
                <span>Pool</span>
              </label>
              <label className="checkbox-label">
                <input name="has_garage" type="checkbox" className="checkbox-input" />
                <span>Garage</span>
              </label>
              <label className="checkbox-label">
                <input name="has_carport" type="checkbox" className="checkbox-input" />
                <span>Carport</span>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label-text">Garage Count</label>
                <input name="garage_count" type="number" defaultValue="0" className="input-field w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="checkbox-label">
                <input name="has_basement" type="checkbox" className="checkbox-input" />
                <span>Basement</span>
              </label>
              <label className="checkbox-label">
                <input name="has_guest_house" type="checkbox" className="checkbox-input" />
                <span>Guest House</span>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-text">Basement Sqft</label>
                <input name="basement_sqft" type="number" defaultValue="0" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Guest House Sqft</label>
                <input name="guest_house_sqft" type="number" defaultValue="0" className="input-field w-full" />
              </div>
            </div>
          </div>

          {/* Financial */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-accent">Financial</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-text">Asking Price ($)</label>
                <input name="asking_price" type="number" className="input-field w-full" />
              </div>
              <div>
                <label className="label-text">Traffic/Commercial</label>
                <select name="traffic_commercial" className="input-field w-full">
                  {trafficOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-accent">Notes</h2>
            <textarea name="notes" rows={3} placeholder="Any notes about this property..." className="input-field w-full" />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? 'Creating Deal...' : 'Create Deal & Begin Analysis'}
          </button>
        </form>

        <style jsx>{`
          .input-field {
            background: #070B14;
            border: 1px solid #1A2332;
            border-radius: 0.5rem;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            color: #E2E8F0;
            outline: none;
            transition: border-color 0.2s;
          }
          .input-field:focus {
            border-color: #3AADE8;
          }
          .label-text {
            display: block;
            font-size: 0.75rem;
            color: #64748B;
            margin-bottom: 0.25rem;
          }
          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.875rem;
            color: #E2E8F0;
            cursor: pointer;
          }
          .checkbox-input {
            accent-color: #3AADE8;
          }
        `}</style>
      </main>
    </div>
  );
}
