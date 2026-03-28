# AfriBiz Intelligence

> **Where in Africa should you start your business?**
> A data-driven, interactive dashboard that compares 54 African nations across 10 business environment dimensions using live World Bank data — helping entrepreneurs, investors, students, and policymakers make informed decisions.

---

## Screenshot

*(Add a screenshot of the live app here after deployment)*

---

## Live URL

Access the application via the load balancer:
```
https://afribiz-intelligence.gania.tech
```

Direct server access:
```
http://52.70.87.10
http://3.93.218.74
```

---

## Features

- **Real-time World Bank data** — Fetches live indicators for all 54 African countries
- **10 business environment indicators** — Ease of doing business, registration speed, tax rates, legal rights, corruption levels, and more
- **Composite scoring algorithm** — Weighted 0–100 score calculated from real normalised indicator values
- **Interactive filtering** — Filter by region (North/West/East/Central/South), sort by score/speed/cost/tax, live search
- **Country profiles** — Deep-dive view with historical trend charts, setup timelines, strengths/weaknesses
- **Side-by-side comparison** — Compare 2–3 countries with radar charts and highlighted tables
- **Full rankings table** — All 54 nations sortable by any column, with CSV export
- **Smart caching** — 4-hour localStorage cache for instant repeat visits
- **Offline support** — Works offline with cached data, shows an offline banner
- **Responsive design** — Works on mobile, tablet, and desktop
- **Dark/light theme toggle** — User preference for light or dark mode
- **No framework, no build step** — Pure HTML, CSS, and vanilla JS

---

## APIs Used

### 1. World Bank Open Data API (Primary)
- **Base URL:** `https://api.worldbank.org/v2/`
- **Documentation:** https://datahelpdesk.worldbank.org/knowledgebase/articles/898581-api-basic-call-structures
- **Authentication:** None — fully public
- **Rate limits:** Fair use — no hard limits for low-frequency requests
- **Indicators used:**
  | Code | Description |
  |------|-------------|
  | `IC.BUS.EASE.XQ` | Ease of Doing Business Score |
  | `IC.REG.DURS` | Days to Start a Business |
  | `IC.REG.COST.PC.ZS` | Cost to Start a Business (% GNI) |
  | `IC.REG.PROC` | Registration Procedures (steps) |
  | `IC.TAX.TOTL.CP.ZS` | Total Tax Rate (% of commercial profit) |
  | `IC.LGL.CRED.XQ` | Strength of Legal Rights Index |
  | `IC.ELC.TIME` | Time to Get Electricity (days) |
  | `IC.FRM.CORR.ZS` | Firms Experiencing Corruption (%) |
  | `GC.TAX.TOTL.GD.ZS` | Tax Revenue (% of GDP) |
  | `NY.GDP.MKTP.CD` | GDP (Current USD) |

### 2. REST Countries API (Secondary)
- **Base URL:** `https://restcountries.com/v3.1/`
- **Documentation:** https://restcountries.com/
- **Authentication:** None — fully public
- **Used for:** Country flags (emoji), capital cities, population, currencies, languages

---

## Local Setup

No build step, no dependencies to install.

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/afribiz-intelligence.git
cd afribiz-intelligence

# 2. Open in your browser
# Option A — directly (works in most modern browsers)
open index.html

# Option B — with a simple local server (recommended to avoid CORS issues)
python3 -m http.server 8080
# Then visit: http://localhost:8080
```

That's it. No npm install, no webpack, no build process.

---

## Deployment Instructions

### Prerequisites
- Ubuntu 22.04 LTS servers (Web01, Web02, Lb01)
- SSH access with sudo privileges
- The project files from this repository

### Step 1 — Deploy to Web01 and Web02

Run these commands on **both** Web01 and Web02:

```bash
# Update packages and install Nginx
sudo apt update && sudo apt install nginx -y

# Create the web root directory
sudo mkdir -p /var/www/afribiz-intelligence

# Upload files from your local machine (run this locally, replace <SERVER_IP>)
scp -r ./* ubuntu@<SERVER_IP>:/tmp/afribiz-intelligence/

# On the server: copy files to web root
sudo cp -r /tmp/afribiz-intelligence/* /var/www/afribiz-intelligence/

# Set correct ownership and permissions
sudo chown -R www-data:www-data /var/www/afribiz-intelligence
sudo chmod -R 755 /var/www/afribiz-intelligence

# Install the Nginx site configuration
sudo cp /var/www/afribiz-intelligence/nginx/afribiz.conf /etc/nginx/sites-available/afribiz

# Enable the site and disable the default
sudo ln -s /etc/nginx/sites-available/afribiz /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test and restart Nginx
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl enable nginx

# Verify it's running
curl http://localhost/
```

### Step 2 — Get a Free SSL Certificate (on Lb01)

Run these commands on **Lb01** before configuring HAProxy:

```bash
# Install certbot
sudo apt update && sudo apt install certbot -y

# Get the certificate (standalone mode — temporarily uses port 80)
# Make sure port 80 is open and nothing is already listening on it
sudo certbot certonly --standalone \
  -d afribiz-intelligence.gania.tech \
  --non-interactive --agree-tos \
  -m g.kayumba@alustudent.com

# HAProxy needs the cert and key combined into a single .pem file
sudo mkdir -p /etc/haproxy/certs
sudo cat /etc/letsencrypt/live/afribiz-intelligence.gania.tech/fullchain.pem \
         /etc/letsencrypt/live/afribiz-intelligence.gania.tech/privkey.pem \
  | sudo tee /etc/haproxy/certs/afribiz.pem > /dev/null
sudo chmod 600 /etc/haproxy/certs/afribiz.pem

# Set up auto-renewal (runs twice daily, renews when <30 days left)
sudo crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet --deploy-hook 'cat /etc/letsencrypt/live/afribiz-intelligence.gania.tech/fullchain.pem /etc/letsencrypt/live/afribiz-intelligence.gania.tech/privkey.pem > /etc/haproxy/certs/afribiz.pem && systemctl reload haproxy'" | sudo crontab -
```

### Step 3 — Configure the HAProxy Load Balancer (Lb01)

Run these commands on **Lb01**:

```bash
# Install HAProxy
sudo apt update && sudo apt install haproxy -y

# Back up existing config
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.backup

# Add the frontend and backend blocks to the config
sudo tee -a /etc/haproxy/haproxy.cfg > /dev/null << 'EOF'

frontend afribiz_front
    bind *:80
    default_backend afribiz_servers

backend afribiz_servers
    balance roundrobin
    option httpchk GET /
    server web01 <WEB01_IP>:80 check
    server web02 <WEB02_IP>:80 check
EOF

# Replace <WEB01_IP> and <WEB02_IP> with your actual server IPs
sudo sed -i 's/<WEB01_IP>/YOUR_WEB01_IP/g' /etc/haproxy/haproxy.cfg
sudo sed -i 's/<WEB02_IP>/YOUR_WEB02_IP/g' /etc/haproxy/haproxy.cfg

# Validate and restart HAProxy
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl enable haproxy
```

### Step 3 — Verify Load Balancing

```bash
# Hit the load balancer 6 times and note which server responds
for i in {1..6}; do curl -s http://<LB01_IP>/ | head -5; echo "---"; done

# Check HAProxy stats — password protected, localhost only
# SSH tunnel first, then open in browser:
ssh -L 8404:127.0.0.1:8404 ubuntu@3.89.88.69
# Visit: http://127.0.0.1:8404/stats
# Credentials: admin / Afr1B1z$tat5!  (change this before deploying)
```

You should see traffic alternating between Web01 and Web02.

### Security Features in the Load Balancer

The HAProxy config includes the following hardening:

| Feature | Detail |
|---|---|
| **Rate limiting** | Blocks IPs exceeding 100 requests / 10 seconds (HTTP 429) |
| **Attack path blocking** | Denies `/wp-admin`, `/.env`, `/phpmyadmin`, `/xmlrpc.php`, etc. |
| **Host header validation** | Rejects requests with empty or duplicate Host headers |
| **Stats page auth** | Stats endpoint protected with password and bound to `127.0.0.1` only |
| **Server fingerprint removal** | `Server` and `X-Powered-By` headers stripped from all responses |
| **Security response headers** | `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy` injected at the LB |
| **CSP (Nginx)** | `Content-Security-Policy` header restricts scripts, styles, fonts, and API origins |
| **TLS config** | SSL ciphers and min TLS 1.2 pre-configured for when HTTPS is added |

---

## How Caching Works

The application uses `localStorage` to cache API responses for **4 hours**:

1. **First visit** — Fetches all data from World Bank and REST Countries APIs. Stores results in localStorage with a timestamp.
2. **Return visits (within 4 hours)** — Reads from cache instantly. No API calls made.
3. **After 4 hours** — Cache expires. Fresh data is fetched on next load.
4. **localStorage unavailable** — Silently skips caching. App fetches fresh data every time.
5. **localStorage full** — Skips cache write silently. App continues normally.
6. **Offline with valid cache** — App loads from cache and shows an "Offline mode" banner.
7. **Offline with no cache** — Shows a clear error card asking the user to connect.

Cache keys are namespaced with `afribiz_` to avoid collisions with other apps.

---

## Error Handling Strategy

| Scenario | Behaviour |
|---|---|
| API timeout (>12 seconds) | Toast: "Taking longer than usual. Loading cached data." |
| API 4xx / 5xx error | Toast: "Data unavailable. Showing last saved data." |
| No cache + API fails | Error card: "Unable to load data. Check connection and refresh." |
| Country has no indicator data | Shows "N/A" in monospace with tooltip "Data not reported" |
| localStorage full | Skips cache silently — app works normally |
| localStorage unavailable | Skips all cache operations — fetches fresh each time |
| Chart.js render fails | Data table shown as fallback |
| User offline on first load | Error card with offline icon |
| User offline after cache | Banner: "Offline mode — showing data from [date]" |
| Search returns 0 results | Empty state with "No countries match '[term]'" |
| Comparison with <2 countries | "Compare Now" button disabled |
| CSV export fails | Toast: "Export failed. Try again." |
| Invalid country code | Redirects to dashboard silently |
| Duplicate country in comparison | Prevented — shows warning toast |

---

## Challenges Faced

### 1. World Bank API Data Gaps
**Problem:** Many African countries have missing or outdated indicator data. A naive approach would give incorrect scores.
**Solution:** The scoring algorithm requires at least 2 valid indicators to return a score. Countries with insufficient data show "N/A" rather than a misleading 0 or estimate. The `calculateBusinessScore` function returns `null` (not `0`) for unscored countries, and they are sorted to the bottom.

### 2. API Rate Limits and Batching
**Problem:** Fetching 10 indicators × 54 countries simultaneously would fire 540 concurrent requests, risking rate-limit errors and browser tab crashes.
**Solution:** Countries are fetched in batches of 8, with `Promise.allSettled` (not `Promise.all`) so a single failure doesn't abort the entire batch. Individual indicator fetches within a country are still parallel.

### 3. Score Normalisation Context
**Problem:** Normalising indicator values to 0–100 requires knowing the African min/max for each indicator — but you don't know those until you've fetched all countries.
**Solution:** Two-pass approach: first fetch all indicators, then calculate scores using the full dataset as context for normalisation. Scores are recalculated client-side from cached raw data.

### 4. localStorage Reliability
**Problem:** localStorage can be unavailable (private browsing, storage quota exceeded, browser policy).
**Solution:** All cache reads and writes are wrapped in try-catch blocks that fail silently. The app works correctly whether or not caching is available.

### 5. Chart Memory Leaks
**Problem:** Chart.js instances persist even after their canvas element is re-rendered, causing memory leaks and duplicate charts.
**Solution:** All chart instances are stored in `STATE` and explicitly `.destroy()`-ed before creating a new chart. Event listeners that trigger chart creation also clean up old instances.

---

## Project Structure

```
afribiz-intelligence/
├── index.html          # Complete single-page HTML structure
├── css/
│   └── style.css       # All styles, variables, responsive rules
├── js/
│   └── app.js          # Complete application logic (modular plain JS)
├── nginx/
│   └── afribiz.conf    # Nginx server block for Web01 & Web02
├── assets/             # Static assets directory
├── .env                # Empty — both APIs are keyless
├── .gitignore          # Covers .env, node_modules, .DS_Store, logs
└── README.md           # This file
```

---

## Credits & Attributions

- **World Bank Open Data** — https://data.worldbank.org — Business environment indicator data under CC BY 4.0
- **REST Countries** — https://restcountries.com — Country metadata under Mozilla Public License 2.0
- **Chart.js** — https://chartjs.org — MIT License — Used for line and radar charts
- **Syne Font** — Bonjour Monde / Google Fonts — OFL License
- **DM Sans Font** — Colophon Foundry / Google Fonts — OFL License
- **JetBrains Mono Font** — JetBrains / Google Fonts — OFL License

---

## License

MIT License

Copyright (c) 2025 AfriBiz Intelligence

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## Author

Built for ALU — African Leadership University  
Course: Web Infrastructure & API Integration  
Year: 2025
