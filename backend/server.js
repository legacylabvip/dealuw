const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const stripe = require('stripe');
const path = require('path');
const multer = require('multer');

dotenv.config();

const app = express();
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

// Supabase service role client for server-side operations
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qmgizjauopuxmyztlmza.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY || '';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';

// ============ RENTCAST PROPERTY DATA ============
const BRAVE_API_KEY = process.env.BRAVE_API_KEY || 'BSACZRerfoye440__Qh7zUx6F2PFN6q';

async function fetchRentCastProperty(address) {
  if (!RENTCAST_API_KEY) return null;
  try {
    const res = await fetch(`https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  } catch (err) {
    console.error('RentCast property fetch error:', err.message);
    return null;
  }
}

async function fetchPropertyViaBrave(address) {
  try {
    const query = `${address} property details beds baths sqft`;
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
      headers: { 'X-Subscription-Token': BRAVE_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = (data.web || {}).results || [];

    let beds = null, baths = null, sqft = null, yearBuilt = null, lastSalePrice = null, propertyType = null, formattedAddress = null;

    for (const r of results) {
      const text = ((r.description || '') + ' ' + (r.title || '')).toLowerCase();

      // Extract sqft
      if (!sqft) {
        const sqftMatch = text.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft|square\s*feet)/i);
        if (sqftMatch) sqft = parseInt(sqftMatch[1].replace(/,/g, ''));
      }

      // Extract beds
      if (!beds) {
        const bedMatch = text.match(/(\d+)\s*(?:bed|br|bedroom)/i);
        if (bedMatch) beds = parseInt(bedMatch[1]);
      }

      // Extract baths
      if (!baths) {
        const bathMatch = text.match(/([\d.]+)\s*(?:bath|ba|bathroom)/i);
        if (bathMatch) baths = parseFloat(bathMatch[1]);
      }

      // Extract year built
      if (!yearBuilt) {
        const yearMatch = text.match(/built\s*(?:in\s*)?(\d{4})/i);
        if (yearMatch) yearBuilt = parseInt(yearMatch[1]);
      }

      // Extract price
      if (!lastSalePrice) {
        const priceMatch = text.match(/\$\s*([\d,]+(?:\.\d+)?)\s*(?:k|m)?/i);
        if (priceMatch) {
          let price = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (price < 1000) price *= 1000;
          if (price > 10000) lastSalePrice = Math.round(price);
        }
      }

      // Extract property type
      if (!propertyType) {
        if (text.includes('single-family') || text.includes('single family')) propertyType = 'Single Family';
        else if (text.includes('condo')) propertyType = 'Condo';
        else if (text.includes('townhouse') || text.includes('townhome')) propertyType = 'Townhouse';
        else if (text.includes('multi-family') || text.includes('multifamily') || text.includes('duplex')) propertyType = 'Multi-Family';
      }

      // Get formatted address from Zillow/Trulia title
      if (!formattedAddress && (r.url || '').includes('zillow.com')) {
        const addrMatch = (r.title || '').match(/^(.+?)\s*\|/);
        if (addrMatch) formattedAddress = addrMatch[1].trim();
      }
    }

    if (!sqft && !beds && !baths) return null;

    return {
      address: formattedAddress || address,
      beds, baths, sqft, yearBuilt, lastSalePrice, propertyType,
      dataSource: 'Public Records (Brave Search)'
    };
  } catch (err) {
    console.error('Brave property fetch error:', err.message);
    return null;
  }
}

async function fetchRentCastComps(address) {
  if (!RENTCAST_API_KEY) return null;
  try {
    const res = await fetch(`https://api.rentcast.io/v1/avm/sale-comparables?address=${encodeURIComponent(address)}&limit=5`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('RentCast comps fetch error:', err.message);
    return null;
  }
}

async function fetchRentCastValue(address) {
  if (!RENTCAST_API_KEY) return null;
  try {
    const res = await fetch(`https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('RentCast value fetch error:', err.message);
    return null;
  }
}

async function getRealComps(address) {
  const compsData = await fetchRentCastComps(address);
  if (!compsData || !compsData.comparables || compsData.comparables.length === 0) return null;

  const comps = compsData.comparables.slice(0, 5).map(c => ({
    address: c.formattedAddress || c.addressLine1 || 'Unknown',
    soldPrice: c.price || c.lastSalePrice || 0,
    daysOnMarket: c.daysOnMarket || 0,
    source: 'RentCast / Public Records',
    url: '',
    soldDate: c.lastSaleDate || c.listedDate || '',
    beds: c.bedrooms,
    baths: c.bathrooms,
    sqft: c.squareFootage,
    distance: c.distance ? `${c.distance.toFixed(2)} mi` : ''
  }));

  const priceEstimate = compsData.priceEstimate || null;
  const priceLow = compsData.priceRangeLow || null;
  const priceHigh = compsData.priceRangeHigh || null;

  return { comps, priceEstimate, priceLow, priceHigh };
}

async function fetchRentCastRentEstimate(address, beds, baths, sqft) {
  if (!RENTCAST_API_KEY) return null;
  try {
    let url = `https://api.rentcast.io/v1/avm/rent/long-term?address=${encodeURIComponent(address)}`;
    if (beds) url += `&bedrooms=${beds}`;
    if (baths) url += `&bathrooms=${baths}`;
    if (sqft) url += `&squareFootage=${sqft}`;
    const res = await fetch(url, {
      headers: { 'X-Api-Key': RENTCAST_API_KEY, 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      rentEstimate: data.rent || data.rentEstimate || null,
      rentRangeLow: data.rentRangeLow || null,
      rentRangeHigh: data.rentRangeHigh || null
    };
  } catch (err) {
    console.error('RentCast rent estimate error:', err.message);
    return null;
  }
}

async function getPropertyDetails(address) {
  // Start with Brave for property details (free, fast, reliable)
  const braveData = await fetchPropertyViaBrave(address);

  // Then try RentCast for LTR rental estimate
  const beds = braveData?.beds || null;
  const baths = braveData?.baths || null;
  const sqft = braveData?.sqft || null;
  const rentData = await fetchRentCastRentEstimate(address, beds, baths, sqft);

  if (braveData) {
    return {
      ...braveData,
      rentEstimate: rentData?.rentEstimate || null,
      rentRangeLow: rentData?.rentRangeLow || null,
      rentRangeHigh: rentData?.rentRangeHigh || null,
      dataSource: rentData?.rentEstimate
        ? 'Public Records + RentCast Rent Estimate'
        : 'Public Records (Brave Search)'
    };
  }

  // If Brave fails, try RentCast for property data too
  const property = await fetchRentCastProperty(address);
  if (property) {
    return {
      address: property.formattedAddress,
      beds: property.bedrooms,
      baths: property.bathrooms,
      sqft: property.squareFootage,
      yearBuilt: property.yearBuilt,
      lotSize: property.lotSize,
      propertyType: property.propertyType,
      lastSalePrice: property.lastSalePrice,
      lastSaleDate: property.lastSaleDate,
      taxAssessment: property.taxAssessment,
      rentEstimate: rentData?.rentEstimate || null,
      rentRangeLow: rentData?.rentRangeLow || null,
      rentRangeHigh: rentData?.rentRangeHigh || null,
      dataSource: 'RentCast'
    };
  }

  return null;
}

// Helper to call Supabase REST API with service role
async function supabaseAdmin(tablePath, options = {}) {
  const { method = 'GET', body, headers: extraHeaders = {}, query = '' } = options;
  const url = `${SUPABASE_URL}/rest/v1/${tablePath}${query ? '?' + query : ''}`;
  const headers = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : (method === 'PATCH' ? 'return=representation' : ''),
    ...extraHeaders
  };
  const fetchOptions = { method, headers };
  if (body) fetchOptions.body = JSON.stringify(body);
  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase ${method} ${tablePath}: ${res.status} ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// File upload config
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

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
      event = JSON.parse(req.body.toString());
      console.log('Warning: No STRIPE_WEBHOOK_SECRET set — skipping signature verification');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (userId && subscriptionId) {
          // Update profile in Supabase
          await supabaseAdmin('profiles', {
            method: 'PATCH',
            query: `id=eq.${userId}`,
            body: {
              subscription_tier: 'pro',
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              analysis_limit: 500
            }
          });
          console.log(`Subscription activated for user ${userId}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;

        // Find profile by subscription ID and downgrade
        const profiles = await supabaseAdmin('profiles', {
          query: `stripe_subscription_id=eq.${subscriptionId}&select=id`
        });
        if (profiles && profiles.length > 0) {
          await supabaseAdmin('profiles', {
            method: 'PATCH',
            query: `stripe_subscription_id=eq.${subscriptionId}`,
            body: {
              subscription_tier: 'free',
              subscription_status: 'canceled',
              analysis_limit: 10
            }
          });
          console.log(`Subscription canceled: ${subscriptionId}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subscriptionId = subscription.id;
        const status = subscription.status;

        await supabaseAdmin('profiles', {
          method: 'PATCH',
          query: `stripe_subscription_id=eq.${subscriptionId}`,
          body: {
            subscription_status: status
          }
        });
        console.log(`Subscription ${subscriptionId} updated to ${status}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook processing error:', err.message);
  }

  res.json({ received: true });
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ COMPS DATA ============
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
  const parts = address.split(',').map(p => p.trim());
  const stateMatch = address.match(/([A-Z]{2})\s*$/);
  let stateCode = stateMatch ? stateMatch[1] : 'TN';

  let city = 'Unknown City';
  if (parts.length >= 2) {
    city = parts[1];
  }
  if (parts.length === 2 && parts[1].includes(' ')) {
    const cityStateParts = parts[1].split(/\s+/);
    city = cityStateParts.slice(0, -1).join(' ');
  }

  const market = marketData[stateCode] || marketData['TN'];
  const streets = cityStreets[city.toUpperCase()] || [
    'Main Street', 'Oak Avenue', 'Maple Drive', 'Elm Street', 'Cedar Lane',
    'Birch Road', 'Hickory Lane', 'Walnut Street', 'Chestnut Avenue', 'Ash Street'
  ];

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
      source: 'Public Records',
      url: '',
      soldDate: soldDate.toISOString().split('T')[0]
    };
  };

  return [generateComp(), generateComp(), generateComp()];
};

const estimateARV = (comps) => {
  const avgPrice = comps.reduce((sum, comp) => sum + comp.soldPrice, 0) / comps.length;
  return Math.round(avgPrice);
};

// ============ UNDERWRITING CALCULATIONS ============
const calculateCashOffers = (arv, repairs, customAssignmentFee = null) => {
  const arvMultiplier = arv * 0.70;
  const mao = arvMultiplier - repairs;

  if (customAssignmentFee !== null && customAssignmentFee > 0) {
    return {
      custom: {
        mao: Math.round(mao),
        assignmentFee: Math.round(customAssignmentFee),
        offerPrice: Math.round(mao - customAssignmentFee),
        profit: Math.round(customAssignmentFee),
        profitMargin: ((customAssignmentFee / mao) * 100).toFixed(1) + '%',
        formula: '(ARV x 0.70) - Repairs - Assignment Fee'
      }
    };
  }

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
      formula: '(ARV x 0.70) - Repairs - Assignment Fee'
    },
    fair: {
      mao: Math.round(mao),
      assignmentFee: fairAssignment,
      offerPrice: Math.round(mao - fairAssignment),
      profit: fairAssignment,
      profitMargin: '20%',
      formula: '(ARV x 0.70) - Repairs - Assignment Fee'
    },
    aggressive: {
      mao: Math.round(mao),
      assignmentFee: aggressiveAssignment,
      offerPrice: Math.round(mao - aggressiveAssignment),
      profit: aggressiveAssignment,
      profitMargin: '15%',
      formula: '(ARV x 0.70) - Repairs - Assignment Fee'
    }
  };
};

const calculateNovationOffers = (fmv, repairs, customAssignmentFee = null) => {
  const mao = (fmv * 0.90) - repairs - 35000;

  if (customAssignmentFee !== null && customAssignmentFee > 0) {
    return {
      custom: {
        mao: Math.round(mao),
        assignmentFee: Math.round(customAssignmentFee),
        offerPrice: Math.round(mao - customAssignmentFee),
        profit: Math.round(customAssignmentFee),
        profitMargin: ((customAssignmentFee / mao) * 100).toFixed(1) + '%',
        formula: '(FMV x 0.90) - Repairs - $35K'
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
      formula: '(FMV x 0.90) - Repairs - $35K'
    },
    fair: {
      mao: Math.round(mao),
      assignmentFee: fairAssignment,
      offerPrice: Math.round(mao - fairAssignment),
      profit: fairAssignment,
      profitMargin: '20%',
      formula: '(FMV x 0.90) - Repairs - $35K'
    },
    aggressive: {
      mao: Math.round(mao),
      assignmentFee: aggressiveAssignment,
      offerPrice: Math.round(mao - aggressiveAssignment),
      profit: aggressiveAssignment,
      profitMargin: '15%',
      formula: '(FMV x 0.90) - Repairs - $35K'
    }
  };
};

// ============ ENDPOINTS ============

// Comps endpoint
app.post('/api/property/comps', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address is required' });

    // Try real data first
    const realData = await getRealComps(address);
    if (realData && realData.comps.length > 0) {
      const arv = realData.priceEstimate || estimateARV(realData.comps);
      const fmv = Math.round(arv * 0.95);
      return res.json({
        address,
        comps: realData.comps,
        estimatedARV: arv,
        estimatedFMV: fmv,
        priceRangeLow: realData.priceLow,
        priceRangeHigh: realData.priceHigh,
        dataSource: 'RentCast / Public Records',
        timestamp: new Date().toISOString()
      });
    }

    // Fallback to mock data
    const comps = getMockComps(address);
    const arv = estimateARV(comps);
    const fmv = Math.round(arv * 0.95);

    res.json({
      address,
      comps,
      estimatedARV: arv,
      estimatedFMV: fmv,
      dataSource: 'Estimated (real data unavailable for this address)',
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
    if (!squareFeet) return res.status(400).json({ error: 'Square footage required' });

    const repairRates = { none: 5, light: 15, medium: 30, high: 45, fullgut: 60 };
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
    const photos = req.files.map(file => ({
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));
    res.json({
      success: true,
      photosProcessed: req.files.length,
      photos,
      message: 'Photos received for deal analysis'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Full analysis endpoint
// Google Places API key endpoint (public key safe for frontend)
app.get('/api/config/places-key', (req, res) => {
  res.json({ key: (GOOGLE_PLACES_API_KEY || '').trim() });
});

// Property details endpoint
app.post('/api/property/details', async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'Address is required' });

    const details = await getPropertyDetails(address);
    if (details) {
      return res.json({ ...details, dataSource: 'RentCast / Public Records' });
    }
    res.json({ address, dataSource: 'No data available — enter details manually' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/property/full-analysis', async (req, res) => {
  try {
    const { address, squareFeet, bedBath, repairCategory, customRepairs, dealType } = req.body;

    // Try real comps first
    let comps, arv, fmv, dataSource;
    const realData = await getRealComps(address);
    if (realData && realData.comps.length > 0) {
      comps = realData.comps;
      arv = realData.priceEstimate || estimateARV(comps);
      fmv = Math.round(arv * 0.95);
      dataSource = 'RentCast / Public Records';
    } else {
      comps = getMockComps(address);
      arv = estimateARV(comps);
      fmv = Math.round(arv * 0.95);
      dataSource = 'Estimated (real data unavailable)';
    }

    const repairRates = { none: 5, light: 15, medium: 30, high: 45, fullgut: 60 };
    let repairs = 0;
    if (repairCategory === 'custom') {
      repairs = customRepairs;
    } else {
      repairs = squareFeet * (repairRates[repairCategory] || 0);
    }

    let offers;
    if (dealType === 'novation') {
      offers = calculateNovationOffers(fmv, repairs);
    } else {
      offers = calculateCashOffers(arv, repairs);
    }

    res.json({
      address, squareFeet, bedBath, repairs, arv, fmv, comps, offers, dealType, dataSource,
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
    if (!arv || repairs === undefined) return res.status(400).json({ error: 'ARV and repairs are required' });

    let offers;
    if (dealType === 'novation') {
      const fmv = Math.round(arv * 0.95);
      offers = calculateNovationOffers(fmv, repairs, assignmentFee);
    } else {
      offers = calculateCashOffers(arv, repairs, assignmentFee);
    }

    res.json({
      arv, repairs, dealType,
      assignmentFee: assignmentFee || null,
      offers,
      bestOffer: offers.fair || offers.custom,
      methodology: {
        cash: '(ARV x 0.70) - Repairs - Assignment Fee (min $5K)',
        novation: '(FMV x 0.90) - Repairs - $35K',
        notes: assignmentFee ? 'Using custom assignment fee' : 'Assignment fee suggestions: Conservative 25%, Fair 20%, Aggressive 15%'
      }
    });
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

    if (!priceId) return res.status(500).json({ error: 'Stripe price ID not configured' });

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.headers.origin || 'https://www.dealuw.com'}/?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${req.headers.origin || 'https://www.dealuw.com'}/?status=canceled`,
      client_reference_id: userId || 'anonymous',
      metadata: { userId: userId || 'anonymous' },
    };

    if (userEmail) sessionParams.customer_email = userEmail;

    const session = await stripeClient.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Checkout session error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'Supabase Postgres',
    formulas: {
      cash: '(ARV x 0.70) - Repairs - Assignment Fee',
      novation: '(FMV x 0.90) - Repairs - $35K'
    }
  });
});

// ============================================================
// DISPO HELP NOTIFICATION
// ============================================================
app.post('/api/dispo-notify', async (req, res) => {
  try {
    const { dealId, address, arv, fairOffer, assignmentFee, dealType, repairs, userName, userEmail, userPhone, notes } = req.body;

    // Send email notification via SMTP (Gmail)
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.DISPO_EMAIL_USER || 'zoria@gradeyi.me',
        pass: process.env.DISPO_EMAIL_PASS || ''
      }
    });

    const emailBody = `
NEW DISPO REQUEST FROM DEALUW

Property: ${address}
Deal Type: ${dealType === 'novation' ? 'Novation' : 'Cash'}
ARV: $${Number(arv || 0).toLocaleString()}
Fair Offer: $${Number(fairOffer || 0).toLocaleString()}
Repairs: $${Number(repairs || 0).toLocaleString()}
Assignment Fee: $${Number(assignmentFee || 0).toLocaleString()}
JV Split: 50/50

CONTACT INFO:
Name: ${userName || 'Not provided'}
Email: ${userEmail}
Phone: ${userPhone || 'Not provided'}

Notes: ${notes || 'None'}

---
Action Required: Review deal and contact ${userName || userEmail} within 24 hours.
Deal ID: ${dealId}
    `.trim();

    await transporter.sendMail({
      from: '"DealUW Dispo Alerts" <zoria@gradeyi.me>',
      to: 'connect@gradeyi.me',
      subject: `[DISPO REQUEST] ${address} — $${Number(assignmentFee || 0).toLocaleString()} assignment fee`,
      text: emailBody
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Dispo notification error:', err);
    // Don't fail the request — the dispo was saved to DB already
    res.json({ success: false, message: 'Notification failed but request was saved' });
  }
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
  console.log(`DealUW API running on port ${PORT}`);
  console.log(`Database: Supabase Postgres`);
});

module.exports = app;
