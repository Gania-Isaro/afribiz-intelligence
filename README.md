# AfriBiz Intelligence

Welcome to AfriBiz Intelligence is a simple dashboard that helps you understand business conditions across all 54 African countries.

This tool is useful because it turns complex World Bank data into something easy to read and compare. Instead of going through long reports, you can quickly see which countries are growing, where business conditions are improving, and where risks might exist.

For entrepreneurs, it helps you decide where to invest or expand.
For students, it makes research faster and clearer.
For anyone interested in Africa's economy, it gives a quick and reliable way to understand what is really happening across different countries.

By putting all this data in one place, the dashboard saves time, reduces confusion, and helps you make better, data-driven decisions.

---

## Snapshot
![App Screenshot](images/screenshot.png)

---

## Demo Video
Watch the full walkthrough here: [https://youtu.be/xsuXMcIENnI](https://youtu.be/xsuXMcIENnI)

---

## Try it Out!
You can access the live app through our load balancer:
- **Main Link (HTTPS):** [https://afribiz-intelligence.gania.tech](https://afribiz-intelligence.gania.tech)
- **Load Balancer (IP):** [http://3.89.88.69/](http://3.89.88.69/)

Or directly through the individual servers:
- Web01: [http://52.70.87.10/](http://52.70.87.10/)
- Web02: [http://3.93.218.74/](http://3.93.218.74/)

---

## What can it do?
- **Live Data:** It fetches the latest info for all 54 African countries in real-time.
- **Business Scores:** I created an algorithm that gives each country a score from 0 to 100 based on things like GDP, inflation, and internet access.
- **Easy Filtering:** You can filter by region (like North or West Africa) and sort by what matters to you (best score, lowest inflation, etc.).
- **Country Details:** Click on any country to see more details, including capital city, population, and even some business news!
- **Works Offline:** If you've visited before, the app saves the data so it still works even if you lose your internet connection.
- **Dark Mode:** It looks great in both light and dark themes!

---

## How I Built It
I wanted to keep this project simple and fast, so I didn't use any fancy frameworks like React or Vue. It's built with:
- **HTML5 & CSS3:** For the structure and beautiful design.
- **Vanilla JavaScript:** For all the logic and fetching data.
- **World Bank API:** This is where all the economic data comes from.
- **REST Countries API:** Used for flags and basic country info.
- **GNews API:** To show the latest business headlines.

---

## Running it on Your Computer
You don't need to install anything! Just follow these steps:

1. **Clone this project:**
   ```bash
   git clone https://github.com/Gania-Isaro/afribiz-intelligence.git
   cd afribiz-intelligence
   ```
2. **Open the app:**
   - Just double-click `index.html` in your file explorer.
   - Or, if you have Python, run: `python3 -m http.server 8080` and go to `localhost:8080`.

---

## How I Deployed It (The Technical Stuff)

### Infrastructure Overview
| Server | Role | IP Address |
|--------|------|------------|
| Web01 | Nginx web server | 52.70.87.10 |
| Web02 | Nginx web server | 3.93.218.74 |
| Lb01 | HAProxy load balancer | 3.89.88.69 |

---

### Step 1 — Deploy to Web01 and Web02 (repeat for both)

SSH into each web server:
```bash
ssh -i ~/.ssh/school ubuntu@52.70.87.10   # Web01
ssh -i ~/.ssh/school ubuntu@3.93.218.74   # Web02
```

Install Nginx and create the web root:
```bash
sudo apt update && sudo apt install -y nginx
sudo mkdir -p /var/www/afribiz-intelligence
sudo chown -R ubuntu:ubuntu /var/www/afribiz-intelligence
```

From your **local machine**, copy the project files to each server:
```bash
scp -i ~/.ssh/school -r index.html css/ js/ images/ sw.js ubuntu@52.70.87.10:/var/www/afribiz-intelligence/
scp -i ~/.ssh/school -r index.html css/ js/ images/ sw.js ubuntu@3.93.218.74:/var/www/afribiz-intelligence/
```

Copy the Nginx config and enable the site:
```bash
# On each web server:
sudo cp /home/ubuntu/afribiz.conf /etc/nginx/sites-available/afribiz
sudo ln -s /etc/nginx/sites-available/afribiz /etc/nginx/sites-enabled/afribiz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

The Nginx config (`nginx/afribiz.conf`) sets:
- Root directory: `/var/www/afribiz-intelligence`
- SPA routing: all paths fall back to `index.html`
- GNews API proxy at `/api/news/` to avoid browser CORS restrictions
- Cache-Control headers: no-cache for HTML/service worker, 7-day immutable for static assets
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, CSP, `Referrer-Policy`
- Gzip compression for text, CSS, JS, and JSON

---

### Step 2 — Configure the Load Balancer (Lb01)

SSH into the load balancer:
```bash
ssh -i ~/.ssh/school ubuntu@3.89.88.69
```

Install HAProxy and certbot:
```bash
sudo apt update && sudo apt install -y haproxy certbot
```

Get an SSL certificate for the domain:
```bash
sudo systemctl stop haproxy
sudo certbot certonly --standalone -d afribiz-intelligence.gania.tech \
  --non-interactive --agree-tos -m admin@gania.tech
sudo mkdir -p /etc/haproxy/certs
sudo cat /etc/letsencrypt/live/afribiz-intelligence.gania.tech/fullchain.pem \
         /etc/letsencrypt/live/afribiz-intelligence.gania.tech/privkey.pem \
  | sudo tee /etc/haproxy/certs/afribiz.pem > /dev/null
sudo chmod 600 /etc/haproxy/certs/afribiz.pem
```

Copy the HAProxy config and start the service:
```bash
sudo cp /home/ubuntu/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo haproxy -c -f /etc/haproxy/haproxy.cfg   # validate config
sudo systemctl enable haproxy && sudo systemctl start haproxy
```

The HAProxy config (`nginx/haproxy.cfg`) sets:
- **Frontend HTTP (port 80):** Redirects all traffic to HTTPS (301), except Let's Encrypt ACME challenges
- **Frontend HTTPS (port 443):** Terminates TLS with HTTP/2 support; applies rate limiting (100 req/10s per IP)
- **Backend:** Round-robin between Web01 (`52.70.87.10:80`) and Web02 (`3.93.218.74:80`)
- **Health checks:** `GET /` every 5 seconds; 3 failures → remove server, 2 successes → restore
- **Attack blocking:** Blocks requests to `/wp-admin`, `/.env`, `/phpmyadmin`, etc.
- **Stats:** Available at `127.0.0.1:8404/stats` (via SSH tunnel)

---

### Step 3 — Verify Load Balancing

Check that traffic is distributed between both servers:
```bash
# From local machine — run several times and check which server responds
for i in {1..6}; do curl -s https://afribiz-intelligence.gania.tech | grep -o "Web0[12]" ; done
```

Or check HAProxy stats via SSH tunnel:
```bash
ssh -i ~/.ssh/school -L 8404:127.0.0.1:8404 ubuntu@3.89.88.69
# Then open http://localhost:8404/stats in your browser
```

---

## What I Learned
Working on this project was a huge learning experience for me. I learned:
- How to fetch and handle data from multiple APIs at once.
- How to build a custom "scoring" system to rank countries.
- The importance of **caching** (saving data locally) to make apps faster and work offline.
- How to set up and configure **Nginx** and **HAProxy** on Linux servers.
- How to keep code clean and organized without using big frameworks.

---

## Challenges I Faced

**1. World Bank API data gaps**
The biggest challenge was that the World Bank doesn't have data for every indicator for every country — especially smaller or conflict-affected nations like South Sudan or Somalia. I solved this by making the scoring algorithm flexible: it still calculates a score if at least 2 out of the weighted indicators have data, and it gracefully shows "N/A" for anything missing.

**2. Avoiding API rate limits**
With 54 countries and multiple indicators each, a naive implementation would fire hundreds of API calls at once and hit rate limits immediately. I solved this by fetching indicators in batches of 8 countries at a time and caching all responses in `localStorage` for 4 hours — so the app only needs to make live calls once per session.

**3. Client-side API key security**
Because this is a pure frontend app with no backend server, API keys cannot be fully hidden from the browser. I minimized exposure by keeping keys out of any public `.env` files and providing them directly in the config. For a production app, the correct solution would be a backend proxy server that makes the API calls on behalf of the client.

**4. Consistent UI across 54 countries**
Country names, flags, and metadata came from REST Countries API, but some entries used different name formats than the World Bank expected. I had to normalize country codes and handle edge cases where REST Countries returned extra metadata the app didn't need.

**5. Load balancer configuration**
Setting up HAProxy to correctly distribute traffic between two Nginx servers while ensuring session consistency took several iterations. I had to configure health checks so the load balancer would automatically stop sending traffic to a server that went down.

---

## API Credits & Documentation

This application uses the following external APIs — thank you to their developers:

| API | Purpose | Documentation | Free Tier |
|-----|---------|---------------|-----------|
| [World Bank Open Data](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599) | Business indicators & economic data | [API Docs](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599) | No key required |
| [REST Countries](https://restcountries.com) | Country names, flags, capitals, currencies | [API Docs](https://restcountries.com/#api-endpoints-v3) | No key required |
| [GNews API](https://gnews.io) | Business news headlines per country | [API Docs](https://gnews.io/docs) | 100 requests/day |
| [ExchangeRate-API](https://www.exchangerate-api.com) | Live currency conversion rates | [API Docs](https://www.exchangerate-api.com/docs) | 1,500 requests/month |

---

## Project Info
- **School:** African Leadership University (ALU)
- **Course:** Web Infrastructure
- **Year:** 2026
- **Author:** Gania Isaro

---

## License
This project is licensed under the MIT License - feel free to use it for your own learning!
