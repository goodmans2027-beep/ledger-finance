/**
 * data.js — Single Source of Truth
 * ---------------------------------
 * All read/write operations go through this file.
 * No other JS file touches localStorage directly.
 * When Phase 2 adds a backend, only this file changes.
 *
 * Exports:
 *   Data.load()          — load full DB from localStorage
 *   Data.save()          — persist full DB to localStorage
 *   Data.get(key)        — read a top-level section (e.g. 'mortgage')
 *   Data.set(key, val)   — write a top-level section and save
 *   Data.reset()         — restore to default schema
 *   Data.timestamp()     — update _lastSaved
 */

const DEFAULT_DATA = {
  _version: "1.0.0",
  _lastSaved: null,
  settings: { name: "", filingStatus: "single", state: "", theme: "dark" },
  carLoan: [
    {
      id: 'default',
      lender: '',
      vehicleName: 'Vehicle 1',
      originalBalance: 0,
      currentBalance: 0,
      interestRate: 0,
      termMonths: 0,
      startDate: null,
      monthlyPayment: 0
    }
  ],
  mortgage: [
    {
      id: 'default',
      lender: '',
      propertyAddress: '',
      homeValue: 0,
      originalBalance: 0,
      currentBalance: 0,
      interestRate: 0,
      termMonths: 360,
      startDate: null,
      monthlyEscrow: 0,
      monthlyPMI: 0,
      extraPayment: 0,
      appreciationRate: 0
    }
  ],
  budget: {
    incomeStreams: [],
    categories: [
      // Groups (parent categories with no amounts)
      { id: 'grp-food', name: 'Food', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-transport', name: 'Transportation', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-housing', name: 'Housing', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-utilities', name: 'Utilities', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-insurance', name: 'Insurance', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-health', name: 'Medical & Health', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-subscriptions', name: 'Subscriptions', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-entertainment', name: 'Entertainment', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-savings', name: 'Savings & Goals', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-debt', name: 'Debt Payments', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-personal', name: 'Personal & Other', amount: 0, frequency: 'monthly', parentId: null },
      { id: 'grp-giving', name: 'Giving', amount: 0, frequency: 'monthly', parentId: null },

      // Food items
      { id: 'cat-groceries', name: 'Groceries', amount: 0, frequency: 'monthly', parentId: 'grp-food' },
      { id: 'cat-restaurants', name: 'Restaurants & Dining', amount: 0, frequency: 'monthly', parentId: 'grp-food' },
      { id: 'cat-coffee', name: 'Coffee & Snacks', amount: 0, frequency: 'monthly', parentId: 'grp-food' },

      // Transportation items
      { id: 'cat-gas', name: 'Gas & Fuel', amount: 0, frequency: 'monthly', parentId: 'grp-transport' },
      { id: 'cat-public-transit', name: 'Public Transit', amount: 0, frequency: 'monthly', parentId: 'grp-transport' },
      { id: 'cat-parking', name: 'Parking & Tolls', amount: 0, frequency: 'monthly', parentId: 'grp-transport' },
      { id: 'cat-rideshare', name: 'Uber / Lyft', amount: 0, frequency: 'monthly', parentId: 'grp-transport' },
      { id: 'cat-car-maintenance', name: 'Car Maintenance', amount: 0, frequency: 'monthly', parentId: 'grp-transport' },

      // Housing items
      { id: 'cat-rent', name: 'Rent / Mortgage', amount: 0, frequency: 'monthly', parentId: 'grp-housing' },
      { id: 'cat-home-repairs', name: 'Home Repairs & Maintenance', amount: 0, frequency: 'monthly', parentId: 'grp-housing' },
      { id: 'cat-furniture', name: 'Furniture & Decor', amount: 0, frequency: 'monthly', parentId: 'grp-housing' },

      // Utilities items
      { id: 'cat-electric', name: 'Electricity', amount: 0, frequency: 'monthly', parentId: 'grp-utilities' },
      { id: 'cat-water', name: 'Water & Sewer', amount: 0, frequency: 'monthly', parentId: 'grp-utilities' },
      { id: 'cat-internet', name: 'Internet / Phone', amount: 0, frequency: 'monthly', parentId: 'grp-utilities' },
      { id: 'cat-gas', name: 'Gas (Heating)', amount: 0, frequency: 'monthly', parentId: 'grp-utilities' },

      // Insurance items
      { id: 'cat-health-insurance', name: 'Health Insurance', amount: 0, frequency: 'monthly', parentId: 'grp-insurance' },
      { id: 'cat-car-insurance', name: 'Car Insurance', amount: 0, frequency: 'monthly', parentId: 'grp-insurance' },
      { id: 'cat-home-insurance', name: 'Home Insurance', amount: 0, frequency: 'monthly', parentId: 'grp-insurance' },
      { id: 'cat-life-insurance', name: 'Life Insurance', amount: 0, frequency: 'monthly', parentId: 'grp-insurance' },

      // Health items
      { id: 'cat-medical', name: 'Medical & Doctor', amount: 0, frequency: 'monthly', parentId: 'grp-health' },
      { id: 'cat-pharmacy', name: 'Pharmacy & Medications', amount: 0, frequency: 'monthly', parentId: 'grp-health' },
      { id: 'cat-gym', name: 'Gym & Fitness', amount: 0, frequency: 'monthly', parentId: 'grp-health' },

      // Subscriptions items
      { id: 'cat-streaming', name: 'Streaming Services', amount: 0, frequency: 'monthly', parentId: 'grp-subscriptions' },
      { id: 'cat-software', name: 'Software & Apps', amount: 0, frequency: 'monthly', parentId: 'grp-subscriptions' },
      { id: 'cat-memberships', name: 'Memberships & Clubs', amount: 0, frequency: 'monthly', parentId: 'grp-subscriptions' },

      // Entertainment items
      { id: 'cat-movies', name: 'Movies & Events', amount: 0, frequency: 'monthly', parentId: 'grp-entertainment' },
      { id: 'cat-hobbies', name: 'Hobbies & Interests', amount: 0, frequency: 'monthly', parentId: 'grp-entertainment' },
      { id: 'cat-travel', name: 'Travel & Vacation', amount: 0, frequency: 'annual', parentId: 'grp-entertainment' },

      // Savings items
      { id: 'cat-emergency', name: 'Emergency Fund', amount: 0, frequency: 'monthly', parentId: 'grp-savings' },
      { id: 'cat-general-savings', name: 'General Savings', amount: 0, frequency: 'monthly', parentId: 'grp-savings' },
      { id: 'cat-investment', name: 'Investment Contributions', amount: 0, frequency: 'monthly', parentId: 'grp-savings' },

      // Debt items
      { id: 'cat-credit-card', name: 'Credit Card Payments', amount: 0, frequency: 'monthly', parentId: 'grp-debt' },
      { id: 'cat-student-loans', name: 'Student Loan Payments', amount: 0, frequency: 'monthly', parentId: 'grp-debt' },
      { id: 'cat-personal-loan', name: 'Personal Loan Payments', amount: 0, frequency: 'monthly', parentId: 'grp-debt' },

      // Personal & Other
      { id: 'cat-clothing', name: 'Clothing & Accessories', amount: 0, frequency: 'monthly', parentId: 'grp-personal' },
      { id: 'cat-haircut', name: 'Haircut & Personal Care', amount: 0, frequency: 'monthly', parentId: 'grp-personal' },
      { id: 'cat-gifts', name: 'Gifts & Celebrations', amount: 0, frequency: 'monthly', parentId: 'grp-personal' },
      { id: 'cat-other', name: 'Miscellaneous', amount: 0, frequency: 'monthly', parentId: 'grp-personal' },

      // Giving
      { id: 'cat-charity', name: 'Charitable Donations', amount: 0, frequency: 'monthly', parentId: 'grp-giving' },
      { id: 'cat-family-support', name: 'Family Support', amount: 0, frequency: 'monthly', parentId: 'grp-giving' }
    ],
    subscriptions: []
  },
  investments: {
    holdings: [],
    monthlyContribution: 0
  },
  tax: { filingYear: 2024, grossIncome: 0, filingStatus: "single", state: "", localTaxRate: 0, deductions: { type: "standard", amount: 0 }, additionalIncome: { capitalGains: 0, selfEmployment: 0, other: 0 } },
  networth: { snapshots: [] },
  debtPlanner: { method: "avalanche", extraPayment: 0, customDebts: [] },
  paycheck: { useTaxPage: true, paychecks: [] },
  calendar: { incomeSchedules: {}, billDays: {} }
};

const Data = (() => {
  const KEY = 'ledger_v1';
  let db = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      db = raw ? JSON.parse(raw) : structuredClone(DEFAULT_DATA);
    } catch {
      db = structuredClone(DEFAULT_DATA);
    }
    return db;
  }

  function save() {
    db._lastSaved = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(db));
  }

  function get(key) {
    if (!db) load();
    return db[key];
  }

  function set(key, val) {
    if (!db) load();
    db[key] = val;
    save();
  }

  function reset() {
    db = structuredClone(DEFAULT_DATA);
    save();
  }

  // Return a deep clone of the full database object.
  function dump() {
    if (!db) load();
    return structuredClone(db);
  }

  // Restore from a backup object.
  // Merges onto DEFAULT_DATA so keys added in newer app versions always
  // have their defaults even when loading an older backup.
  // Metadata fields (_version, _exportedAt) are never copied from the
  // backup — the live db always reflects the current app version.
  function restore(obj) {
    const SKIP = new Set(['_version', '_exportedAt', '_lastSaved']);
    db = structuredClone(DEFAULT_DATA);
    Object.keys(obj).forEach(key => {
      if (!SKIP.has(key)) db[key] = obj[key];
    });
    save(); // save() stamps _lastSaved with the current time
  }

  return { load, save, get, set, reset, dump, restore };
})();
