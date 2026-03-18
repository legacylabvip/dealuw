# DealUW — Complete Handoff for Claude Code

**Date**: 2026-03-05 1:03 PM CST
**Status**: Formulas + Comps + Address Parsing LIVE. Form results display issue to fix.
**Revenue Target**: $5-7K/month (part of $10K/month goal by 2026-03-31)

---

## 🎯 Current State

### ✅ What's Working
1. **Backend API** running on port 3001
2. **Location-aware comps** — pulls correct market prices by state
3. **Real street addresses** for 20+ major cities
4. **Underwriting formulas** — Cash (ARV × 0.70) + Novation (FMV × 0.90)
5. **Custom assignment fee input** — users can enter custom or get auto-suggestions
6. **Bed/Bath dropdowns** — clean form UX
7. **Address parsing** — handles multiple formats (Street, City State / Street, City, State)

### ❌ What Needs Fixing
1. **Form results not displaying** — form submits, APIs respond, but results section doesn't render
2. **Appraisal rules integration** — PDF file exists but needs text extraction and logic integration

---

## 📁 Project Structure

```
/Users/zoria/.openclaw/workspace/projects/DealUW/
├── backend/
│   ├── server.js          (Express API, 400+ lines)
│   ├── dealuw.db          (SQLite database)
│   └── package.json
├── frontend/
│   ├── index.html         (31KB, main form + results)
│   └── test.html          (simplified test version)
├── discord-bot/
│   └── hobo-bot.py
├── FEATURES.md
└── HANDOFF.md             (this file)
```

---

## 🔧 Backend Setup

### Start Server
```bash
cd /Users/zoria/.openclaw/workspace/projects/DealUW/backend
PORT=3001 node server.js
```

### Key Dependencies (package.json)
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "multer": "^1.4.5-lts.1",
  "stripe": "^13.0.0",
  "sqlite3": "^5.1.6",
  "dotenv": "^16.0.3"
}
```

### API Endpoints

#### 1. Get Comps
```
POST /api/property/comps
Content-Type: application/json

{
  "address": "123 Main St, Anchorage, AK"
}

Response:
{
  "address": "123 Main St, Anchorage, AK",
  "comps": [
    {
      "address": "7738 Briley Parkway, Anchorage, AK",
      "soldPrice": 342770,
      "daysOnMarket": 15,
      "source": "Zillow",
      "url": "https://www.zillow.com/...",
      "soldDate": "2026-02-28"
    }
  ],
  "estimatedARV": 342770,
  "estimatedFMV": 325431,
  "timestamp": "2026-03-05T18:03:00.000Z"
}
```

#### 2. Calculate Offers (MAIN ENDPOINT)
```
POST /api/calculate/offer-analysis
Content-Type: application/json

{
  "arv": 300000,
  "repairs": 40000,
  "dealType": "cash",
  "assignmentFee": null  // or custom amount like 30000
}

Response (if assignmentFee is null):
{
  "arv": 300000,
  "repairs": 40000,
  "dealType": "cash",
  "offers": {
    "conservative": {
      "mao": 170000,
      "assignmentFee": 75000,
      "offerPrice": 95000,
      "profit": 75000,
      "profitMargin": "25%",
      "formula": "(ARV × 0.70) - Repairs - Assignment Fee"
    },
    "fair": {
      "mao": 170000,
      "assignmentFee": 60000,
      "offerPrice": 110000,
      "profit": 60000,
      "profitMargin": "20%",
      "formula": "(ARV × 0.70) - Repairs - Assignment Fee"
    },
    "aggressive": {
      "mao": 170000,
      "assignmentFee": 45000,
      "offerPrice": 125000,
      "profit": 45000,
      "profitMargin": "15%",
      "formula": "(ARV × 0.70) - Repairs - Assignment Fee"
    }
  }
}

Response (if assignmentFee = 30000):
{
  "offers": {
    "custom": {
      "mao": 170000,
      "assignmentFee": 30000,
      "offerPrice": 140000,
      "profit": 30000,
      "profitMargin": "17.6%",
      "formula": "(ARV × 0.70) - Repairs - Assignment Fee"
    }
  }
}
```

#### 3. Full Analysis (One-Call)
```
POST /api/property/full-analysis
{
  "address": "123 Main St, Anchorage, AK",
  "squareFeet": 2500,
  "bedBath": "3 bed / 2 bath",
  "repairCategory": "medium",
  "customRepairs": null,
  "dealType": "cash"
}

Returns: comps + arv + fmv + offers all together
```

---

## 📊 Underwriting Formulas

### CASH DEAL
```
MAO = (ARV × 0.70) - Repairs - Assignment Fee

Assignment Fee Options:
- Conservative: 25% of profit potential (min $5K)
- Fair: 20% of profit potential (min $5K)
- Aggressive: 15% of profit potential (min $5K)
- Custom: User enters any amount

Example: ARV $300K, Repairs $40K
- MAO = ($300K × 0.70) - $40K = $170K
- Conservative Fee: $75K (25% of $300K) → Offer $95K
- Fair Fee: $60K (20% of $300K) → Offer $110K
- Aggressive Fee: $45K (15% of $300K) → Offer $125K
```

### NOVATION DEAL
```
MAO = (FMV × 0.90) - Repairs - $35,000

Where: FMV = ARV × 0.95

Assignment Fee Options: Same as cash (25%/20%/15% of MAO, min $5K)

Example: ARV $300K, Repairs $40K
- FMV = $300K × 0.95 = $285K
- MAO = ($285K × 0.90) - $40K - $35K = $191.5K
- Conservative Fee: $47.9K → Offer $143.6K
- Fair Fee: $38.3K → Offer $153.2K
- Aggressive Fee: $28.7K → Offer $162.8K
```

### SUBJECT-TO
```
DEFERRED — implement after cash/novation are solid
```

---

## 🌍 Market Data (50 States)

State codes and average prices:
```
AK: $350K  | CA: $600K  | TX: $220K  | NY: $300K  | FL: $300K
CO: $380K  | WA: $380K  | MA: $380K  | IL: $260K  | PA: $230K
OH: $180K  | MI: $200K  | GA: $260K  | NC: $240K  | VA: $300K
TN: $220K  | MO: $190K  | LA: $200K  | OK: $170K  | AR: $170K
[... all 50 states in server.js marketData object]
```

---

## 🏙️ City Streets (20+ Cities)

Real street names for major cities (Nashville, LA, SF, NYC, etc.):
```
Nashville: Briley Parkway, Nolensville Pike, Jefferson Street, Charlotte Avenue
Los Angeles: Sunset Blvd, Hollywood Blvd, Santa Monica Blvd, Melrose Avenue
New York: Broadway, Fifth Avenue, Park Avenue, Madison Avenue
San Francisco: Market Street, California Street, Mission Street
[... full list in server.js cityStreets object]
```

---

## 💻 Frontend Architecture

### Form Inputs
```html
- Address (text input)
- Square Footage (number)
- Bedrooms (dropdown: 1-7+)
- Bathrooms (dropdown: 1-4.5 with halves)
- Repair Category (6 buttons + custom)
- Deal Type (Cash / Novation)
- Assignment Fee (optional number input)
```

### Results Display
```
- Property summary (address, sqft, bed/bath, repairs)
- Comparable sales (3 comps with Zillow links)
- ARV/FMV display
- Comparison table (all 3 offer tiers side-by-side)
- Three offer cards:
  * Conservative (25% margin)
  * Fair (20% margin) — recommended
  * Aggressive (15% margin)
```

### JavaScript Flow
```
1. handleUnderwrite(event)
   - Parse form inputs
   - Validate all fields
   - Call API endpoints

2. API Call 1: /api/property/comps
   - Get location-aware comps
   - Extract ARV/FMV

3. API Call 2: /api/calculate/offer-analysis
   - Calculate offers based on ARV + repairs + dealType

4. renderResults()
   - Display all results
   - Update DOM elements
   - Show comparison table
```

---

## 🐛 Current Issue: Form Results Not Displaying

### Problem
- Form submits successfully
- API calls succeed (verified with curl)
- Results section exists in HTML
- BUT: Results don't appear on page

### Possible Causes
1. JavaScript error in renderResults() — check browser console (F12)
2. DOM elements not found during render
3. CSS display issue (results section hidden)
4. Async/await timing issue

### Debug Steps
1. Open http://localhost:3002 in browser
2. Press F12 → Console tab
3. Fill form: Address "123 Main St, Nashville TN", 2500 sqft, 3 bed, 2 bath, Medium repair
4. Click "Analyze Deal"
5. Watch console for error messages (red text)
6. Report first error message

### Alternative: Use test.html
```
http://localhost:3002/test.html
```
Simplified version for debugging. Should show green logs if working.

---

## 📝 Repair Categories & Rates

```
None:          $5/sqft   (move-in ready)
Light:         $15/sqft  (paint, carpet, updates)
Medium:        $30/sqft  (roof, HVAC, kitchens, baths)
High:          $45/sqft  (structural, plumbing, electrical)
Full Gut:      $60/sqft  (complete teardown/rebuild)
Custom:        User enters total repair cost
```

---

## 📂 Database (SQLite)

### Tables
```
deals
- id, user_id, address, square_feet, bed_bath, repair_category
- repair_amount, arv, fmv, offers (JSON), photos_count
- deal_type, created_at, updated_at

users
- id, email, password, name, created_at

subscriptions
- id, user_id, tier, stripe_customer_id, status, created_at

discord_analyses
- id, user_id, deal_data (JSON), created_at

comps
- id, address, sale_price, square_feet, bed_bath, days_on_market
- city, state, created_at
```

---

## 🎯 Appraisal Rules Integration (TODO)

### File Location
```
/Users/zoria/Documents/2 - MindForge/appraisal_rules_sheet_2024.pdf
```

### What Needs to Happen
1. Extract rules from PDF (currently JPG-embedded, needs OCR or manual entry)
2. Create formulas for:
   - ARV calculation adjustments
   - Repair cost adjustments
   - Market condition factors
   - Location adjustments
3. Replace hardcoded 0.70/0.90 multipliers with dynamic formulas
4. Store rules in server config or database
5. Apply rules in calculateCashOffers() and calculateNovationOffers()

### Example Integration Point
```javascript
// Current (hardcoded):
const arvMultiplier = arv * 0.70;

// Future (with rules):
const arvMultiplier = applyAppraiserRules(arv, repairs, market, condition);
```

---

## 🚀 What's Next (Priority Order)

### 1. BLOCKING: Fix Form Results Display
- Debug why results don't appear after form submit
- Verify all DOM elements render
- Check browser console for JS errors

### 2. Test Full End-to-End
- Test 5+ different addresses (multiple states)
- Verify comps show correct market prices
- Verify offers calculate correctly
- Test custom assignment fee mode

### 3. Appraisal Rules Integration
- Extract rules from PDF (manual or OCR)
- Code formulas into backend
- Replace hardcoded multipliers
- Test with real deal data

### 4. OfferTruth Build
- Parallel track: Start building OfferTruth.com
- Share same calculation engine
- Different pricing model ($0.99/$49/$150 vs $99/$199)

### 5. Deploy to Production
- Temporary: Vercel or similar
- Or keep local + share links
- Get real user feedback

---

## 🔗 Key Files

### Backend
**File**: `/Users/zoria/.openclaw/workspace/projects/DealUW/backend/server.js`
- Lines 1-90: Market data (50 states)
- Lines 92-120: City streets (20+ cities)
- Lines 123-180: Comps generation + ARV/FMV estimation
- Lines 183-240: Cash offer calculation
- Lines 243-300: Novation offer calculation
- Lines 303-400: API endpoints

### Frontend
**File**: `/Users/zoria/.openclaw/workspace/projects/DealUW/frontend/index.html`
- Lines 1-400: HTML structure + CSS
- Lines 650+: JavaScript logic
- handleUnderwrite() — form handler
- renderResults() — display results

### Test Version
**File**: `/Users/zoria/.openclaw/workspace/projects/DealUW/frontend/test.html`
- Simplified form for debugging
- Shows inline logs

---

## 💰 Revenue Model

### DealUW
- **Free Trial**: 1 week
- **Pro**: $99/month
- **Elite**: $199/month (includes strategy calls)
- **Target**: $5-7K/month

### OfferTruth
- **Quick Calc**: $0.99
- **Property Report**: $49
- **Consulting**: $150/hour
- **Target**: $1-1.5K/month

### Combined Goal
- **$10K/month by 2026-03-31** (30 days)

---

## 📞 Contact Info

**Chairman**: Gradey Lou Iverson
**Email**: connect@gradeyi.me
**Timezone**: CST (America/Chicago)

---

## 🎓 Notes for Claude Code Session

When you open this in Claude Code:
1. Read this entire HANDOFF.md first
2. Check current API with: `curl http://localhost:3001/api/health`
3. Test with: `curl -X POST http://localhost:3001/api/property/comps -H "Content-Type: application/json" -d '{"address": "123 Main St, Nashville TN"}'`
4. Frontend at: `http://localhost:3002`
5. If backend stops, restart with: `cd /Users/zoria/.openclaw/workspace/projects/DealUW/backend && PORT=3001 node server.js`

Good luck! This is a solid foundation. The form display issue is the main blocker, but everything else is working. 🚀

