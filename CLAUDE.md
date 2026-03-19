# DealUW — Smart Property Underwriting
## About
Property underwriting tool for real estate wholesalers. Enter an address,
auto-pull comps, apply professional appraisal rules, calculate ARV with
adjustments, estimate repairs, get MAO, receive AI-powered Go/No-Go
recommendation. Built by Arctic Acquisitions LLC.

## Stack
- Next.js 15 (App Router)
- Tailwind CSS v4
- React 19
- SQLite via better-sqlite3
- Port 3200

## Design
- Dark theme with arctic/cold feel
- Background: #070B14, Cards: #0C1220, Borders: #1A2332
- Primary accent: #3AADE8 (arctic blue)
- Money/results: #D4AF37 (gold)
- Go: #22C55E, Negotiate: #F59E0B, Pass: #EF4444
- Fonts: DM Sans (body), JetBrains Mono (numbers), Cinzel (logo)

## Key Formula
MAO = (ARV × 0.70) - Repair Estimate

## Comp Rules (CRITICAL — these are professional appraisal standards)
- Max age: 180 days. Older comps: adjust ARV down 10-20%
- Same subdivision preferred (better to leave subdivision than use old comps)
- Within +/- 250 sqft of subject property
- Same property type (ranch, 2-story, historic, etc.)
- Do NOT cross major roads
- Build date within +/- 10 years of subject
- Lot size within 2,500 sqft of subject

## Adjustment Rules
- Bedroom: +/- $10K-$25K
- Bathroom: +/- $10K
- Garage: +/- $10K
- Carport: +/- $5K
- Pool: +/- $10K

## Traffic & Commercial Adjustments
Under $500K properties:
- Siding (backs to commercial/busy road): -$10K
- Backing (backs to something undesirable): -$10K
- Fronting (fronts major road/commercial): -$10K to -$20K

Over $500K properties:
- Siding: -10%
- Backing: -15%
- Fronting: -20%

## Basement/Guest House Rule
Only give 50% of $/sqft value for basement or guest house square footage

## Commands
npm run dev — start on port 3200
npm run build — production build
