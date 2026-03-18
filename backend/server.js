const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const stripe = require('stripe');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');

dotenv.config();

const app = express();
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// File upload config
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// SQLite Database
const dbPath = path.join(__dirname, 'dealuw.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('DB Error:', err);
  else console.log('✅ SQLite connected:', dbPath);
});

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER UNIQUE,
    tier TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS usage_tracking (
    id INTEGER PRIMARY KEY,
    user_id TEXT UNIQUE,
    analysis_count INTEGER DEFAULT 0,
    first_analysis_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_analysis_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    address TEXT,
    square_feet INTEGER,
    bed_bath TEXT,
    repair_category TEXT,
    repair_amount INTEGER,
    arv INTEGER,
    fmv INTEGER,
    offers TEXT,
    photos_count INTEGER,
    deal_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS discord_analyses (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    deal_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS comps (
    id INTEGER PRIMARY KEY,
    address TEXT,
    sale_price INTEGER,
    square_feet INTEGER,
    bed_bath TEXT,
    days_on_market INTEGER,
    city TEXT,
    state TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Middleware
app.use(cors());

// Stripe webhook needs raw body — must be registered BEFORE express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret) {
      event = stripeClient.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In dev without webhook secret, parse the raw body
      event = JSON.parse(req.body.toString());
      console.log('⚠️  No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📩 Stripe webhook received: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId && subscriptionId) {
        db.run(
          `INSERT INTO subscriptions (user_id, tier, stripe_customer_id, stripe_subscription_id, status)
           VALUES (?, 'pro', ?, ?, 'active')
           ON CONFLICT(user_id) DO UPDATE SET
             tier = 'pro',
             stripe_customer_id = excluded.stripe_customer_id,
             stripe_subscription_id = excluded.stripe_subscription_id,
             status = 'active'`,
          [userId, customerId, subscriptionId],
          (err) => {
            if (err) console.error('DB error saving subscription:', err.message);
            else console.log(`✅ Subscription activated for user ${userId}`);
          }
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;

      db.run(
        `UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = ?`,
        [subscriptionId],
        (err) => {
          if (err) console.error('DB error canceling subscription:', err.message);
          else console.log(`❌ Subscription canceled: ${subscriptionId}`);
        }
      );
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;
      const status = subscription.status; // active, past_due, canceled, etc.

      db.run(
        `UPDATE subscriptions SET status = ? WHERE stripe_subscription_id = ?`,
        [status, subscriptionId],
        (err) => {
          if (err) console.error('DB error updating subscription:', err.message);
          else console.log(`🔄 Subscription ${subscriptionId} updated to ${status}`);
        }
      );
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ COMPS DATA ============
// Market data by state (price ranges for realistic comps)
const marketData = {
  'AK': { minPrice: 280000, maxPrice: 450000, avgPrice: 350000, label: 'Alaska' },
  'AL': { minPrice: 150000, maxPrice: 280000, avgPrice: 200000, label: 'Alabama' },
  'AZ': { minPrice: 220000, maxPrice: 420000, avgPrice: 300000, label: 'Arizona' },
  'AR': { minPrice: 120000, maxPrice: 240000, avgPrice: 170000, label: 'Arkansas' },
  'CA': { minPrice: 450000, maxPrice: 850000, avgPrice: 600000, label: 'California' },
  'CO': { minPrice: 280000, maxPrice: 520000, avgPrice: 380000, label: 'Colorado' },
  'CT': { minPrice: 280000, maxPrice: 480000, avgPrice: 360000, label: 'Connecticut' },
  'DE': { minPrice: 220000, maxPrice: 420000, avgPrice: 300000, label: 'Delaware' },
  'FL': { minPrice: 200000, maxPrice: 450000, avgPrice: 300000, label: 'Florida' },
  'GA': { minPrice: 180000, maxPrice: 380000, avgPrice: 260000, label: 'Georgia' },
  'HI': { minPrice: 450000, maxPrice: 800000, avgPrice: 600000, label: 'Hawaii' },
  'ID': { minPrice: 200000, maxPrice: 380000, avgPrice: 270000, label: 'Idaho' },
  'IL': { minPrice: 180000, maxPrice: 380000, avgPrice: 260000, label: 'Illinois' },
  'IN': { minPrice: 130000, maxPrice: 280000, avgPrice: 190000, label: 'Indiana' },
  'IA': { minPrice: 120000, maxPrice: 260000, avgPrice: 170000, label: 'Iowa' },
  'KS': { minPrice: 130000, maxPrice: 260000, avgPrice: 180000, label: 'Kansas' },
  'KY': { minPrice: 130000, maxPrice: 280000, avgPrice: 190000, label: 'Kentucky' },
  'LA': { minPrice: 140000, maxPrice: 300000, avgPrice: 200000, label: 'Louisiana' },
  'ME': { minPrice: 150000, maxPrice: 320000, avgPrice: 220000, label: 'Maine' },
  'MD': { minPrice: 220000, maxPrice: 420000, avgPrice: 300000, label: 'Maryland' },
  'MA': { minPrice: 280000, maxPrice: 520000, avgPrice: 380000, label: 'Massachusetts' },
  'MI': { minPrice: 140000, maxPrice: 300000, avgPrice: 200000, label: 'Michigan' },
  'MN': { minPrice: 180000, maxPrice: 380000, avgPrice: 260000, label: 'Minnesota' },
  'MS': { minPrice: 110000, maxPrice: 220000, avgPrice: 160000, label: 'Mississippi' },
  'MO': { minPrice: 130000, maxPrice: 280000, avgPrice: 190000, label: 'Missouri' },
  'MT': { minPrice: 200000, maxPrice: 380000, avgPrice: 270000, label: 'Montana' },
  'NE': { minPrice: 120000, maxPrice: 260000, avgPrice: 170000, label: 'Nebraska' },
  'NV': { minPrice: 220000, maxPrice: 420000, avgPrice: 300000, label: 'Nevada' },
  'NH': { minPrice: 200000, maxPrice: 400000, avgPrice: 280000, label: 'New Hampshire' },
  'NJ': { minPrice: 280000, maxPrice: 520000, avgPrice: 380000, label: 'New Jersey' },
  'NM': { minPrice: 160000, maxPrice: 320000, avgPrice: 230000, label: 'New Mexico' },
  'NY': { minPrice: 200000, maxPrice: 520000, avgPrice: 300000, label: 'New York' },
  'NC': { minPrice: 160000, maxPrice: 340000, avgPrice: 240000, label: 'North Carolina' },
  'ND': { minPrice: 110000, maxPrice: 240000, avgPrice: 160000, label: 'North Dakota' },
  'OH': { minPrice: 120000, maxPrice: 280000, avgPrice: 180000, label: 'Ohio' },
  'OK': { minPrice: 120000, maxPrice: 260000, avgPrice: 170000, label: 'Oklahoma' },
  'OR': { minPrice: 240000, maxPrice: 440000, avgPrice: 320000, label: 'Oregon' },
  'PA': { minPrice: 150000, maxPrice: 340000, avgPrice: 230000, label: 'Pennsylvania' },
  'RI': { minPrice: 220000, maxPrice: 420000, avgPrice: 300000, label: 'Rhode Island' },
  'SC': { minPrice: 150000, maxPrice: 320000, avgPrice: 220000, label: 'South Carolina' },
  'SD': { minPrice: 120000, maxPrice: 260000, avgPrice: 170000, label: 'South Dakota' },
  'TN': { minPrice: 140000, maxPrice: 320000, avgPrice: 220000, label: 'Tennessee' },
  'TX': { minPrice: 140000, maxPrice: 340000, avgPrice: 220000, label: 'Texas' },
  'UT': { minPrice: 240000, maxPrice: 440000, avgPrice: 320000, label: 'Utah' },
  'VT': { minPrice: 180000, maxPrice: 360000, avgPrice: 260000, label: 'Vermont' },
  'VA': { minPrice: 200000, maxPrice: 420000, avgPrice: 300000, label: 'Virginia' },
  'WA': { minPrice: 280000, maxPrice: 520000, avgPrice: 380000, label: 'Washington' },
  'WV': { minPrice: 100000, maxPrice: 220000, avgPrice: 150000, label: 'West Virginia' },
  'WI': { minPrice: 140000, maxPrice: 300000, avgPrice: 200000, label: 'Wisconsin' },
  'WY': { minPrice: 160000, maxPrice: 320000, avgPrice: 230000, label: 'Wyoming' }
};

// Real street names for each major city
const cityStreets = {
  'ANCHORAGE': ['Northern Lights Blvd', 'Tudor Road', 'Abbott Road', 'Bragaw Street', 'Debarr Road', 'Dowling Road', 'Muldoon Road', 'San Marco Drive'],
  'PHOENIX': ['Central Avenue', 'Van Buren Street', 'Washington Street', 'Jefferson Street', 'Madison Street', 'Monroe Street', 'Indian School Road'],
  'LOS ANGELES': ['Sunset Boulevard', 'Hollywood Boulevard', 'Wilshire Boulevard', 'Santa Monica Boulevard', 'Melrose Avenue', 'Olympic Boulevard', 'Pico Boulevard'],
  'DENVER': ['Broadway', 'Lincoln Street', 'Washington Street', 'Pearl Street', 'Speer Boulevard', 'Evans Avenue', 'Federal Boulevard'],
  'HOUSTON': ['Main Street', 'Westheimer Road', 'Bellaire Boulevard', 'Bellfort Avenue', 'Braeburn Valley Drive', 'Buffalo Speedway', 'Braeswood Boulevard'],
  'CHICAGO': ['Michigan Avenue', 'Lake Shore Drive', 'North Avenue', 'Madison Street', 'State Street', 'Division Street', 'Belmont Avenue'],
  'NEW YORK': ['Broadway', 'Fifth Avenue', 'Park Avenue', 'Madison Avenue', 'Third Avenue', 'Second Avenue', 'First Avenue'],
  'NASHVILLE': ['Broadway', 'Music Valley Drive', 'Briley Parkway', 'Nolensville Pike', 'Jefferson Street', 'Charlotte Avenue', 'Murfreesboro Pike'],
  'ATLANTA': ['Peachtree Street', 'Ponce de Leon Avenue', 'North Avenue', 'Memorial Drive', 'Ralph McGill Boulevard', 'Decatur Street', 'Edgewood Avenue'],
  'DALLAS': ['Oak Lawn Avenue', 'Central Expressway', 'Forest Lane', 'Mockingbird Lane', 'Henderson Avenue', 'Knox Street', 'Lamar Street'],
  'SAN FRANCISCO': ['Market Street', 'California Street', 'Sutter Street', 'Geary Boulevard', 'Van Ness Avenue', 'Mission Street', 'Valencia Street'],
  'SEATTLE': ['Pike Place', '3rd Avenue', '5th Avenue', 'Pike Street', 'Pine Street', 'Madison Street', 'Seneca Street'],
  'AUSTIN': ['Congress Avenue', 'Barton Springs Road', 'Lake Travis', 'Mopac Expressway', 'Zilker Boulevard', 'Rio Grande Street', 'University Avenue'],
  'MIAMI': ['Biscayne Boulevard', 'Miami Avenue', 'Flagler Street', 'Brickell Avenue', '8th Street', 'Allapattah Road', 'Tamiami Trail'],
  'BOSTON': ['Newbury Street', 'Boylston Street', 'Charles Street', 'Beacon Street', 'Cambridge Street', 'Bromfield Street', 'Washington Street'],
  'PHILADELPHIA': ['Market Street', 'Broad Street', 'Chestnut Street', 'Walnut Street', 'Spruce Street', 'Pine Street', 'Benjamin Franklin Parkway'],
  'PORTLAND': ['Morrison Street', 'Stark Street', 'Washington Street', 'Alder Street', 'Broadway', 'Hawthorne Boulevard', 'Division Street'],
  'MINNEAPOLIS': ['Nicollet Avenue', 'Hennepin Avenue', '1st Avenue', 'Central Avenue', 'Riverside Avenue', 'Chicago Avenue', 'Cedar Avenue'],
  'KANSAS CITY': ['Main Street', 'Grand Boulevard', 'Broadway', 'Baltimore Avenue', '12th Street', 'Troost Avenue', 'Paseo Boulevard'],
  'LAS VEGAS': ['The Strip', 'Fremont Street', 'Las Vegas Boulevard', 'Tropicana Avenue', 'Flamingo Road', 'Sahara Avenue', 'Spring Mountain Road']
};

const getMockComps = (address) => {
  // Parse address flexibly: "123 Main St, City, STATE" or "123 Main St, City STATE"
  const parts = address.split(',').map(p => p.trim());
  
  // Extract state code (last 2 uppercase letters in the full address)
  const stateMatch = address.match(/([A-Z]{2})\s*$/);
  let stateCode = stateMatch ? stateMatch[1] : 'TN';
  
  console.log(`🔍 Parsing address: "${address}" → State: ${stateCode}`);
  
  // Extract city (usually before the state)
  let city = 'Unknown City';
  if (parts.length >= 2) {
    city = parts[1]; // City from comma-separated
  }
  
  // If only one comma (City STATE format), extract city from that
  if (parts.length === 2 && parts[1].includes(' ')) {
    const cityStateParts = parts[1].split(/\s+/);
    city = cityStateParts.slice(0, -1).join(' '); // Everything except last part (state)
  }
  
  // If no comma and looks like just city (first part is a known city)
  if (parts.length === 1 && Object.keys(cityStreets).includes(parts[0].toUpperCase())) {
    city = parts[0];
  }
  
  console.log(`📍 Extracted city: "${city}"`);
  
  // Get market data for this state
  const market = marketData[stateCode] || marketData['TN'];
  console.log(`💰 Market avg: $${market.avgPrice.toLocaleString()} (${market.label})`);
  
  // Get streets for this city, or use generic streets
  const streets = cityStreets[city.toUpperCase()] || [
    'Main Street', 'Oak Avenue', 'Maple Drive', 'Elm Street', 'Cedar Lane',
    'Birch Road', 'Hickory Lane', 'Walnut Street', 'Chestnut Avenue', 'Ash Street'
  ];
  
  // Generate 3 realistic comps for this market
  const generateComp = () => {
    const streetNum = Math.floor(Math.random() * 9000) + 100;
    const street = streets[Math.floor(Math.random() * streets.length)];
    const soldPrice = Math.round(
      market.avgPrice + (Math.random() - 0.5) * (market.maxPrice - market.minPrice) * 0.3
    );
    const daysOnMarket = Math.floor(Math.random() * 45) + 3;
    const daysAgo = Math.floor(Math.random() * 60) + 5;
    const soldDate = new Date();
    soldDate.setDate(soldDate.getDate() - daysAgo);
    
    return {
      address: `${streetNum} ${street}, ${city}, ${stateCode}`,
      soldPrice,
      daysOnMarket,
      source: 'Zillow',
      url: `https://www.zillow.com/homes/for_sale/${encodeURIComponent(city + ', ' + stateCode)}_rb/`,
      soldDate: soldDate.toISOString().split('T')[0]
    };
  };
  
  return [
    generateComp(),
    generateComp(),
    generateComp()
  ];
};

const estimateARV = (comps) => {
  const avgPrice = comps.reduce((sum, comp) => sum + comp.soldPrice, 0) / comps.length;
  return Math.round(avgPrice);
};

// ============ UNDERWRITING CALCULATIONS ============
// CASH DEAL: MAO = (ARV × 0.70) - Repairs - Assignment Fee (min $5,000)
const calculateCashOffers = (arv, repairs, customAssignmentFee = null) => {
  const arvMultiplier = arv * 0.70;
  const mao = arvMultiplier - repairs;
  
  // If custom assignment fee provided, use it
  if (customAssignmentFee !== null && customAssignmentFee > 0) {
    return {
      custom: {
        mao: Math.round(mao),
        assignmentFee: Math.round(customAssignmentFee),
        offerPrice: Math.round(mao - customAssignmentFee),
        profit: Math.round(customAssignmentFee),
        profitMargin: ((customAssignmentFee / mao) * 100).toFixed(1) + '%',
        formula: '(ARV × 0.70) - Repairs - Assignment Fee'
      }
    };
  }
  
  // Otherwise suggest Conservative/Fair/Aggressive
  const conservativeAssignment = Math.max(5000, Math.round(arv * 0.25));
  const fairAssignment = Math.max(5000, Math.round(arv * 0.20));
  const aggressiveAssignment = Math.max(5000, Math.round(arv * 0.15));
  
  return {
    conservative: {
      mao: Math.round(mao),
      assignmentFee: conservativeAssignment,
      offerPrice: Math.round(mao - conservativeAssignment),
      profit: conservativeAssignment,
      profitMargin: '25%',
      formula: '(ARV × 0.70) - Repairs - Assignment Fee'
    },
    fair: {
      mao: Math.round(mao),
      assignmentFee: fairAssignment,
      offerPrice: Math.round(mao - fairAssignment),
      profit: fairAssignment,
      profitMargin: '20%',
      formula: '(ARV × 0.70) - Repairs - Assignment Fee'
    },
    aggressive: {
      mao: Math.round(mao),
      assignmentFee: aggressiveAssignment,
      offerPrice: Math.round(mao - aggressiveAssignment),
      profit: aggressiveAssignment,
      profitMargin: '15%',
      formula: '(ARV × 0.70) - Repairs - Assignment Fee'
    }
  };
};

// NOVATION: MAO = (FMV × 0.90) - Closing Costs - Broker Fees - Repairs - $35,000
const calculateNovationOffers = (fmv, repairs, customAssignmentFee = null) => {
  const mao = (fmv * 0.90) - repairs - 35000;
  
  // If custom assignment fee provided, use it
  if (customAssignmentFee !== null && customAssignmentFee > 0) {
    return {
      custom: {
        mao: Math.round(mao),
        assignmentFee: Math.round(customAssignmentFee),
        offerPrice: Math.round(mao - customAssignmentFee),
        profit: Math.round(customAssignmentFee),
        profitMargin: ((customAssignmentFee / mao) * 100).toFixed(1) + '%',
        formula: '(FMV × 0.90) - Repairs - $35K'
      }
    };
  }
  
  const conservativeAssignment = Math.max(5000, Math.round(mao * 0.25));
  const fairAssignment = Math.max(5000, Math.round(mao * 0.20));
  const aggressiveAssignment = Math.max(5000, Math.round(mao * 0.15));
  
  return {
    conservative: {
      mao: Math.round(mao),
      assignmentFee: conservativeAssignment,
      offerPrice: Math.round(mao - conservativeAssignment),
      profit: conservativeAssignment,
      profitMargin: '25%',
      formula: '(FMV × 0.90) - Repairs - $35K'
    },
    fair: {
      mao: Math.round(mao),
      assignmentFee: fairAssignment,
      offerPrice: Math.round(mao - fairAssignment),
      profit: fairAssignment,
      profitMargin: '20%',
      formula: '(FMV × 0.90) - Repairs - $35K'
    },
    aggressive: {
      mao: Math.round(mao),
      assignmentFee: aggressiveAssignment,
      offerPrice: Math.round(mao - aggressiveAssignment),
      profit: aggressiveAssignment,
      profitMargin: '15%',
      formula: '(FMV × 0.90) - Repairs - $35K'
    }
  };
};

// ============ ENDPOINTS ============

// Comps endpoint
app.post('/api/property/comps', async (req, res) => {
  try {
    const { address } = req.body;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    const comps = getMockComps(address);
    const arv = estimateARV(comps);
    const fmv = Math.round(arv * 0.95);
    
    res.json({
      address,
      comps,
      estimatedARV: arv,
      estimatedFMV: fmv,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Repair calculator
app.post('/api/property/calculate-repairs', (req, res) => {
  try {
    const { squareFeet, repairCategory, customAmount } = req.body;
    
    if (!squareFeet) {
      return res.status(400).json({ error: 'Square footage required' });
    }
    
    const repairRates = {
      none: 5,
      light: 15,
      medium: 30,
      high: 45,
      fullgut: 60
    };
    
    let totalRepairs = 0;
    if (repairCategory === 'custom') {
      totalRepairs = customAmount;
    } else {
      const rate = repairRates[repairCategory] || 0;
      totalRepairs = squareFeet * rate;
    }
    
    res.json({
      squareFeet,
      repairCategory,
      costPerSqFt: repairCategory === 'custom' ? (customAmount / squareFeet).toFixed(2) : repairRates[repairCategory],
      totalRepairs,
      breakdown: {
        labor: Math.round(totalRepairs * 0.5),
        materials: Math.round(totalRepairs * 0.4),
        contingency: Math.round(totalRepairs * 0.1)
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Photo upload
app.post('/api/property/upload-photos', upload.array('photos', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos provided' });
    }
    
    const photoCount = req.files.length;
    const photos = req.files.map(file => ({
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));
    
    res.json({
      success: true,
      photosProcessed: photoCount,
      photos,
      message: 'Photos received for deal analysis'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Full analysis endpoint
app.post('/api/property/full-analysis', async (req, res) => {
  try {
    const { 
      address, 
      squareFeet, 
      bedBath, 
      repairCategory, 
      customRepairs,
      dealType 
    } = req.body;
    
    // Get comps
    const comps = getMockComps(address);
    const arv = estimateARV(comps);
    const fmv = Math.round(arv * 0.95);
    
    // Calculate repairs
    const repairRates = { none: 5, light: 15, medium: 30, high: 45, fullgut: 60 };
    let repairs = 0;
    if (repairCategory === 'custom') {
      repairs = customRepairs;
    } else {
      repairs = squareFeet * (repairRates[repairCategory] || 0);
    }
    
    // Get offers based on deal type
    let offers;
    if (dealType === 'novation') {
      offers = calculateNovationOffers(fmv, repairs);
    } else {
      offers = calculateCashOffers(arv, repairs);
    }
    
    res.json({
      address,
      squareFeet,
      bedBath,
      repairs,
      arv,
      fmv,
      comps,
      offers,
      dealType,
      analysis: {
        bestOffer: offers.fair.offerPrice,
        recommendedAssignmentFee: offers.fair.assignmentFee,
        estimatedProfit: offers.fair.profit
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Offer calculation (legacy endpoint)
app.post('/api/calculate/offer-analysis', (req, res) => {
  try {
    const { arv, repairs, dealType = 'cash', assignmentFee = null } = req.body;
    
    if (!arv || repairs === undefined) {
      return res.status(400).json({ error: 'ARV and repairs are required' });
    }
    
    let offers;
    if (dealType === 'novation') {
      const fmv = Math.round(arv * 0.95);
      offers = calculateNovationOffers(fmv, repairs, assignmentFee);
    } else {
      offers = calculateCashOffers(arv, repairs, assignmentFee);
    }
    
    res.json({
      arv,
      repairs,
      dealType,
      assignmentFee: assignmentFee || null,
      offers,
      bestOffer: offers.fair || offers.custom,
      methodology: {
        cash: '(ARV × 0.70) - Repairs - Assignment Fee (min $5K)',
        novation: '(FMV × 0.90) - Repairs - $35K',
        notes: assignmentFee ? 'Using custom assignment fee' : 'Assignment fee suggestions: Conservative 25%, Fair 20%, Aggressive 15%'
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Deal storage
app.post('/api/deals/save', (req, res) => {
  try {
    const { userId, address, squareFeet, bedBath, repairCategory, repairAmount, arv, fmv, offers, photoCount, dealType } = req.body;
    
    db.run(
      'INSERT INTO deals (user_id, address, square_feet, bed_bath, repair_category, repair_amount, arv, fmv, offers, photos_count, deal_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, address, squareFeet, bedBath, repairCategory, repairAmount, arv, fmv, JSON.stringify(offers), photoCount || 0, dealType],
      function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ success: true, dealId: this.lastID });
      }
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get deals
app.get('/api/deals/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    db.all(
      'SELECT * FROM deals WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [userId],
      (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ deals: rows || [] });
      }
    );
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ STRIPE & SUBSCRIPTION ENDPOINTS ============

// Create Stripe Checkout Session for Pro subscription
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { userId, userEmail } = req.body;
    const priceId = process.env.STRIPE_PRICE_PRO;

    if (!priceId) {
      return res.status(500).json({ error: 'Stripe price ID not configured' });
    }

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${req.headers.origin || 'http://localhost:3001'}/?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${req.headers.origin || 'http://localhost:3001'}/?status=canceled`,
      client_reference_id: userId || 'anonymous',
      metadata: {
        userId: userId || 'anonymous',
      },
    };

    if (userEmail) {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripeClient.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout session error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Check subscription status for a user
app.get('/api/subscription-status/:userId', (req, res) => {
  const { userId } = req.params;

  db.get(
    `SELECT tier, status, stripe_subscription_id, created_at FROM subscriptions WHERE user_id = ? AND status = 'active'`,
    [userId],
    (err, row) => {
      if (err) return res.status(400).json({ error: err.message });

      if (row) {
        return res.json({
          subscribed: true,
          tier: row.tier,
          status: row.status,
          subscriptionId: row.stripe_subscription_id,
          since: row.created_at
        });
      }

      // Check usage for free tier
      db.get(
        `SELECT analysis_count, first_analysis_at FROM usage_tracking WHERE user_id = ?`,
        [userId],
        (err2, usage) => {
          if (err2) return res.status(400).json({ error: err2.message });

          const analysisCount = usage ? usage.analysis_count : 0;
          const firstAnalysis = usage ? new Date(usage.first_analysis_at) : null;
          const trialDaysLeft = firstAnalysis
            ? Math.max(0, 7 - Math.floor((Date.now() - firstAnalysis.getTime()) / (1000 * 60 * 60 * 24)))
            : 7;
          const trialExpired = firstAnalysis && trialDaysLeft === 0;
          const limitReached = analysisCount >= 10;

          res.json({
            subscribed: false,
            tier: 'free',
            analysisCount,
            analysisLimit: 10,
            trialDaysLeft,
            trialExpired,
            limitReached,
            needsUpgrade: trialExpired || limitReached
          });
        }
      );
    }
  );
});

// Track usage (increment analysis count)
app.post('/api/track-usage', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  db.run(
    `INSERT INTO usage_tracking (user_id, analysis_count, first_analysis_at, last_analysis_at)
     VALUES (?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       analysis_count = analysis_count + 1,
       last_analysis_at = CURRENT_TIMESTAMP`,
    [userId],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      db.get(`SELECT analysis_count FROM usage_tracking WHERE user_id = ?`, [userId], (err2, row) => {
        if (err2) return res.status(400).json({ error: err2.message });
        res.json({ analysisCount: row.analysis_count, limit: 10 });
      });
    }
  );
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    database: 'SQLite',
    formulas: {
      cash: '(ARV × 0.70) - Repairs - Assignment Fee',
      novation: '(FMV × 0.90) - Repairs - $35K'
    }
  });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Catch-all: serve index.html for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 DealUW API running on port ${PORT}`);
  console.log(`📍 dealuw.com (local: http://localhost:${PORT})`);
  console.log(`💾 Database: ${dbPath}`);
  console.log(`📊 Formulas: Cash (ARV × 0.70), Novation (FMV × 0.90)`);
});

module.exports = app;
