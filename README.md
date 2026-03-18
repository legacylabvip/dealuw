# DealUW (dealuw.com) — Wholesaler Underwriting Platform

**Instant property analysis for wholesalers with Discord bot integration.**

## 🚀 Features

- **Web Underwriting Tool** — Analyze properties in your browser
- **HOBO Discord Bot** — `/underwrite` commands right in Discord
- **Offer Strategies** — Cash, Novation, Subject-To analysis
- **Deal Database** — Save and track all analyses
- **Team Collaboration** — Share access with team members
- **Subscription Tiers** — Free trial, Pro ($99/mo), Elite ($199/mo)

## 📁 Project Structure

```
DealForge/
├── frontend/
│   └── index.html          # Web UI
├── backend/
│   ├── server.js           # Express API
│   ├── package.json        # Dependencies
│   └── .env.example        # Config template
├── discord-bot/
│   ├── hobo-bot.py         # Discord bot
│   └── requirements.txt    # Python deps
└── README.md               # This file
```

## 🔧 Setup

### 1. Backend API

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Stripe + Database credentials
npm start
```

API runs on `http://localhost:5000`

### 2. Discord Bot

```bash
cd discord-bot
pip install -r requirements.txt
cp ../.env.example .env
# Edit .env with your Discord token
python hobo-bot.py
```

### 3. Frontend

```bash
cd frontend
# Serve index.html via any HTTP server
python -m http.server 8000
```

Navigate to `http://localhost:8000`

## 🔌 API Endpoints

### Calculate Offers
```
POST /api/calculate/offer-analysis
{
  "arv": 300000,
  "repairs": 40000
}
```

### Save Deal
```
POST /api/deals/save
{
  "userId": 1,
  "address": "123 Main St",
  "arv": 300000,
  "repairs": 40000,
  "offers": { ... }
}
```

### Get User Deals
```
GET /api/deals/:userId
```

## 🤖 Discord Commands

- `/underwrite arv:300000 repairs:40000` — Quick analysis
- `/breakdown arv:300000 repairs:40000` — Full breakdown
- `/help` — Show all commands

## 💳 Stripe Setup

Create two price objects in Stripe dashboard:
- **Pro**: $99/month recurring
- **Elite**: $199/month recurring

Add to `.env`:
```
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_ELITE=price_yyy
```

## 🗄️ Database Setup

Create PostgreSQL database:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  password TEXT,
  name VARCHAR(255),
  created_at TIMESTAMP
);

CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  tier VARCHAR(50),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE deals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  address TEXT,
  arv INTEGER,
  repairs INTEGER,
  offers JSONB,
  created_at TIMESTAMP
);
```

## 📊 Underwriting Logic

**Cash Offer:**
```
MAO = (ARV × 68%) - Repairs - $20,000 assignment
```

**Novation:**
```
MAO = (FMV × 90%) - Closing costs - $35,000 assignment
```

## 🚀 Deployment

### Vercel (Frontend)
```bash
vercel --cwd frontend
```

### Heroku (Backend)
```bash
heroku create dealforge-api
git push heroku main
```

### Railway (Discord Bot)
```bash
railway up
```

## 📝 License

Built for House of Iverson. All rights reserved.

---

**Status:** MVP Ready | **Version:** 1.0.0 | **Last Updated:** March 5, 2026
