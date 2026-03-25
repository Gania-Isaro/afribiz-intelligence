/* ============================================================
   AfriBiz Intelligence — Main Application
   Architecture: Plain JS modules, no frameworks, no build step
   Author: AfriBiz Intelligence
   ============================================================ */

'use strict';

/* ============================================================
   SECTION: CONFIGURATION
   All settings, constants, and lookup tables. Edit freely.
   ============================================================ */
const CONFIG = {
  // ── Core APIs (no key required) ───────────────────────────
  WORLD_BANK_BASE:     'https://api.worldbank.org/v2',
  REST_COUNTRIES_BASE: 'https://restcountries.com/v3.1',

  // ── GNews API — business headlines per country ────────────
  // Free: 100 req/day  Sign up: https://gnews.io
  // Paste your key here after signing up:
  GNEWS_API_KEY:  '',
  GNEWS_BASE:     'https://gnews.io/api/v4',

  // ── ExchangeRate-API — live currency conversion ───────────
  // Free: 1,500 req/month  Sign up: https://app.exchangerate-api.com
  // Paste your key here after signing up:
  EXCHANGE_RATE_KEY:  '',
  EXCHANGE_RATE_BASE: 'https://v6.exchangerate-api.com/v6',

  // ── App settings ──────────────────────────────────────────
  CACHE_DURATION_MS:  6 * 60 * 60 * 1000,
  NEWS_CACHE_MS:      30 * 60 * 1000,
  ITEMS_PER_PAGE:     16,
  REQUEST_TIMEOUT_MS: 15000,
  TICKER_INTERVAL_MS: 8000,
  TOAST_DURATION_MS:  5500,
  DATA_YEAR_START:    2015,
  DATA_YEAR_END:      2024,
  COMPARISON_MIN:     2,
  COMPARISON_MAX:     3,
  SEARCH_DEBOUNCE_MS: 350,
  NEWS_ARTICLE_COUNT: 3,
};

/* ============================================================
   INDICATOR DEFINITIONS
   Add or remove indicators here — they flow through automatically.
   Higher normalizedScore always = better business environment.
   Set `inverted: true` for indicators where lower raw = better.
   ============================================================ */
const INDICATORS = {
  easeBusiness: {
    code: 'IC.BUS.EASE.XQ',
    label: 'Ease of Doing Business',
    unit: 'score (0–100)',
    inverted: false,
    weight: 0.25,
    description: 'World Bank ease of doing business score',
  },
  daysToRegister: {
    code: 'IC.REG.DURS',
    label: 'Days to Start a Business',
    unit: 'days',
    inverted: true,
    weight: 0.20,
    description: 'Calendar days required to complete business registration',
  },
  costToRegister: {
    code: 'IC.REG.COST.PC.ZS',
    label: 'Cost to Start a Business',
    unit: '% GNI per capita',
    inverted: true,
    weight: 0.15,
    description: 'Official cost of registration as % of GNI per capita',
  },
  procedures: {
    code: 'IC.REG.PROC',
    label: 'Registration Procedures',
    unit: 'steps',
    inverted: true,
    weight: 0.00,
    description: 'Number of procedures required to register a business',
  },
  taxRate: {
    code: 'IC.TAX.TOTL.CP.ZS',
    label: 'Total Tax Rate',
    unit: '% of commercial profit',
    inverted: true,
    weight: 0.15,
    description: 'Total tax and contribution rate as % of commercial profit',
  },
  legalRights: {
    code: 'IC.LGL.CRED.XQ',
    label: 'Legal Rights Strength',
    unit: 'index (0–12)',
    inverted: false,
    weight: 0.10,
    description: 'Strength of legal rights index for borrowers and lenders',
  },
  electricityDays: {
    code: 'IC.ELC.TIME',
    label: 'Time to Get Electricity',
    unit: 'days',
    inverted: true,
    weight: 0.05,
    description: 'Days to obtain a permanent electricity connection',
  },
  corruption: {
    code: 'IC.FRM.CORR.ZS',
    label: 'Corruption Prevalence',
    unit: '% of firms',
    inverted: true,
    weight: 0.10,
    description: 'Percentage of firms experiencing corruption',
  },
  taxRevenue: {
    code: 'GC.TAX.TOTL.GD.ZS',
    label: 'Tax Revenue (GDP %)',
    unit: '% of GDP',
    inverted: false,
    weight: 0.00,
    description: 'Tax revenue as a percentage of GDP',
  },
  gdp: {
    code: 'NY.GDP.MKTP.CD',
    label: 'GDP (Current USD)',
    unit: 'USD',
    inverted: false,
    weight: 0.00,
    description: 'Gross domestic product in current US dollars',
  },
};

/* ============================================================
   AFRICAN COUNTRY CODES (ISO 3166-1 alpha-2)
   Add or remove codes here to adjust which countries appear.
   ============================================================ */
const AFRICAN_COUNTRY_CODES = [
  'DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD',
  'KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET',
  'GA','GM','GH','GN','GW','KE','LS','LR','LY','MG',
  'MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW',
  'ST','SN','SL','SO','ZA','SS','SD','TZ','TG','TN',
  'UG','ZM','ZW','MK',
];

/* ============================================================
   SECTION: STATE
   Single source of truth for all application state.
   Never scatter variables outside this object.
   ============================================================ */
const STATE = {
  countries: [],          // All country objects with fetched data
  filtered: [],           // Currently displayed (post-filter) list
  selected: [],           // Country codes selected for comparison
  currentPage: 1,
  currentView: 'dashboard', // 'dashboard' | 'profile' | 'comparison' | 'rankings'
  activeCountry: null,    // Country code for profile view
  filters: {
    region: 'all',
    sortBy: 'score',
    sortOrder: 'desc',
    search: '',
  },
  dataLoaded: false,
  lastUpdated: null,
  compareMode: false,
  trendChartInstance: null,
  radarChartInstance: null,
  sparklineInstances: {},
  tickerIndex: 0,
  tickerInsights: [],
  tableSort: { col: 'rank', order: 'asc' },
};

/* ============================================================
   SECTION: CACHE MODULE
   localStorage-based caching with expiry. Fails silently.
   ============================================================ */

/**
 * Saves data to localStorage with a timestamp.
 * Silently fails if storage is unavailable or full.
 * @param {string} key   - Storage key
 * @param {*}      data  - Any JSON-serialisable value
 */
function cacheData(key, data) {
  try {
    const payload = { timestamp: Date.now(), data };
    localStorage.setItem(`afribiz_${key}`, JSON.stringify(payload));
  } catch (_) {
    // localStorage unavailable or full — continue without cache
  }
}

/**
 * Retrieves data from localStorage. Returns null if missing or expired.
 * @param {string} key - Storage key
 * @returns {*|null}
 */
function getCachedData(key) {
  try {
    const raw = localStorage.getItem(`afribiz_${key}`);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload.timestamp !== 'number') return null;
    if (Date.now() - payload.timestamp > CONFIG.CACHE_DURATION_MS) {
      localStorage.removeItem(`afribiz_${key}`);
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * Returns true if a cached entry exists and is still fresh.
 * @param {string} key - Storage key
 * @returns {boolean}
 */
function isCacheValid(key) {
  return getCachedData(key) !== null;
}

/**
 * Returns the timestamp from a cached entry or null.
 * @param {string} key - Storage key
 * @returns {Date|null}
 */
function getCacheDate(key) {
  try {
    const raw = localStorage.getItem(`afribiz_${key}`);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload ? new Date(payload.timestamp) : null;
  } catch (_) {
    return null;
  }
}

/* ============================================================
   SECTION: UTILITY FUNCTIONS
   Small pure helpers with no side-effects.
   ============================================================ */

/**
 * Debounces a function call.
 * @param {Function} fn    - Function to debounce
 * @param {number}   wait  - Milliseconds to wait
 * @returns {Function}
 */
function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Sanitises a user-provided string for safe text display.
 * Strips dangerous characters — never passes to innerHTML.
 * @param {string} str - Raw input
 * @returns {string}
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>'"&]/g, '')
    .trim()
    .slice(0, 200);
}

/**
 * Formats a large number with magnitude suffix.
 * @param {number} n - Number to format
 * @returns {string}
 */
function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9)  return (n / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (n / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(1);
}

/**
 * Formats a duration value as "N day(s)".
 * @param {number} n - Number of days
 * @returns {string}
 */
function formatDays(n) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const rounded = Math.round(n);
  return rounded === 1 ? '1 day' : `${rounded} days`;
}

/**
 * Returns the accent CSS color string based on score value.
 * @param {number|null} score - 0–100
 * @returns {string} CSS variable string
 */
function getScoreColor(score) {
  if (score === null || score === undefined) return 'var(--text-3)';
  if (score >= 60) return 'var(--green)';
  if (score >= 40) return 'var(--amber)';
  return 'var(--red)';
}

/**
 * Returns a CSS class suffix based on score.
 * @param {number|null} score
 * @returns {'high'|'mid'|'low'|'na'}
 */
function getScoreBand(score) {
  if (score === null || score === undefined) return 'na';
  if (score >= 60) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

/**
 * Calculates trend direction from an array of numbers.
 * Compares first half mean to second half mean.
 * @param {number[]} values - Array of values newest-first
 * @returns {'up'|'down'|'stable'}
 */
function getTrendArrow(values) {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length < 2) return 'stable';
  const half = Math.floor(valid.length / 2);
  const recent = valid.slice(0, half);
  const older = valid.slice(half);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder = older.reduce((a, b) => a + b, 0) / older.length;
  const delta = avgRecent - avgOlder;
  if (delta > 2) return 'up';
  if (delta < -2) return 'down';
  return 'stable';
}

/**
 * Returns an emoji arrow for a trend direction.
 * @param {'up'|'down'|'stable'} trend
 * @returns {string}
 */
function trendEmoji(trend) {
  if (trend === 'up')   return '↑';
  if (trend === 'down') return '↓';
  return '→';
}

/**
 * Returns a color class for a trend direction.
 * @param {'up'|'down'|'stable'} trend
 * @returns {string}
 */
function trendClass(trend) {
  if (trend === 'up')   return 'style="color:var(--green)"';
  if (trend === 'down') return 'style="color:var(--red)"';
  return 'style="color:var(--text-3)"';
}

/**
 * Creates a DOM element with optional attributes and children.
 * Safe alternative to innerHTML.
 * @param {string} tag        - HTML tag name
 * @param {Object} [attrs={}] - Key-value attributes
 * @param {Array}  [children] - Child nodes or strings
 * @returns {HTMLElement}
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') node.appendChild(document.createTextNode(child));
    else if (child) node.appendChild(child);
  }
  return node;
}

/* ============================================================
   SECTION: TOAST NOTIFICATIONS
   ============================================================ */

/**
 * Shows a temporary toast notification.
 * @param {string} message  - Message to display
 * @param {'info'|'success'|'warning'|'error'} [type='info'] - Toast style
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = el('div', { className: `toast ${type}`, role: 'alert' });
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, CONFIG.TOAST_DURATION_MS);
}

/* ============================================================
   SECTION: LOADING SKELETONS
   ============================================================ */

/** Shows skeleton placeholder cards in the grid. */
function showLoadingSkeleton() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const SKELETON_COUNT = 8;
  for (let i = 0; i < SKELETON_COUNT; i++) {
    const cls = i < 2 ? 'card-skeleton featured' : 'card-skeleton';
    const skeleton = el('div', { className: cls, 'aria-hidden': 'true' });
    grid.appendChild(skeleton);
  }
}

/** Clears skeleton loaders (grid will be re-populated by renderCountryCards). */
function hideLoadingSkeleton() {
  const grid = document.getElementById('cardsGrid');
  if (grid) grid.innerHTML = '';
}

/* ============================================================
   SECTION: ERROR DISPLAY
   ============================================================ */

/**
 * Shows a full error card with message and suggestion.
 * @param {string} title      - Error heading
 * @param {string} suggestion - Actionable suggestion for the user
 */
function showError(title, suggestion) {
  const card = document.getElementById('errorCard');
  const titleEl = document.getElementById('errorTitle');
  const msgEl = document.getElementById('errorMessage');
  if (!card || !titleEl || !msgEl) return;
  titleEl.textContent = title;
  msgEl.textContent = suggestion;
  card.hidden = false;
  hideLoadingSkeleton();
}

/** Hides the error card. */
function hideError() {
  const card = document.getElementById('errorCard');
  if (card) card.hidden = true;
}

/* ============================================================
   SECTION: API MODULE
   All external data fetching. No business logic here.
   ============================================================ */

/**
 * Wraps fetch with a timeout, returning null on failure.
 * @param {string} url       - URL to fetch
 * @param {number} [timeoutMs] - Timeout in ms
 * @returns {Promise<Response|null>}
 */
async function fetchWithTimeout(url, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    return null;
  }
}

/**
 * Fetches country metadata for all African nations from REST Countries API.
 * Returns an array of simplified country objects.
 * @returns {Promise<Object[]>}
 */
async function fetchRestCountries() {
  const cacheKey = 'rest_countries_africa';
  const cached = getCachedData(cacheKey);
  if (cached) return cached.data;

  const url = `${CONFIG.REST_COUNTRIES_BASE}/region/africa`;
  const response = await fetchWithTimeout(url);

  if (!response || !response.ok) return [];

  try {
    const raw = await response.json();
    const simplified = raw.map(c => ({
      cca2: c.cca2,
      name: c.name?.common || c.name?.official || c.cca2,
      capital: c.capital ? c.capital[0] : 'N/A',
      population: c.population || null,
      currencies: c.currencies
        ? Object.values(c.currencies).map(cur => cur.symbol || cur.name).join(', ')
        : 'N/A',
      languages: c.languages ? Object.values(c.languages).slice(0, 2).join(', ') : 'N/A',
      flag: c.flag || '',
      region: c.subregion || c.region || 'Africa',
    }));
    cacheData(cacheKey, simplified);
    return simplified;
  } catch (_) {
    return [];
  }
}

/**
 * Fetches the most recent value for a single World Bank indicator for one country.
 * Returns { value, year } or null if unavailable.
 * @param {string} countryCode    - ISO alpha-2 country code
 * @param {string} indicatorCode  - World Bank indicator code
 * @returns {Promise<{value:number,year:string}|null>}
 */
async function fetchIndicatorData(countryCode, indicatorCode) {
  const url = `${CONFIG.WORLD_BANK_BASE}/country/${countryCode}/indicator/${indicatorCode}?format=json&mrv=1&per_page=1`;
  const response = await fetchWithTimeout(url);
  if (!response || !response.ok) return null;

  try {
    const json = await response.json();
    if (!Array.isArray(json) || json.length < 2) return null;
    const records = json[1];
    if (!records || !records.length) return null;
    const record = records.find(r => r.value !== null);
    if (!record) return null;
    return { value: parseFloat(record.value), year: record.date };
  } catch (_) {
    return null;
  }
}

/**
 * Fetches all key indicators for a single country in parallel.
 * Returns an object keyed by indicator name with { value, year } pairs.
 * @param {string} countryCode - ISO alpha-2 country code
 * @returns {Promise<Object>}
 */
async function fetchAllIndicators(countryCode) {
  const cacheKey = `indicators_${countryCode}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached.data;

  const promises = Object.entries(INDICATORS).map(async ([key, indicator]) => {
    const result = await fetchIndicatorData(countryCode, indicator.code);
    return [key, result];
  });

  const results = await Promise.allSettled(promises);
  const data = {};

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      const [key, val] = result.value;
      data[key] = val;
    }
  }

  cacheData(cacheKey, data);
  return data;
}

/**
 * Fetches historical ease-of-business score data for trend chart.
 * Returns an array of { year, value } sorted ascending, or [].
 * @param {string} countryCode - ISO alpha-2 country code
 * @returns {Promise<Array<{year:string, value:number}>>}
 */
async function fetchHistoricalData(countryCode) {
  const cacheKey = `history_${countryCode}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached.data;

  const url = `${CONFIG.WORLD_BANK_BASE}/country/${countryCode}/indicator/IC.BUS.EASE.XQ?format=json&date=${CONFIG.DATA_YEAR_START}:${CONFIG.DATA_YEAR_END}&per_page=20`;
  const response = await fetchWithTimeout(url);
  if (!response || !response.ok) return [];

  try {
    const json = await response.json();
    if (!Array.isArray(json) || json.length < 2 || !json[1]) return [];
    const records = json[1]
      .filter(r => r.value !== null)
      .map(r => ({ year: r.date, value: parseFloat(r.value) }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
    cacheData(cacheKey, records);
    return records;
  } catch (_) {
    return [];
  }
}

/* ============================================================
   SECTION: GNEWS API — Business headlines per country
   Free tier: 100 req/day — https://gnews.io
   Gracefully skipped when GNEWS_API_KEY is empty.
   ============================================================ */

/**
 * Fetches up to 3 recent news articles about business/economy
 * in a given country. Returns [] if no key set or request fails.
 * @param {string} countryName - Full country name e.g. "Rwanda"
 * @returns {Promise<Array<{title,description,url,source,publishedAt}>>}
 */
async function fetchCountryNews(countryName) {
  if (!CONFIG.GNEWS_API_KEY) return [];

  const cacheKey = `news_${countryName.replace(/\s+/g, '_').toLowerCase()}`;
  const cached   = getCachedData(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CONFIG.NEWS_CACHE_MS)) {
    return cached.data;
  }

  const query = encodeURIComponent(`${countryName} business economy`);
  const url   = `${CONFIG.GNEWS_BASE}/search?q=${query}&lang=en&country=any&max=${CONFIG.NEWS_ARTICLE_COUNT}&apikey=${CONFIG.GNEWS_API_KEY}`;

  const response = await fetchWithTimeout(url);
  if (!response || !response.ok) return [];

  try {
    const json = await response.json();
    if (!json.articles || !json.articles.length) return [];
    const articles = json.articles.map(a => ({
      title:       a.title       || '',
      description: a.description || '',
      url:         a.url         || '#',
      source:      a.source?.name || 'News',
      publishedAt: a.publishedAt  || '',
    }));
    cacheData(cacheKey, articles);
    return articles;
  } catch (_) {
    return [];
  }
}

/* ============================================================
   SECTION: EXCHANGERATE API — Live currency conversion
   Free tier: 1,500 req/month — https://app.exchangerate-api.com
   Gracefully skipped when EXCHANGE_RATE_KEY is empty.
   ============================================================ */

/**
 * Fetches live exchange rates for a given base currency (USD by default).
 * Returns a rates object or null if no key set or request fails.
 * @param {string} base - Base currency code e.g. "USD"
 * @returns {Promise<Object|null>} e.g. { EUR: 0.91, KES: 129.4, ... }
 */
async function fetchExchangeRates(base = 'USD') {
  if (!CONFIG.EXCHANGE_RATE_KEY) return null;

  const cacheKey = `fx_${base}`;
  const cached   = getCachedData(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CONFIG.NEWS_CACHE_MS)) {
    return cached.data;
  }

  const url = `${CONFIG.EXCHANGE_RATE_BASE}/${CONFIG.EXCHANGE_RATE_KEY}/latest/${base}`;
  const response = await fetchWithTimeout(url);
  if (!response || !response.ok) return null;

  try {
    const json = await response.json();
    if (json.result !== 'success' || !json.conversion_rates) return null;
    cacheData(cacheKey, json.conversion_rates);
    return json.conversion_rates;
  } catch (_) {
    return null;
  }
}

/**
 * Renders the live exchange rate for a country's primary currency
 * into a given container element. Shows nothing if no key is set.
 * @param {Object}      country   - Country data object
 * @param {HTMLElement} container - Element to inject the rate pill into
 */
async function renderExchangeRate(country, container) {
  if (!CONFIG.EXCHANGE_RATE_KEY || !container) return;

  // Extract currency code from stored string like "KSh, $" or "RWF"
  const rawCurrency = country.currencies || '';
  const rates = await fetchExchangeRates('USD');
  if (!rates) return;

  // Try to match a known 3-letter currency code
  // REST Countries stores symbols; we do a best-effort lookup via country code
  const COUNTRY_CURRENCY_MAP = {
    RW:'RWF', KE:'KES', TZ:'TZS', UG:'UGX', NG:'NGN', GH:'GHS',
    ZA:'ZAR', EG:'EGP', ET:'ETB', MA:'MAD', TN:'TND', SN:'XOF',
    CI:"XOF", CM:'XAF', MZ:'MZN', MG:'MGA', AO:'AOA', ZM:'ZMW',
    ZW:'ZWL', SD:'SDG', MU:'MUR', BW:'BWP', NA:'NAD', MR:'MRO',
    ML:'XOF', BJ:'XOF', TG:'XOF', NE:'XOF', BF:'XOF', GN:'GNF',
    SL:'SLL', LR:'LRD', GM:'GMD', GW:'XOF', CV:'CVE', ST:'STN',
    SS:'SSP', ER:'ERN', DJ:'DJF', SO:'SOS', KM:'KMF', SC:'SCR',
    BI:'BIF', RW:'RWF', MW:'MWK', LS:'LSL', SZ:'SZL', CD:'CDF',
    CG:'XAF', GA:'XAF', GQ:'XAF', CF:'XAF', TD:'XAF', LY:'LYD',
    DZ:'DZD', MR:'MRU', TN:'TND',
  };

  const code = COUNTRY_CURRENCY_MAP[country.code];
  if (!code || !rates[code]) return;

  const rate    = rates[code];
  const display = rate < 1 ? (1 / rate).toFixed(4) + ' USD = 1 ' + code
                            : '1 USD = ' + rate.toFixed(2) + ' ' + code;

  const pill = el('span', { className: 'fx-pill', textContent: '💱 ' + display });
  pill.title = 'Live exchange rate via ExchangeRate-API';
  container.appendChild(pill);
}

/**
 * Renders recent news headlines into a given container element.
 * Skipped entirely when GNEWS_API_KEY is empty.
 * @param {string}      countryName - Country name for search query
 * @param {HTMLElement} container   - Element to inject news into
 */
async function renderNewsSection(countryName, container) {
  if (!CONFIG.GNEWS_API_KEY || !container) return;

  const articles = await fetchCountryNews(countryName);
  if (!articles.length) return;

  const section = el('div', { className: 'profile-section news-section' });
  const title   = el('div', { className: 'profile-section-title', textContent: 'Recent Business News' });
  const list    = el('div', { className: 'news-list' });

  articles.forEach(article => {
    const item    = el('a', { className: 'news-item', href: article.url, target: '_blank', rel: 'noopener noreferrer' });
    const meta    = el('div', { className: 'news-meta' });
    const source  = el('span', { className: 'news-source', textContent: article.source });
    const date    = el('span', { className: 'news-date', textContent: article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : '' });
    meta.append(source, date);

    const headline = el('div', { className: 'news-headline', textContent: article.title });
    const desc     = el('div', { className: 'news-desc', textContent: article.description });

    item.append(meta, headline, desc);
    list.appendChild(item);
  });

  section.append(title, list);
  container.appendChild(section);
}

/* ============================================================
   SECTION: SCORE MODULE
   Normalises raw indicator values and calculates composite score.
   ============================================================ */

/**
 * Normalises a set of raw values to 0–100 range, respecting inversion.
 * @param {number[]} values   - Array of all raw values (for min/max calculation)
 * @param {number}   raw      - The single value to normalise
 * @param {boolean}  inverted - Whether lower raw = better
 * @returns {number} 0–100
 */
function normaliseValue(values, raw, inverted) {
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (!valid.length) return 50;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return 50;
  const normalised = ((raw - min) / (max - min)) * 100;
  return inverted ? 100 - normalised : normalised;
}

/**
 * Calculates a composite business environment score (0–100) for a country.
 * Returns null if insufficient indicator data is available.
 * @param {Object}   countryData          - Country data object
 * @param {Object[]} allCountriesData     - All countries' data for normalisation context
 * @returns {number|null}
 */
function calculateBusinessScore(countryData, allCountriesData) {
  const weightedIndicators = Object.entries(INDICATORS).filter(([, ind]) => ind.weight > 0);
  let totalWeight = 0;
  let weightedSum = 0;
  let validCount = 0;

  for (const [key, indicator] of weightedIndicators) {
    const datum = countryData.indicators[key];
    if (!datum || datum.value === null || isNaN(datum.value)) continue;

    // Collect all values for this indicator across all countries
    const allValues = allCountriesData
      .map(c => c.indicators[key] ? c.indicators[key].value : null)
      .filter(v => v !== null && !isNaN(v));

    const normalised = normaliseValue(allValues, datum.value, indicator.inverted);
    weightedSum += normalised * indicator.weight;
    totalWeight += indicator.weight;
    validCount++;
  }

  // Require at least 2 scored indicators to return a score
  if (validCount < 2 || totalWeight === 0) return null;

  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Assigns African and global ranking positions to all countries.
 * Modifies country objects in place; handles null scores gracefully.
 * @param {Object[]} countries - Array of country objects
 */
function rankCountries(countries) {
  const withScore = countries.filter(c => c.score !== null).sort((a, b) => b.score - a.score);
  const noScore   = countries.filter(c => c.score === null);

  withScore.forEach((c, i) => {
    c.africanRank = i + 1;
    // Rough global rank estimate based on African score distribution
    c.globalRank = Math.round(50 + (100 - c.score) * 1.2);
  });

  noScore.forEach(c => {
    c.africanRank = null;
    c.globalRank = null;
  });
}

/* ============================================================
   SECTION: FILTER MODULE
   Applies search, region, sort to STATE.countries → STATE.filtered
   ============================================================ */

/**
 * Applies all active filters and sorts to STATE.countries.
 * Writes result into STATE.filtered and resets to page 1.
 */
function applyFilters() {
  const { region, sortBy, sortOrder, search } = STATE.filters;
  const safeSearch = sanitizeInput(search).toLowerCase();

  let result = STATE.countries.filter(c => {
    // Region filter
    if (region !== 'all' && c.region !== region) return false;
    // Search filter
    if (safeSearch && !c.name.toLowerCase().includes(safeSearch)) return false;
    return true;
  });

  // Sort
  result.sort((a, b) => {
    let aVal, bVal;
    switch (sortBy) {
      case 'score':
        aVal = a.score ?? -1;
        bVal = b.score ?? -1;
        break;
      case 'days':
        aVal = a.indicators.daysToRegister?.value ?? Infinity;
        bVal = b.indicators.daysToRegister?.value ?? Infinity;
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      case 'cost':
        aVal = a.indicators.costToRegister?.value ?? Infinity;
        bVal = b.indicators.costToRegister?.value ?? Infinity;
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      case 'tax':
        aVal = a.indicators.taxRate?.value ?? Infinity;
        bVal = b.indicators.taxRate?.value ?? Infinity;
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      default:
        aVal = a.score ?? -1;
        bVal = b.score ?? -1;
    }
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
  });

  STATE.filtered = result;
  STATE.currentPage = 1;
}

/* ============================================================
   SECTION: INSIGHTS MODULE
   Generates data-driven insight strings from real fetched data.
   ============================================================ */

/**
 * Generates an array of dynamic, data-driven insight strings.
 * @param {Object[]} countries - Ranked country objects
 * @returns {string[]}
 */
function generateInsights(countries) {
  const insights = [];
  const withScore = countries.filter(c => c.score !== null);
  if (!withScore.length) return ['Loading Africa business data…'];

  const top = withScore[0];
  const fastest = countries
    .filter(c => c.indicators.daysToRegister?.value != null)
    .sort((a, b) => a.indicators.daysToRegister.value - b.indicators.daysToRegister.value)[0];
  const lowestTax = countries
    .filter(c => c.indicators.taxRate?.value != null)
    .sort((a, b) => a.indicators.taxRate.value - b.indicators.taxRate.value)[0];
  const highestScore = withScore[0];

  if (top) insights.push(`${top.name} ranks #1 in Africa for business environment`);

  if (fastest) {
    const days = Math.round(fastest.indicators.daysToRegister.value);
    insights.push(`${fastest.name} has the fastest business registration: ${days} ${days === 1 ? 'day' : 'days'}`);
  }

  if (lowestTax) {
    insights.push(`${lowestTax.name} has Africa's lowest total tax rate at ${lowestTax.indicators.taxRate.value.toFixed(1)}%`);
  }

  // Average days
  const avgDays = countries
    .filter(c => c.indicators.daysToRegister?.value != null)
    .map(c => c.indicators.daysToRegister.value);
  if (avgDays.length) {
    const avg = Math.round(avgDays.reduce((a, b) => a + b, 0) / avgDays.length);
    insights.push(`On average, it takes ${avg} days to register a business in Africa`);
  }

  // East Africa leader
  const eastAfrica = withScore.filter(c => c.region === 'Eastern Africa');
  if (eastAfrica.length) {
    insights.push(`${eastAfrica[0].name} leads East Africa in business environment score`);
  }

  // West Africa leader
  const westAfrica = withScore.filter(c => c.region === 'Western Africa');
  if (westAfrica.length) {
    insights.push(`${westAfrica[0].name} tops West Africa with a score of ${westAfrica[0].score}`);
  }

  // Southern Africa leader
  const southern = withScore.filter(c => c.region === 'Southern Africa');
  if (southern.length) {
    insights.push(`${southern[0].name} is Southern Africa's top-ranked business destination`);
  }

  if (highestScore) {
    insights.push(`The top score across Africa this period is ${highestScore.score} — held by ${highestScore.name}`);
  }

  return insights.length ? insights : ['Explore 54 African nations by business environment score'];
}

/* ============================================================
   SECTION: RENDER MODULE — Dashboard Cards
   ============================================================ */

/**
 * Renders all country cards for the current page.
 * Clears the grid first, then builds featured (top 3) and regular cards.
 */
function renderCountryCards() {
  const grid       = document.getElementById('cardsGrid');
  const emptyState = document.getElementById('emptyState');
  const emptyTerm  = document.getElementById('emptyTerm');
  const pagination = document.getElementById('pagination');

  if (!grid) return;

  // Always clear first, then reset states
  grid.innerHTML = '';
  if (emptyState) emptyState.hidden = true;
  if (pagination) pagination.hidden = true;

  if (!STATE.filtered || STATE.filtered.length === 0) {
    if (emptyState) {
      emptyState.hidden = false;
      if (emptyTerm) {
        const term = sanitizeInput(STATE.filters.search || '');
        emptyTerm.textContent = term ? `"${term}"` : 'Try adjusting your filters';
      }
    }
    return;
  }

  const { currentPage } = STATE;
  const start = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
  const end   = start + CONFIG.ITEMS_PER_PAGE;
  const page  = STATE.filtered.slice(start, end);

  page.forEach(country => {
    grid.appendChild(buildCountryCard(country));
  });

  renderPagination();
}

/**
 * Builds a larger featured card (used for top 3 ranked countries).
 * @param {Object} country - Country data object
 * @returns {HTMLElement}
 */
/**
 * Builds a single unified country card (all cards look the same).
 * Shows flag, name, score, registration days, tax rate, and a score bar.
 * @param {Object} country - Country data object
 * @returns {HTMLElement}
 */
function buildCountryCard(country) {
  const band   = getScoreBand(country.score);
  const inComp = STATE.selected.includes(country.code);
  const cls    = ['country-card', `score-${band}`, inComp ? 'in-comparison' : ''].filter(Boolean).join(' ');

  const card = el('div', {
    className: cls,
    role: 'article',
    'data-code': country.code,
    'aria-label': `${country.name} — business score ${country.score !== null ? country.score.toFixed(1) : 'N/A'}`,
  });

  // Inner padding wrapper
  const inner = el('div', { className: 'card-inner' });

  // ── Top row: flag + name + score badge ──
  const top   = el('div', { className: 'card-top' });
  const left  = el('div', { className: 'card-left' });
  const flag  = el('div', { className: 'card-flag',   textContent: country.flag || '🌍' });
  const info  = el('div');
  const name  = el('div', { className: 'card-name',   textContent: country.name });
  const region= el('div', { className: 'card-region', textContent: country.region || 'Africa' });
  info.append(name, region);
  left.append(flag, info);

  const score = el('div', {
    className: `card-score badge-${band}`,
    textContent: country.score !== null ? country.score.toFixed(1) : '—',
    title: 'Business environment score out of 100',
  });
  top.append(left, score);
  inner.appendChild(top);

  // ── Stats row: registration days + tax rate ──
  const stats = el('div', { className: 'card-stats' });

  const days = country.indicators.daysToRegister?.value;
  const tax  = country.indicators.taxRate?.value;

  const statDays = el('div', { className: 'card-stat' });
  statDays.appendChild(el('div', { className: 'card-stat-val', textContent: days != null ? formatDays(days) : '—' }));
  statDays.appendChild(el('div', { className: 'card-stat-lbl', textContent: 'To Register' }));

  const statTax = el('div', { className: 'card-stat' });
  statTax.appendChild(el('div', { className: 'card-stat-val', textContent: tax != null ? tax.toFixed(1) + '%' : '—' }));
  statTax.appendChild(el('div', { className: 'card-stat-lbl', textContent: 'Tax Rate' }));

  stats.append(statDays, statTax);
  inner.appendChild(stats);

  // ── Score progress bar ──
  if (country.score !== null) {
    const bar  = el('div', { className: 'card-bar' });
    const fill = el('div', { className: 'card-bar-fill' });
    fill.style.width      = `${country.score}%`;
    fill.style.background = getScoreColor(country.score);
    bar.appendChild(fill);
    inner.appendChild(bar);
  }

  card.appendChild(inner);

  // ── Footer: rank + explore button ──
  const footer  = el('div', { className: 'card-footer' });
  const rankEl  = el('div', {
    className: 'card-rank',
    textContent: country.africanRank ? `#${country.africanRank} in Africa` : 'Unranked',
  });

  const exploreBtn = el('button', { className: 'card-explore-btn' });
  exploreBtn.textContent = STATE.compareMode ? '＋ Compare' : 'Explore →';
  exploreBtn.classList.toggle('card-compare-btn', STATE.compareMode);
  if (inComp) exploreBtn.classList.add('added');

  footer.append(rankEl, exploreBtn);
  card.appendChild(footer);

  // ── Event listeners ──
  card.addEventListener('click', () => handleCardClick(country.code));
  exploreBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (STATE.compareMode) {
      addToComparison(country.code);
    } else {
      navigateToProfile(country.code);
    }
  });

  return card;
}

/* backwards-compat aliases so nothing else breaks */
function buildFeaturedCard(c) { return buildCountryCard(c); }
function buildRegularCard(c)  { return buildCountryCard(c); }

/**
 * Returns the single most notable strength label for a country.
 * @param {Object} country
 * @returns {string}
 */
function getTopStrength(country) {
  const i = country.indicators;
  if (i.daysToRegister?.value != null && i.daysToRegister.value <= 5) return '⚡ Fast Setup';
  if (i.taxRate?.value        != null && i.taxRate.value        <  25) return '💚 Low Tax';
  if (i.legalRights?.value    != null && i.legalRights.value    >= 9)  return '⚖️ Strong Rights';
  if (i.corruption?.value     != null && i.corruption.value     <  15) return '✅ Low Corruption';
  if (country.score !== null  && country.score >= 65) return '🏆 Top Performer';
  return '📊 Explore Data';
}

/* ============================================================
   RENDER MODULE — Stats Bar
   ============================================================ */

/**
 * Updates the four aggregate stats in the stats bar.
 * Reacts to currently filtered country set.
 */
function renderStatsBar() {
  const countries = STATE.filtered.length ? STATE.filtered : STATE.countries;

  // Average days
  const daysArr = countries
    .filter(c => c.indicators.daysToRegister?.value != null)
    .map(c => c.indicators.daysToRegister.value);
  const avgDaysEl = document.getElementById('statAvgDays');
  if (avgDaysEl) {
    const avg = daysArr.length
      ? Math.round(daysArr.reduce((a, b) => a + b, 0) / daysArr.length)
      : null;
    const span = el('span', { className: 'mono', textContent: avg !== null ? String(avg) : '—' });
    avgDaysEl.textContent = '';
    avgDaysEl.appendChild(span);
  }

  // Average score
  const scoresArr = countries
    .filter(c => c.score !== null)
    .map(c => c.score);
  const avgScoreEl = document.getElementById('statAvgScore');
  if (avgScoreEl) {
    const avg = scoresArr.length
      ? (scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length).toFixed(1)
      : null;
    const span = el('span', { className: 'mono', textContent: avg || '—' });
    avgScoreEl.textContent = '';
    avgScoreEl.appendChild(span);
  }

  // Fastest registration
  const fastestEl = document.getElementById('statFastest');
  if (fastestEl) {
    const fastest = countries
      .filter(c => c.indicators.daysToRegister?.value != null)
      .sort((a, b) => a.indicators.daysToRegister.value - b.indicators.daysToRegister.value)[0];
    fastestEl.textContent = fastest
      ? `${fastest.flag} ${fastest.name} (${Math.round(fastest.indicators.daysToRegister.value)}d)`
      : '—';
  }

  // Lowest tax
  const lowTaxEl = document.getElementById('statLowestTax');
  if (lowTaxEl) {
    const lowest = countries
      .filter(c => c.indicators.taxRate?.value != null)
      .sort((a, b) => a.indicators.taxRate.value - b.indicators.taxRate.value)[0];
    lowTaxEl.textContent = lowest
      ? `${lowest.flag} ${lowest.name} (${lowest.indicators.taxRate.value.toFixed(1)}%)`
      : '—';
  }
}

/* ============================================================
   RENDER MODULE — Mini Leaderboard
   ============================================================ */

/** Renders the top-5 countries in the sidebar leaderboard. */
function renderMiniLeaderboard() {
  const list = document.getElementById('miniLeaderboard');
  if (!list) return;

  list.innerHTML = '';
  const top5 = STATE.countries
    .filter(c => c.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!top5.length) return;

  const maxScore = top5[0].score;

  top5.forEach((country, i) => {
    const item = el('li', { className: 'leaderboard-item' });
    const rank = el('span', { className: 'lb-rank mono', textContent: String(i + 1) });
    const name = el('button', { className: 'lb-name' });
    name.textContent = `${country.flag} ${country.name}`;
    name.addEventListener('click', () => navigateToProfile(country.code));

    const barWrap = el('div', { className: 'lb-score-bar-wrap' });
    const bar = el('div', { className: 'lb-score-bar' });
    const fill = el('div', { className: 'lb-score-fill' });
    fill.style.width = `${(country.score / maxScore) * 100}%`;
    bar.appendChild(fill);
    const scoreVal = el('span', {
      className: 'lb-score-val mono',
      textContent: country.score.toFixed(0),
    });
    barWrap.append(bar, scoreVal);

    item.append(rank, name, barWrap);
    list.appendChild(item);
  });
}

/* ============================================================
   RENDER MODULE — Results Counter
   ============================================================ */

/** Updates the "N countries match" counter in the sidebar. */
function renderResultsCounter() {
  const counter = document.getElementById('resultsCounter');
  if (!counter) return;
  const count = el('strong', { textContent: String(STATE.filtered.length) });
  counter.textContent = '';
  counter.appendChild(count);
  counter.appendChild(document.createTextNode(' countries'));
}

/* ============================================================
   RENDER MODULE — Pagination
   ============================================================ */

/** Renders pagination buttons below the card grid. */
function renderPagination() {
  const nav = document.getElementById('pagination');
  if (!nav) return;

  const total = Math.ceil(STATE.filtered.length / CONFIG.ITEMS_PER_PAGE);

  if (total <= 1) {
    nav.hidden = true;
    return;
  }

  nav.hidden = false;
  nav.innerHTML = '';

  // Previous button
  const prev = el('button', {
    className: 'page-btn',
    textContent: '← Prev',
    'aria-label': 'Previous page',
  });
  if (STATE.currentPage === 1) prev.disabled = true;
  prev.addEventListener('click', () => {
    if (STATE.currentPage > 1) {
      STATE.currentPage--;
      renderCountryCards();
      renderStatsBar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  nav.appendChild(prev);

  // Page number buttons
  const range = getPaginationRange(STATE.currentPage, total);
  let lastPage = null;

  for (const page of range) {
    if (page === '…') {
      const ellipsis = el('span', { className: 'page-ellipsis', textContent: '…' });
      nav.appendChild(ellipsis);
    } else {
      if (lastPage && page - lastPage > 1 && !range.includes('…')) {
        const ellipsis = el('span', { className: 'page-ellipsis', textContent: '…' });
        nav.appendChild(ellipsis);
      }
      const btn = el('button', {
        className: `page-btn${page === STATE.currentPage ? ' active' : ''}`,
        textContent: String(page),
        'aria-label': `Page ${page}`,
      });
      btn.addEventListener('click', () => {
        STATE.currentPage = page;
        renderCountryCards();
        renderStatsBar();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      nav.appendChild(btn);
      lastPage = page;
    }
  }

  // Next button
  const next = el('button', {
    className: 'page-btn',
    textContent: 'Next →',
    'aria-label': 'Next page',
  });
  if (STATE.currentPage === total) next.disabled = true;
  next.addEventListener('click', () => {
    if (STATE.currentPage < total) {
      STATE.currentPage++;
      renderCountryCards();
      renderStatsBar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  nav.appendChild(next);
}

/**
 * Generates a sensible page number array for pagination.
 * @param {number} current - Current page
 * @param {number} total   - Total pages
 * @returns {Array<number|'…'>}
 */
function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = [1];
  if (current > 3) range.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    range.push(i);
  }
  if (current < total - 2) range.push('…');
  range.push(total);
  return range;
}

/* ============================================================
   RENDER MODULE — Dashboard (master render function)
   ============================================================ */

/**
 * Renders the complete dashboard view with all sub-sections.
 */
function renderDashboard() {
  applyFilters();
  renderStatsBar();
  renderCountryCards();
  renderResultsCounter();
  renderMiniLeaderboard();
}

/* ============================================================
   RENDER MODULE — Country Profile
   ============================================================ */

/**
 * Navigates to and renders the full country profile view.
 * @param {string} countryCode - ISO alpha-2 code
 */
async function navigateToProfile(countryCode) {
  const country = STATE.countries.find(c => c.code === countryCode);
  if (!country) {
    showToast('Country not found — returning to dashboard', 'warning');
    switchView('dashboard');
    return;
  }

  STATE.activeCountry = countryCode;
  switchView('profile');
  renderCountryProfile(country);

  // Fetch and render historical chart
  const history = await fetchHistoricalData(countryCode);
  const trendSection = document.getElementById('trendSection');
  if (history.length >= 2) {
    if (trendSection) trendSection.hidden = false;
    renderTrendChart(countryCode, history);
  } else {
    if (trendSection) trendSection.hidden = true;
  }
}

/**
 * Renders the static parts of a country profile (hero, indicators, etc.).
 * @param {Object} country - Country data object
 */
/**
 * Builds the static HTML scaffold for the country profile view
 * and injects it into #profileContent. All placeholder IDs used by
 * renderCountryProfile and its helpers are created here.
 */
function buildProfileShell() {
  const container = document.getElementById('profileContent');
  if (!container) return;
  container.innerHTML = '';

  // Hero section
  const hero = el('div', { className: 'prof-hero' });
  const heroBg = el('div', { id: 'profileHeroBg', className: 'prof-hero-bg' });
  const heroContent = el('div', { className: 'prof-hero-content' });
  const flagEl = el('div', { id: 'profileFlag', className: 'prof-flag' });
  const nameBlock = el('div', { className: 'prof-name-block' });
  const nameEl = el('h1', { id: 'profileCountryName', className: 'prof-country-name' });
  const metaEl = el('div', { id: 'profileMeta', className: 'prof-meta-strip' });
  const ranksEl = el('div', { id: 'profileRanks', className: 'prof-ranks' });
  nameBlock.append(nameEl, metaEl, ranksEl);

  // Score ring SVG
  const ringWrap = el('div', { className: 'score-ring-wrap' });
  const circumference = 2 * Math.PI * 52;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '120'); svg.setAttribute('height', '120');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.classList.add('score-ring-svg');
  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', '60'); track.setAttribute('cy', '60'); track.setAttribute('r', '52');
  track.classList.add('score-ring-track');
  const fill = document.createElementNS(svgNS, 'circle');
  fill.setAttribute('cx', '60'); fill.setAttribute('cy', '60'); fill.setAttribute('r', '52');
  fill.setAttribute('stroke-dasharray', String(circumference));
  fill.setAttribute('stroke-dashoffset', String(circumference));
  fill.id = 'ringFill';
  fill.classList.add('score-ring-fill');
  const scoreText = document.createElementNS(svgNS, 'text');
  scoreText.setAttribute('x', '60'); scoreText.setAttribute('y', '64');
  scoreText.setAttribute('text-anchor', 'middle');
  scoreText.classList.add('score-ring-text');
  scoreText.id = 'ringScore';
  scoreText.textContent = '—';
  svg.append(track, fill, scoreText);
  ringWrap.appendChild(svg);

  heroContent.append(flagEl, nameBlock, ringWrap);
  hero.append(heroBg, heroContent);
  container.appendChild(hero);

  // Indicator breakdown section
  const indSection = el('div', { className: 'profile-section' });
  const indTitle = el('h2', { className: 'profile-section-title', textContent: 'Business Environment Breakdown' });
  const indList = el('div', { id: 'indicatorsList', className: 'indicators-list' });
  indSection.append(indTitle, indList);
  container.appendChild(indSection);

  // Trend chart section (hidden until data loads)
  const trendSection = el('div', { id: 'trendSection', className: 'profile-section' });
  trendSection.hidden = true;
  const trendTitle = el('h2', { className: 'profile-section-title', textContent: 'Business Environment Score Over Time' });
  const trendWrap = el('div', { className: 'trend-chart-container' });
  const trendCanvas = el('canvas', { id: 'trendChart' });
  trendWrap.appendChild(trendCanvas);
  trendSection.append(trendTitle, trendWrap);
  container.appendChild(trendSection);

  // Business setup timeline section
  const tlSection = el('div', { className: 'profile-section' });
  const tlTitle = el('h2', { className: 'profile-section-title', textContent: 'Business Setup Timeline' });
  const tlWrap = el('div', { id: 'setupTimeline', className: 'timeline' });
  tlSection.append(tlTitle, tlWrap);
  container.appendChild(tlSection);

  // Strengths & Weaknesses section
  const pcSection = el('div', { className: 'profile-section' });
  const pcTitle = el('h2', { className: 'profile-section-title', textContent: 'Strengths & Weaknesses' });
  const pcGrid = el('div', { id: 'prosCons', className: 'pros-cons' });
  pcSection.append(pcTitle, pcGrid);
  container.appendChild(pcSection);

  // Similar countries section
  const simSection = el('div', { className: 'profile-section' });
  const simTitle = el('h2', { className: 'profile-section-title', textContent: 'You Might Also Consider' });
  const simGrid = el('div', { id: 'similarCountries', className: 'similar-grid' });
  simSection.append(simTitle, simGrid);
  container.appendChild(simSection);
}

function renderCountryProfile(country) {
  // Build the HTML scaffold with all required IDs first
  buildProfileShell();

  // Hero: flag background
  const heroBg = document.getElementById('profileHeroBg');
  if (heroBg) {
    heroBg.style.background = `linear-gradient(135deg, ${country.score !== null ? getScoreColor(country.score) + '33' : 'var(--surface)'}, var(--bg))`;
  }

  // Flag
  const flagEl = document.getElementById('profileFlag');
  if (flagEl) flagEl.textContent = country.flag || '';

  // Name
  const nameEl = document.getElementById('profileCountryName');
  if (nameEl) nameEl.textContent = country.name;

  // Meta strip
  const metaEl = document.getElementById('profileMeta');
  if (metaEl) {
    metaEl.innerHTML = '';
    const metaItems = [
      { label: 'Capital', val: country.capital || 'N/A' },
      { label: 'Population', val: country.population ? formatNumber(country.population) : 'N/A' },
      { label: 'Currency', val: country.currencies || 'N/A' },
      { label: 'Languages', val: country.languages || 'N/A' },
    ];
    for (const item of metaItems) {
      const wrap = el('div', { className: 'profile-meta-item' });
      const lbl  = el('span', { className: 'profile-meta-label', textContent: item.label });
      const val  = el('span', { className: 'profile-meta-val', textContent: item.val });
      wrap.append(lbl, val);
      metaEl.appendChild(wrap);
    }
  }

  // Score ring
  const ringFill = document.getElementById('ringFill');
  const ringScore = document.getElementById('ringScore');
  if (ringFill && ringScore) {
    const score = country.score;
    const circumference = 2 * Math.PI * 52;
    ringScore.textContent = score !== null ? score.toFixed(1) : 'N/A';
    if (score !== null) {
      const offset = circumference - (score / 100) * circumference;
      setTimeout(() => {
        ringFill.style.strokeDashoffset = String(offset);
        ringFill.style.stroke = getScoreColor(score);
      }, 50);
    } else {
      ringFill.style.strokeDashoffset = String(circumference);
    }
  }

  // Ranks
  const ranksEl = document.getElementById('profileRanks');
  if (ranksEl) {
    ranksEl.innerHTML = '';
    if (country.africanRank) {
      const r1 = el('div', { className: 'profile-rank-item' });
      r1.append(
        el('span', { className: 'rank-val', textContent: `#${country.africanRank}` }),
        el('span', { className: 'rank-label', textContent: 'in Africa' })
      );
      ranksEl.appendChild(r1);
    }
    if (country.globalRank) {
      const r2 = el('div', { className: 'profile-rank-item' });
      r2.append(
        el('span', { className: 'rank-val', textContent: `#${country.globalRank}` }),
        el('span', { className: 'rank-label', textContent: 'Globally (est.)' })
      );
      ranksEl.appendChild(r2);
    }
  }

  // Indicators breakdown
  renderIndicatorsList(country);

  // Business setup timeline
  renderSetupTimeline(country);

  // Pros & cons
  renderProsCons(country);

  // Similar countries
  renderSimilarCountries(country.code);
}

/**
 * Renders the 10-indicator breakdown rows for a country.
 * @param {Object} country - Country data object
 */
function renderIndicatorsList(country) {
  const list = document.getElementById('indicatorsList');
  if (!list) return;
  list.innerHTML = '';

  const indicatorEntries = Object.entries(INDICATORS);
  let shownCount = 0;

  for (const [key, indicator] of indicatorEntries) {
    const datum = country.indicators[key];
    const hasValue = datum && datum.value !== null && !isNaN(datum.value);

    // Skip rows with no data — only show what we have
    if (!hasValue) continue;

    shownCount++;

    const allValues = STATE.countries
      .map(c => c.indicators[key]?.value)
      .filter(v => v != null && !isNaN(v));

    let barPct = 50;
    let bandClass = 'ind-mid';

    if (allValues.length > 1) {
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      barPct = max === min ? 50 : ((datum.value - min) / (max - min)) * 100;
      if (indicator.inverted) barPct = 100 - barPct;
      bandClass = barPct >= 65 ? 'ind-high' : barPct >= 35 ? 'ind-mid' : 'ind-low';
    }

    const bandLabel = barPct >= 65 ? 'Top 25%' : barPct >= 35 ? 'Mid 50%' : 'Bot 25%';
    const bandCls   = barPct >= 65 ? 'band-high' : barPct >= 35 ? 'band-mid' : 'band-low';

    // Format the value with its unit
    let displayVal;
    if (key === 'gdp') {
      displayVal = '$' + formatNumber(datum.value);
    } else if (indicator.unit && indicator.unit.includes('%')) {
      displayVal = datum.value.toFixed(1) + '%';
    } else if (indicator.unit && indicator.unit.toLowerCase().includes('day')) {
      displayVal = formatDays(datum.value);
    } else {
      displayVal = datum.value.toFixed(1);
    }

    // Include data year if available
    const yearLabel = datum.year ? ` (${datum.year})` : '';

    const row = el('div', { className: 'indicator-row' });

    // Name + description
    const nameBlock = el('div', { className: 'indicator-name-block' });
    nameBlock.appendChild(el('div', { className: 'indicator-name', textContent: indicator.label }));
    if (indicator.description) {
      nameBlock.appendChild(el('div', { className: 'indicator-desc', textContent: indicator.description + yearLabel }));
    }

    // Value
    const valEl = el('div', { className: 'indicator-val mono', textContent: displayVal });

    // Bar
    const barWrap = el('div', { className: 'indicator-bar' });
    const barFill = el('div', { className: `indicator-bar-fill ${bandClass}` });
    barFill.style.width = `${Math.max(barPct, 3)}%`;
    barWrap.appendChild(barFill);

    // Band label (Top/Mid/Bot)
    const bandEl = el('div', { className: `indicator-band ${bandCls}`, textContent: bandLabel });

    // Trend arrow
    const trendEl = el('div', { className: 'indicator-trend' });
    const histScores = country.historicalScores || [];
    const trend = histScores.length >= 2 ? getTrendArrow(histScores) : 'stable';
    trendEl.textContent = trendEmoji(trend);
    trendEl.className = `indicator-trend ${trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-flat'}`;

    row.append(nameBlock, valEl, barWrap, bandEl, trendEl);
    list.appendChild(row);
  }

  // If no data at all, show a helpful message
  if (shownCount === 0) {
    const msg = el('p', { className: 'indicators-no-data' });
    msg.textContent = 'No indicator data available for this country in the World Bank database.';
    list.appendChild(msg);
  }
}

/**
 * Renders the horizontal business setup timeline.
 * @param {Object} country - Country data object
 */
function renderSetupTimeline(country) {
  const container = document.getElementById('setupTimeline');
  if (!container) return;
  container.innerHTML = '';

  const days = country.indicators.daysToRegister?.value;
  const costPct = country.indicators.costToRegister?.value;

  const STEPS = [
    { label: 'Name Search', daysShare: 0.08 },
    { label: 'Document Prep', daysShare: 0.15 },
    { label: 'Registration Filing', daysShare: 0.30 },
    { label: 'Tax Registration', daysShare: 0.22 },
    { label: 'Bank Account', daysShare: 0.15 },
    { label: 'Operating Permits', daysShare: 0.10 },
  ];

  let totalDays = 0;

  STEPS.forEach((step, i) => {
    const stepDays = days != null ? Math.max(1, Math.round(days * step.daysShare)) : null;
    if (stepDays) totalDays += stepDays;

    const stepEl = el('div', { className: 'timeline-step' });
    const node   = el('div', { className: 'timeline-node mono', textContent: String(i + 1) });
    const label  = el('div', { className: 'timeline-label', textContent: step.label });

    stepEl.append(node, label);

    if (stepDays !== null) {
      const pill = el('div', {
        className: 'timeline-days mono',
        textContent: formatDays(stepDays),
      });
      stepEl.appendChild(pill);
    }

    container.appendChild(stepEl);
  });

  // Total summary
  if (days != null) {
    const total = el('div', { className: 'timeline-total' });
    total.appendChild(document.createTextNode('Total: '));
    total.appendChild(el('strong', { textContent: formatDays(days) }));
    if (costPct != null) {
      total.appendChild(document.createTextNode(' · Cost: '));
      total.appendChild(el('strong', { textContent: costPct.toFixed(1) + '% of GNI per capita' }));
    }
    container.after(total);
  }
}

/**
 * Generates and renders dynamic strengths and weaknesses.
 * Minimum 8 conditions evaluated against real data thresholds.
 * @param {Object} country - Country data object
 */
function renderProsCons(country) {
  const container = document.getElementById('prosCons');
  if (!container) return;
  container.innerHTML = '';

  const items = generateProsCons(country);
  if (!items.length) {
    const msg = el('p', { textContent: 'Insufficient data to evaluate strengths and weaknesses.' });
    msg.style.color = 'var(--text-3)';
    msg.style.fontSize = '0.875rem';
    container.appendChild(msg);
    return;
  }

  for (const item of items) {
    const div = el('div', {
      className: `pros-cons-item ${item.positive ? 'positive' : 'negative'}`,
    });
    const emoji = el('span', { className: 'pc-emoji', textContent: item.emoji });
    const text  = el('span', { className: 'pc-text', textContent: item.text });
    div.append(emoji, text);
    container.appendChild(div);
  }
}

/**
 * Generates pros/cons from real indicator data against defined thresholds.
 * Returns array of { emoji, text, positive } objects.
 * @param {Object} country - Country data object
 * @returns {Array<{emoji:string, text:string, positive:boolean}>}
 */
function generateProsCons(country) {
  const ind = country.indicators;
  const items = [];

  const days    = ind.daysToRegister?.value;
  const tax     = ind.taxRate?.value;
  const legal   = ind.legalRights?.value;
  const corrupt = ind.corruption?.value;
  const gdpVal  = ind.gdp?.value;
  const score   = country.score;
  const elec    = ind.electricityDays?.value;
  const cost    = ind.costToRegister?.value;

  if (days != null && days <= 3)
    items.push({ emoji: '⚡', text: 'Near-instant business registration', positive: true });
  else if (days != null && days <= 10)
    items.push({ emoji: '✅', text: `Quick registration at ${Math.round(days)} days`, positive: true });
  else if (days != null && days > 30)
    items.push({ emoji: '🐌', text: `Slow registration process (${Math.round(days)} days)`, positive: false });

  if (tax != null && tax < 20)
    items.push({ emoji: '💚', text: `Business-friendly tax rate (${tax.toFixed(1)}%)`, positive: true });
  else if (tax != null && tax > 50)
    items.push({ emoji: '🔴', text: `Heavy tax burden (${tax.toFixed(1)}% of profit)`, positive: false });

  if (legal != null && legal >= 8)
    items.push({ emoji: '⚖️', text: 'Strong investor and creditor legal protections', positive: true });
  else if (legal != null && legal <= 3)
    items.push({ emoji: '📜', text: 'Weak legal rights framework for investors', positive: false });

  if (corrupt != null && corrupt < 10)
    items.push({ emoji: '✅', text: 'Low reported business corruption', positive: true });
  else if (corrupt != null && corrupt > 40)
    items.push({ emoji: '⚠️', text: `High corruption risk (${corrupt.toFixed(1)}% of firms)`, positive: false });
  else if (corrupt != null && corrupt > 25)
    items.push({ emoji: '🔶', text: 'Moderate corruption concerns reported', positive: false });

  if (gdpVal != null && gdpVal > 1e11)
    items.push({ emoji: '🌍', text: `Large economy: GDP $${formatNumber(gdpVal)}`, positive: true });
  else if (gdpVal != null && gdpVal < 5e9)
    items.push({ emoji: '📉', text: 'Small domestic market', positive: false });

  if (score != null && score >= 70)
    items.push({ emoji: '🏆', text: 'Top-tier overall business environment', positive: true });
  else if (score != null && score < 35)
    items.push({ emoji: '📉', text: 'Challenging overall business climate', positive: false });

  if (elec != null && elec < 30)
    items.push({ emoji: '💡', text: `Fast utility connections (${Math.round(elec)} days for electricity)`, positive: true });
  else if (elec != null && elec > 120)
    items.push({ emoji: '🔌', text: `Slow utility access (${Math.round(elec)} days for electricity)`, positive: false });

  if (cost != null && cost < 5)
    items.push({ emoji: '💰', text: `Very low registration cost (${cost.toFixed(1)}% of GNI)`, positive: true });
  else if (cost != null && cost > 50)
    items.push({ emoji: '💸', text: `High registration cost (${cost.toFixed(1)}% of GNI)`, positive: false });

  return items;
}

/**
 * Finds and renders 3 similar countries (close score, nearby region).
 * @param {string} countryCode - Reference country ISO code
 */
function renderSimilarCountries(countryCode) {
  const container = document.getElementById('similarCountries');
  if (!container) return;
  container.innerHTML = '';

  const similar = generateSimilarCountries(countryCode);
  if (!similar.length) {
    container.innerHTML = '<p style="color:var(--text-3);font-size:0.875rem">Not enough data to suggest similar countries.</p>';
    return;
  }

  for (const s of similar) {
    const card = el('div', { className: 'similar-card', 'data-code': s.code });
    const flag = el('span', { className: 'similar-flag', textContent: s.flag });
    const info = el('div');
    const name = el('div', { className: 'similar-name', textContent: s.name });
    const score = el('div', {
      className: 'similar-score mono',
      textContent: s.score !== null ? `Score: ${s.score}` : 'Score: N/A',
    });
    info.append(name, score);
    card.append(flag, info);
    card.addEventListener('click', () => navigateToProfile(s.code));
    container.appendChild(card);
  }
}

/**
 * Returns 3 similar countries based on score proximity and region.
 * @param {string} countryCode - Reference country ISO code
 * @returns {Object[]}
 */
function generateSimilarCountries(countryCode) {
  const ref = STATE.countries.find(c => c.code === countryCode);
  if (!ref) return [];

  return STATE.countries
    .filter(c => c.code !== countryCode && c.score !== null)
    .map(c => {
      const scoreDiff = ref.score !== null ? Math.abs(c.score - ref.score) : 100;
      const regionBonus = c.region === ref.region ? 0 : 15;
      return { ...c, similarity: scoreDiff + regionBonus };
    })
    .sort((a, b) => a.similarity - b.similarity)
    .slice(0, 3);
}

/* ============================================================
   SECTION: CHART MODULE
   All Chart.js chart instantiation. Destroys old instances first.
   ============================================================ */

/**
 * Renders the trend line chart for a country's historical ease-of-business score.
 * @param {string} countryCode - ISO code (used for title)
 * @param {Array<{year:string, value:number}>} data - Historical data
 */
function renderTrendChart(countryCode, data) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  if (STATE.trendChartInstance) {
    STATE.trendChartInstance.destroy();
    STATE.trendChartInstance = null;
  }

  const labels = data.map(d => d.year);
  const values = data.map(d => d.value);
  const bestYear = data.reduce((best, d) => d.value > best.value ? d : best, data[0]);
  const bestIdx = data.indexOf(bestYear);

  const chartColors = {
    line: '#00c896',
    dot: '#00c896',
    grid: '#1e2d42',
    label: '#718096',
    text: '#edf2f7',
  };

  const pointColors = values.map((_, i) => i === bestIdx ? '#e8a020' : chartColors.dot);
  const pointRadius = values.map((_, i) => i === bestIdx ? 6 : 3);

  STATE.trendChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ease of Business Score',
        data: values,
        borderColor: chartColors.line,
        backgroundColor: `${chartColors.line}18`,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#141d2e',
          borderColor: '#1e2d42',
          borderWidth: 1,
          titleColor: '#edf2f7',
          bodyColor: '#718096',
          callbacks: {
            label: ctx => ` Score: ${ctx.parsed.y.toFixed(1)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.label, font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.label, font: { family: 'JetBrains Mono', size: 10 } },
          min: Math.max(0, Math.floor(Math.min(...values) - 5)),
          max: Math.min(100, Math.ceil(Math.max(...values) + 5)),
        },
      },
    },
  });
}

/**
 * Renders a radar chart comparing selected countries across indicators.
 * @param {Object[]} countries - Country data objects to compare
 */
function renderRadarChart(countries) {
  const canvas = document.getElementById('radarChart');
  if (!canvas) return;

  if (STATE.radarChartInstance) {
    STATE.radarChartInstance.destroy();
    STATE.radarChartInstance = null;
  }

  const radarIndicators = [
    { key: 'easeBusiness',    label: 'Ease of Biz' },
    { key: 'daysToRegister',  label: 'Speed',        invert: true },
    { key: 'costToRegister',  label: 'Low Cost',     invert: true },
    { key: 'taxRate',         label: 'Low Tax',      invert: true },
    { key: 'legalRights',     label: 'Legal Rights' },
    { key: 'corruption',      label: 'Anti-Corrupt', invert: true },
  ];

  const CHART_COLORS = [
    { line: '#00c896', fill: 'rgba(0,200,150,0.18)' },
    { line: '#e8a020', fill: 'rgba(232,160,32,0.18)' },
    { line: '#e53e3e', fill: 'rgba(229,62,62,0.18)' },
  ];

  // Normalise radar values per indicator
  const datasets = countries.map((country, ci) => {
    const values = radarIndicators.map(({ key, invert }) => {
      const allVals = STATE.countries
        .map(c => c.indicators[key]?.value)
        .filter(v => v != null && !isNaN(v));
      const val = country.indicators[key]?.value;
      if (val == null || !allVals.length) return 0;
      const min = Math.min(...allVals);
      const max = Math.max(...allVals);
      let norm = max === min ? 50 : ((val - min) / (max - min)) * 100;
      if (invert) norm = 100 - norm;
      return Math.round(norm);
    });

    const color = CHART_COLORS[ci % CHART_COLORS.length];
    return {
      label: country.name,
      data: values,
      borderColor: color.line,
      backgroundColor: color.fill,
      pointBackgroundColor: color.line,
      borderWidth: 2,
    };
  });

  STATE.radarChartInstance = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: radarIndicators.map(i => i.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#8fa3be',
            font: { family: 'DM Sans', size: 12 },
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: '#141d2e',
          borderColor: '#1e2d42',
          borderWidth: 1,
          titleColor: '#edf2f7',
          bodyColor: '#718096',
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          max: 100,
          grid: { color: '#1e2d42' },
          pointLabels: { color: '#8fa3be', font: { family: 'DM Sans', size: 11 } },
          ticks: { display: false },
        },
      },
    },
  });
}

/* ============================================================
   RENDER MODULE — Comparison View
   ============================================================ */

/** Renders the full comparison view for selected countries. */
function renderComparisonView() {
  const container = document.getElementById('comparisonContent');
  if (!container) return;
  container.innerHTML = '';

  const countries = STATE.selected
    .map(code => STATE.countries.find(c => c.code === code))
    .filter(Boolean);

  if (countries.length < CONFIG.COMPARISON_MIN) {
    const msg = el('p');
    msg.textContent = 'Select at least 2 countries to compare.';
    msg.style.color = 'var(--text-3)';
    container.appendChild(msg);
    return;
  }

  // Determine winner badges per column
  const winnerMap = computeWinners(countries);

  // Column headers
  const cols = el('div', { className: 'comparison-cols' });
  cols.style.gridTemplateColumns = `repeat(${countries.length}, 1fr)`;

  countries.forEach((country, ci) => {
    const col = el('div', { className: 'comparison-col-header' });
    col.appendChild(el('div', { className: 'comparison-flag', textContent: country.flag }));
    col.appendChild(el('div', { className: 'comparison-country-name', textContent: country.name }));
    col.appendChild(el('div', {
      className: 'comparison-score-big mono',
      textContent: country.score !== null ? country.score.toFixed(1) : 'N/A',
    }));

    const badges = el('div', { className: 'comparison-badges' });
    (winnerMap[ci] || []).forEach(badge => {
      badges.appendChild(el('span', { className: 'winner-badge', textContent: badge }));
    });
    col.appendChild(badges);
    cols.appendChild(col);
  });

  container.appendChild(cols);

  // Radar chart
  const radarWrap = el('div', { className: 'radar-wrap' });
  radarWrap.appendChild(el('div', { className: 'radar-title', textContent: 'Business Dimensions Compared' }));
  const radarCanvas = el('canvas', { id: 'radarChart' });
  radarCanvas.style.height = '300px';
  radarWrap.appendChild(radarCanvas);
  container.appendChild(radarWrap);

  setTimeout(() => renderRadarChart(countries), 50);

  // Comparison table
  container.appendChild(buildComparisonTable(countries));
}

/**
 * Determines winner badges for each column in the comparison.
 * @param {Object[]} countries
 * @returns {Object} Map of column index → string[]
 */
function computeWinners(countries) {
  const categories = [
    { label: 'Best Score', extract: c => c.score, bestIsHigh: true },
    { label: 'Fastest Setup', extract: c => c.indicators.daysToRegister?.value, bestIsHigh: false },
    { label: 'Lowest Tax', extract: c => c.indicators.taxRate?.value, bestIsHigh: false },
    { label: 'Strong Rights', extract: c => c.indicators.legalRights?.value, bestIsHigh: true },
  ];

  const result = {};
  countries.forEach((_, i) => { result[i] = []; });

  for (const cat of categories) {
    const vals = countries.map(cat.extract);
    const validVals = vals.filter(v => v != null);
    if (!validVals.length) continue;
    const best = cat.bestIsHigh ? Math.max(...validVals) : Math.min(...validVals);
    const winnerIdx = vals.indexOf(best);
    if (winnerIdx >= 0) result[winnerIdx].push(cat.label);
  }

  return result;
}

/**
 * Builds the detailed comparison table element.
 * @param {Object[]} countries
 * @returns {HTMLElement}
 */
function buildComparisonTable(countries) {
  const indicators = Object.entries(INDICATORS).filter(([k]) =>
    ['easeBusiness','daysToRegister','costToRegister','taxRate','legalRights','corruption','electricityDays','gdp'].includes(k)
  );

  const table = el('table', { className: 'comparison-table' });
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', { textContent: 'Indicator' }));
  countries.forEach(c => headerRow.appendChild(el('th', { textContent: c.name })));
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = el('tbody');

  for (const [key, indicator] of indicators) {
    const row = el('tr');
    row.appendChild(el('td', { textContent: indicator.label }));

    const vals = countries.map(c => {
      const v = c.indicators[key]?.value;
      return v != null && !isNaN(v) ? v : null;
    });

    const validVals = vals.filter(v => v !== null);
    let bestVal = null;
    let worstVal = null;

    if (validVals.length > 1) {
      bestVal = indicator.inverted ? Math.min(...validVals) : Math.max(...validVals);
      worstVal = indicator.inverted ? Math.max(...validVals) : Math.min(...validVals);
    }

    vals.forEach(val => {
      let cls = 'mid-val';
      if (val !== null && bestVal !== null && val === bestVal) cls = 'best';
      else if (val !== null && worstVal !== null && val === worstVal) cls = 'worst';
      const td = el('td', { className: cls });
      if (val !== null) {
        td.textContent = key === 'gdp' ? '$' + formatNumber(val) : val.toFixed(1);
      } else {
        td.textContent = 'N/A';
        td.style.color = 'var(--text-3)';
      }
      row.appendChild(td);
    });

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  return table;
}

/* ============================================================
   RENDER MODULE — Rankings Table
   ============================================================ */

/**
 * Builds the static HTML scaffold for the rankings view (table + headers)
 * and injects it into #rankingsContent. Called once before populating rows.
 */
function buildRankingsShell() {
  const wrapper = document.getElementById('rankingsContent');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  const cols = [
    { key: 'rank',  label: 'Rank',          sortable: true },
    { key: 'flag',  label: '',               sortable: false },
    { key: 'name',  label: 'Country',        sortable: false },
    { key: 'score', label: 'Score',          sortable: true },
    { key: 'days',  label: 'Days',           sortable: true },
    { key: 'cost',  label: 'Cost %GNI',      sortable: true },
    { key: 'tax',   label: 'Tax Rate',       sortable: true },
    { key: 'legal', label: 'Legal Rights',   sortable: true },
    { key: 'gdp',   label: 'GDP',            sortable: true },
    { key: 'trend', label: 'Trend',          sortable: false },
  ];

  const table = el('table', { id: 'rankingsTable', className: 'rankings-table' });
  const thead = el('thead');
  const tr = el('tr');
  for (const col of cols) {
    const th = el('th');
    th.textContent = col.label;
    if (col.sortable) {
      th.classList.add('sortable');
      th.dataset.col = col.key;
    }
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = el('tbody', { id: 'rankingsBody' });
  table.appendChild(tbody);
  wrapper.appendChild(table);
}

/** Renders the full sortable rankings table with all 54 countries. */
function renderRankingsTable() {
  buildRankingsShell();
  const tbody = document.getElementById('rankingsBody');
  const table = document.getElementById('rankingsTable');
  if (!tbody || !table) return;

  const search = sanitizeInput(
    (document.getElementById('rankingsSearch')?.value || '').toLowerCase()
  );

  let rows = STATE.countries
    .filter(c => !search || c.name.toLowerCase().includes(search))
    .sort((a, b) => {
      const { col, order } = STATE.tableSort;
      const mult = order === 'asc' ? 1 : -1;
      const aVal = getTableSortValue(a, col);
      const bVal = getTableSortValue(b, col);
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return (aVal - bVal) * mult;
    });

  const total = rows.length;
  tbody.innerHTML = '';

  rows.forEach((country, i) => {
    const isTop = country.africanRank !== null && country.africanRank <= 10;
    const isBot = country.africanRank !== null && country.africanRank > (total - 10);
    const cls = isTop ? 'row-top' : isBot ? 'row-bottom' : '';

    const tr = el('tr', { className: cls });

    tr.appendChild(el('td', { className: 'td-rank mono', textContent: String(i + 1) }));
    tr.appendChild(el('td', { className: 'td-flag', textContent: country.flag || '' }));
    tr.appendChild(el('td', { className: 'td-name', textContent: country.name }));

    const scoreCell = el('td', { className: 'td-score mono' });
    scoreCell.textContent = country.score !== null ? country.score.toFixed(1) : 'N/A';
    scoreCell.style.color = getScoreColor(country.score);
    tr.appendChild(scoreCell);

    tr.appendChild(el('td', { className: 'mono', textContent: country.indicators.daysToRegister?.value != null ? Math.round(country.indicators.daysToRegister.value).toString() : 'N/A' }));
    tr.appendChild(el('td', { className: 'mono', textContent: country.indicators.costToRegister?.value != null ? country.indicators.costToRegister.value.toFixed(1) : 'N/A' }));
    tr.appendChild(el('td', { className: 'mono', textContent: country.indicators.taxRate?.value != null ? country.indicators.taxRate.value.toFixed(1) : 'N/A' }));
    tr.appendChild(el('td', { className: 'mono', textContent: country.indicators.legalRights?.value != null ? country.indicators.legalRights.value.toFixed(0) : 'N/A' }));
    tr.appendChild(el('td', { className: 'mono', textContent: country.indicators.gdp?.value != null ? '$' + formatNumber(country.indicators.gdp.value) : 'N/A' }));

    const trend = country.historicalScores?.length ? getTrendArrow(country.historicalScores.slice().reverse()) : 'stable';
    const trendCell = el('td', { className: 'td-trend', textContent: trendEmoji(trend) });
    if (trend === 'up')   trendCell.style.color = 'var(--green)';
    if (trend === 'down') trendCell.style.color = 'var(--red)';
    if (trend === 'stable') trendCell.style.color = 'var(--text-3)';
    tr.appendChild(trendCell);

    tbody.appendChild(tr);
  });

  updateTableSortHeaders();
}

/**
 * Returns the numeric value for a given sort column from a country object.
 * @param {Object} country - Country data object
 * @param {string} col     - Column key
 * @returns {number|null}
 */
function getTableSortValue(country, col) {
  switch (col) {
    case 'rank':  return country.africanRank ?? 9999;
    case 'name':  return null;
    case 'score': return country.score ?? -1;
    case 'days':  return country.indicators.daysToRegister?.value ?? 9999;
    case 'cost':  return country.indicators.costToRegister?.value ?? 9999;
    case 'tax':   return country.indicators.taxRate?.value ?? 9999;
    case 'legal': return country.indicators.legalRights?.value ?? -1;
    case 'gdp':   return country.indicators.gdp?.value ?? -1;
    default: return null;
  }
}

/** Updates sort arrow indicators on table headers. */
function updateTableSortHeaders() {
  const table = document.getElementById('rankingsTable');
  if (!table) return;
  table.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('sort-active');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.remove();
    if (th.dataset.col === STATE.tableSort.col) {
      th.classList.add('sort-active');
      const arrow = el('span', {
        className: 'sort-arrow',
        textContent: STATE.tableSort.order === 'asc' ? '↑' : '↓',
      });
      th.appendChild(arrow);
    }
  });
}

/* ============================================================
   SECTION: CSV EXPORT
   ============================================================ */

/**
 * Exports the current rankings data to a CSV file download.
 * Gracefully shows a toast if the download fails.
 */
function exportToCSV() {
  try {
    const headers = ['Rank','Country','Code','Score','Days to Register','Cost %','Tax Rate %','Legal Rights Index','GDP USD','Region'];
    const rows = STATE.countries
      .filter(c => c.africanRank !== null)
      .sort((a, b) => a.africanRank - b.africanRank)
      .map(c => [
        c.africanRank,
        c.name,
        c.code,
        c.score ?? '',
        c.indicators.daysToRegister?.value?.toFixed(0) ?? '',
        c.indicators.costToRegister?.value?.toFixed(2) ?? '',
        c.indicators.taxRate?.value?.toFixed(2) ?? '',
        c.indicators.legalRights?.value?.toFixed(0) ?? '',
        c.indicators.gdp?.value?.toFixed(0) ?? '',
        c.region || '',
      ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: 'afribiz-rankings.csv' });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Rankings exported as CSV', 'success');
  } catch (_) {
    showToast('Export failed. Try again.', 'error');
  }
}

/* ============================================================
   SECTION: COMPARE MODE
   ============================================================ */

/**
 * Handles clicking a country card in compare mode.
 * @param {string} countryCode - ISO alpha-2 code
 */
function handleCardClick(countryCode) {
  if (STATE.compareMode) {
    if (STATE.selected.includes(countryCode)) {
      removeFromComparison(countryCode);
    } else if (STATE.selected.length >= CONFIG.COMPARISON_MAX) {
      showToast(`Maximum ${CONFIG.COMPARISON_MAX} countries for comparison`, 'warning');
    } else {
      addToComparison(countryCode);
    }
  } else {
    navigateToProfile(countryCode);
  }
}

/**
 * Adds a country to the comparison selection.
 * @param {string} countryCode - ISO alpha-2 code
 */
function addToComparison(countryCode) {
  if (STATE.selected.includes(countryCode)) return;
  STATE.selected.push(countryCode);
  updateCompareUI();
  updateCardCompareHighlight(countryCode, true);
}

/**
 * Removes a country from the comparison selection.
 * @param {string} countryCode - ISO alpha-2 code
 */
function removeFromComparison(countryCode) {
  STATE.selected = STATE.selected.filter(c => c !== countryCode);
  updateCompareUI();
  updateCardCompareHighlight(countryCode, false);
}

/** Updates the sidebar comparison chips and button state. */
function updateCompareUI() {
  const chips = document.getElementById('compareChips');
  const btn = document.getElementById('compareBtn');
  if (!chips || !btn) return;

  chips.innerHTML = '';
  STATE.selected.forEach(code => {
    const country = STATE.countries.find(c => c.code === code);
    if (!country) return;
    const chip = el('div', { className: 'compare-chip' });
    chip.appendChild(document.createTextNode(`${country.flag} ${country.name}`));
    const remove = el('button', { className: 'chip-remove', 'aria-label': `Remove ${country.name}` });
    remove.textContent = '×';
    remove.addEventListener('click', () => removeFromComparison(code));
    chip.appendChild(remove);
    chips.appendChild(chip);
  });

  btn.disabled = STATE.selected.length < CONFIG.COMPARISON_MIN;
}

/**
 * Updates a card's visual highlight state in comparison mode.
 * @param {string}  countryCode - ISO alpha-2 code
 * @param {boolean} active      - Whether the card is selected
 */
function updateCardCompareHighlight(countryCode, active) {
  const card = document.querySelector(`[data-code="${countryCode}"]`);
  if (card) {
    card.classList.toggle('in-comparison', active);
  }
}

/* ============================================================
   SECTION: VIEW MANAGEMENT
   ============================================================ */

/**
 * Switches the visible main content view.
 * @param {'dashboard'|'profile'|'comparison'|'rankings'} view
 */
function switchView(view) {
  const views = {
    dashboard:  document.getElementById('viewDashboard'),
    profile:    document.getElementById('viewProfile'),
    comparison: document.getElementById('viewComparison'),
    rankings:   document.getElementById('viewRankings'),
  };

  Object.entries(views).forEach(([k, el]) => {
    if (el) el.hidden = k !== view;
  });

  STATE.currentView = view;
  window.scrollTo({ top: 0 });
}

/* ============================================================
   SECTION: INSIGHTS TICKER
   ============================================================ */

/**
 * Starts the auto-rotating insights ticker.
 * @param {string[]} insights - Array of insight strings
 */
function rotateInsights(insights) {
  const tickerText = document.getElementById('tickerText');
  if (!tickerText || !insights.length) return;

  STATE.tickerInsights = insights;
  STATE.tickerIndex = 0;

  const rotate = () => {
    const text = STATE.tickerInsights[STATE.tickerIndex % STATE.tickerInsights.length];
    tickerText.classList.remove('active');
    setTimeout(() => {
      tickerText.textContent = text;
      tickerText.classList.add('active');
    }, 300);
    STATE.tickerIndex++;
  };

  rotate();
  setInterval(rotate, CONFIG.TICKER_INTERVAL_MS);
}

/* ============================================================
   SECTION: STATUS INDICATOR
   ============================================================ */

/**
 * Updates the header status indicator dot and text.
 * @param {'loading'|'live'|'cached'|'error'|'offline'} status
 * @param {string} [text] - Optional label override
 */
function setStatus(status, text) {
  const dot  = document.getElementById('statusDot');
  const label = document.getElementById('statusText');
  if (!dot || !label) return;

  dot.className = 'status-dot';
  const statusMessages = {
    loading: 'Loading data…',
    live:    `Live data · Updated ${new Date().toLocaleDateString()}`,
    cached:  'Showing cached data',
    error:   'Data unavailable',
    offline: 'Offline mode',
  };

  if (['live', 'cached', 'error'].includes(status)) dot.classList.add(status);
  label.textContent = text || statusMessages[status] || '';
}

/* ============================================================
   SECTION: EVENT MODULE
   All event listeners registered in one place.
   ============================================================ */

/** Attaches all DOM event listeners. Uses event delegation where appropriate. */
function initEventListeners() {
  // Region filter
  document.getElementById('regionButtons')?.addEventListener('click', e => {
    const btn = e.target.closest('.region-btn');
    if (!btn) return;
    document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.filters.region = btn.dataset.region;
    STATE.currentPage = 1;
    renderDashboard();
  });

  // Sort by
  document.getElementById('sortButtons')?.addEventListener('click', e => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.filters.sortBy = btn.dataset.sort;
    renderDashboard();
  });

  // Sort order
  document.getElementById('sortOrderBtns')?.addEventListener('click', e => {
    const btn = e.target.closest('.order-btn');
    if (!btn) return;
    document.querySelectorAll('.order-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.filters.sortOrder = btn.dataset.order;
    renderDashboard();
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  const debouncedSearch = debounce(() => {
    STATE.filters.search = sanitizeInput(searchInput?.value || '');
    if (searchClear) searchClear.hidden = !STATE.filters.search;
    renderDashboard();
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  searchInput?.addEventListener('input', debouncedSearch);

  searchClear?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    STATE.filters.search = '';
    searchClear.hidden = true;
    renderDashboard();
  });

  // Reset filters (from empty state)
  document.getElementById('resetFilters')?.addEventListener('click', () => {
    resetAllFilters();
  });

  // Retry button
  document.getElementById('retryBtn')?.addEventListener('click', () => {
    location.reload();
  });

  // Compare toggle
  document.getElementById('compareToggle')?.addEventListener('change', e => {
    STATE.compareMode = e.target.checked;
    STATE.selected = [];
    updateCompareUI();
    document.querySelectorAll('.country-card').forEach(c => c.classList.remove('in-comparison'));
    const hint = document.getElementById('compareHint');
    if (hint) hint.textContent = STATE.compareMode ? 'Click cards to select' : 'Select 2–3 countries to compare';
  });

  // Compare now button
  document.getElementById('compareBtn')?.addEventListener('click', () => {
    if (STATE.selected.length >= CONFIG.COMPARISON_MIN) {
      switchView('comparison');
      renderComparisonView();
    }
  });

  // Back from profile
  document.getElementById('backFromProfile')?.addEventListener('click', () => {
    switchView('dashboard');
    // Destroy trend chart to avoid memory leak
    if (STATE.trendChartInstance) {
      STATE.trendChartInstance.destroy();
      STATE.trendChartInstance = null;
    }
  });

  // Back from comparison
  document.getElementById('backFromComparison')?.addEventListener('click', () => {
    switchView('dashboard');
    if (STATE.radarChartInstance) {
      STATE.radarChartInstance.destroy();
      STATE.radarChartInstance = null;
    }
  });

  // Reset comparison
  document.getElementById('resetComparison')?.addEventListener('click', () => {
    STATE.selected = [];
    updateCompareUI();
    if (STATE.radarChartInstance) {
      STATE.radarChartInstance.destroy();
      STATE.radarChartInstance = null;
    }
    switchView('dashboard');
    renderDashboard();
  });

  // Show rankings
  document.getElementById('showRankings')?.addEventListener('click', () => {
    switchView('rankings');
    renderRankingsTable();
  });

  // Back from rankings
  document.getElementById('backFromRankings')?.addEventListener('click', () => {
    switchView('dashboard');
  });

  // Rankings table sort
  document.getElementById('rankingsTable')?.addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const col = th.dataset.col;
    if (STATE.tableSort.col === col) {
      STATE.tableSort.order = STATE.tableSort.order === 'asc' ? 'desc' : 'asc';
    } else {
      STATE.tableSort.col = col;
      STATE.tableSort.order = 'asc';
    }
    renderRankingsTable();
  });

  // Rankings search
  const rankSearch = document.getElementById('rankingsSearch');
  const debouncedRankSearch = debounce(() => renderRankingsTable(), CONFIG.SEARCH_DEBOUNCE_MS);
  rankSearch?.addEventListener('input', debouncedRankSearch);

  // CSV export
  document.getElementById('exportCSV')?.addEventListener('click', exportToCSV);

  // Theme toggle
  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    const moon = document.getElementById('theme-icon-moon');
    const sun  = document.getElementById('theme-icon-sun');
    if (moon) moon.style.display = next === 'dark'  ? '' : 'none';
    if (sun)  sun.style.display  = next === 'light' ? '' : 'none';
  });

  // Logo → home
  document.getElementById('logoHome')?.addEventListener('click', e => {
    e.preventDefault();
    if (STATE.trendChartInstance) { STATE.trendChartInstance.destroy(); STATE.trendChartInstance = null; }
    if (STATE.radarChartInstance) { STATE.radarChartInstance.destroy(); STATE.radarChartInstance = null; }
    switchView('dashboard');
  });

  // Mobile sidebar toggle
  document.getElementById('mobileSidebarToggle')?.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('sidebar-open');
    if (isOpen) {
      sidebar.classList.remove('sidebar-open');
      document.querySelector('.sidebar-overlay')?.remove();
    } else {
      sidebar.classList.add('sidebar-open');
      const overlay = el('div', { className: 'sidebar-overlay' });
      overlay.addEventListener('click', () => {
        sidebar.classList.remove('sidebar-open');
        overlay.remove();
      });
      document.body.appendChild(overlay);
    }
  });

  // Online/offline detection
  window.addEventListener('online', () => {
    document.getElementById('offlineBanner').hidden = true;
    setStatus('live');
  });

  window.addEventListener('offline', () => {
    const offlineBanner = document.getElementById('offlineBanner');
    if (offlineBanner) {
      const cacheDate = getCacheDate('countries_all');
      const dateStr = cacheDate ? cacheDate.toLocaleDateString() : 'an earlier session';
      const dateEl = document.getElementById('offlineDate');
      if (dateEl) dateEl.textContent = dateStr;
      offlineBanner.hidden = false;
    }
    setStatus('offline');
    showToast('Offline mode — showing cached data', 'warning');
  });
}

/* ============================================================
   UTILITY — Reset all filters to defaults
   ============================================================ */

/** Resets all filters and search to their default state, re-renders dashboard. */
function resetAllFilters() {
  STATE.filters = { region: 'all', sortBy: 'score', sortOrder: 'desc', search: '' };
  STATE.currentPage = 1;

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  const searchClear = document.getElementById('searchClear');
  if (searchClear) searchClear.hidden = true;

  document.querySelectorAll('.region-btn').forEach(b => b.classList.toggle('active', b.dataset.region === 'all'));
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === 'score'));
  document.querySelectorAll('.order-btn').forEach(b => b.classList.toggle('active', b.dataset.order === 'desc'));

  renderDashboard();
}

/* ============================================================
   SECTION: INIT — Application Bootstrap
   ============================================================ */

/**
 * Main bootstrap function. Fetches data, builds state, renders UI.
 * Checks cache first, falls back to live fetch, handles all error scenarios.
 */
async function init() {
  setStatus('loading');
  showLoadingSkeleton();

  let countries = [];

  // Try cached data first
  const cachedCountries = getCachedData('countries_all');
  if (cachedCountries) {
    countries = cachedCountries.data;
    setStatus('cached');
  }

  if (!countries.length) {
    // Offline with no cache
    if (!navigator.onLine) {
      showError(
        'No cached data available',
        'Connect to the internet to load business data for Africa.'
      );
      setStatus('error');
      return;
    }

    // Fetch REST Countries metadata
    let restCountries = [];
    try {
      restCountries = await fetchRestCountries();
    } catch (_) {
      restCountries = [];
    }

    // Build initial country objects from our code list
    const countryMeta = {};
    for (const rc of restCountries) {
      if (rc.cca2) countryMeta[rc.cca2.toUpperCase()] = rc;
    }

    const initialCountries = AFRICAN_COUNTRY_CODES.map(code => {
      const meta = countryMeta[code] || {};
      return {
        code,
        name: meta.name || code,
        flag: meta.flag || '',
        capital: meta.capital || 'N/A',
        population: meta.population || null,
        currencies: meta.currencies || 'N/A',
        languages: meta.languages || 'N/A',
        region: meta.region || 'Africa',
        indicators: {},
        score: null,
        africanRank: null,
        globalRank: null,
        historicalScores: [],
      };
    });

    // Fetch indicators in batches of 8 to avoid hammering the API
    const BATCH_SIZE = 8;
    let fetchFailed = false;

    for (let i = 0; i < initialCountries.length; i += BATCH_SIZE) {
      const batch = initialCountries.slice(i, i + BATCH_SIZE);
      try {
        await Promise.allSettled(
          batch.map(async country => {
            const indicators = await fetchAllIndicators(country.code);
            country.indicators = indicators;
          })
        );
      } catch (_) {
        fetchFailed = true;
        break;
      }
    }

    if (fetchFailed && initialCountries.every(c => !Object.keys(c.indicators).length)) {
      showError(
        'Unable to load business data',
        'The World Bank API may be unavailable. Check your connection and retry.'
      );
      setStatus('error');
      return;
    }

    // Calculate scores with context of all countries
    initialCountries.forEach(country => {
      country.score = calculateBusinessScore(country, initialCountries);
    });

    rankCountries(initialCountries);
    countries = initialCountries;
    cacheData('countries_all', countries);
    setStatus('live');
  } else {
    // Recalculate scores from cache (they're stored, just re-rank to be safe)
    rankCountries(countries);
    setStatus('cached');
    showToast('Showing cached data. Data refreshes every 4 hours.', 'info');

    // Check if offline
    if (!navigator.onLine) {
      const offlineBanner = document.getElementById('offlineBanner');
      if (offlineBanner) {
        const cacheDate = getCacheDate('countries_all');
        const dateStr = cacheDate ? cacheDate.toLocaleDateString() : 'earlier';
        const dateEl = document.getElementById('offlineDate');
        if (dateEl) dateEl.textContent = dateStr;
        offlineBanner.hidden = false;
      }
      setStatus('offline');
    }
  }

  STATE.countries = countries;
  STATE.dataLoaded = true;

  // Apply default filter (show all, sort by score desc)
  applyFilters();

  // Render
  hideLoadingSkeleton();
  renderDashboard();

  // Start insights ticker
  const insights = generateInsights(STATE.countries);
  rotateInsights(insights);

  hideError();
}

/* ============================================================
   STARTUP — Run when DOM is ready
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  init().catch(err => {
    console.error('AfriBiz init error:', err);
    showError(
      'Application error',
      'Something went wrong loading AfriBiz Intelligence. Please refresh the page.'
    );
    setStatus('error');
  });
});
