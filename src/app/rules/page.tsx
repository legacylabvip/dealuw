import Navbar from '@/components/Navbar';

const rules = [
  { category: 'Comp Selection', items: [
    'Max age: 180 days. Older comps adjust ARV down 10-20%',
    'Same subdivision preferred',
    'Within +/- 250 sqft of subject',
    'Same property type required',
    'Do NOT cross major roads',
    'Build date within +/- 10 years',
    'Lot size within 2,500 sqft',
  ]},
  { category: 'Feature Adjustments', items: [
    'Bedroom: +/- $10K-$25K',
    'Bathroom: +/- $10K',
    'Garage: +/- $10K',
    'Carport: +/- $5K',
    'Pool: +/- $10K',
  ]},
  { category: 'Traffic & Commercial (Under $500K)', items: [
    'Siding (backs to commercial/busy road): -$10K',
    'Backing (backs to undesirable): -$10K',
    'Fronting (fronts major road/commercial): -$10K to -$20K',
  ]},
  { category: 'Traffic & Commercial (Over $500K)', items: [
    'Siding: -10%',
    'Backing: -15%',
    'Fronting: -20%',
  ]},
  { category: 'Special Rules', items: [
    'Basement/Guest House: 50% of $/sqft value',
    'MAO = (ARV x 0.70) - Repair Estimate',
  ]},
];

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-bold text-foreground mb-6">Underwriting Rules</h1>
        <div className="grid grid-cols-2 gap-4">
          {rules.map((section) => (
            <div key={section.category} className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-accent mb-3">{section.category}</h3>
              <ul className="space-y-2">
                {section.items.map((item) => (
                  <li key={item} className="text-sm text-muted flex gap-2">
                    <span className="text-accent mt-0.5">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
