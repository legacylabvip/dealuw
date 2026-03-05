import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'dealuw.db');

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      beds INTEGER,
      baths REAL,
      sqft INTEGER,
      lot_sqft INTEGER,
      year_built INTEGER,
      property_type TEXT,
      condition TEXT,
      has_pool BOOLEAN DEFAULT 0,
      has_garage BOOLEAN DEFAULT 0,
      garage_count INTEGER DEFAULT 0,
      has_carport BOOLEAN DEFAULT 0,
      has_basement BOOLEAN DEFAULT 0,
      basement_sqft INTEGER DEFAULT 0,
      has_guest_house BOOLEAN DEFAULT 0,
      guest_house_sqft INTEGER DEFAULT 0,
      traffic_commercial TEXT DEFAULT 'none',
      asking_price REAL,
      arv_raw REAL,
      arv_adjusted REAL,
      repair_estimate REAL,
      mao REAL,
      assignment_fee REAL,
      recommendation TEXT,
      confidence TEXT,
      status TEXT DEFAULT 'analyzing',
      comps_data TEXT,
      repair_breakdown TEXT,
      adjustments_applied TEXT,
      ai_analysis TEXT,
      notes TEXT,
      created_by TEXT DEFAULT 'gradey',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
      address TEXT,
      sale_price REAL,
      sale_date TEXT,
      days_old INTEGER,
      sqft INTEGER,
      lot_sqft INTEGER,
      beds INTEGER,
      baths REAL,
      year_built INTEGER,
      property_type TEXT,
      distance_miles REAL,
      same_subdivision BOOLEAN,
      crosses_major_road BOOLEAN,
      price_per_sqft REAL,
      adjusted_price REAL,
      adjustments TEXT,
      selected BOOLEAN DEFAULT 1,
      disqualified BOOLEAN DEFAULT 0,
      disqualified_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export default getDb;
