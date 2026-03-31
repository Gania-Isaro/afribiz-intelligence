# AfriBiz Intelligence

AfriBiz Intelligence is a dashboard I built to help people understand business conditions across all 54 African countries. The idea came from the fact that if you want to know where to start a business in Africa, you have to dig through long World Bank reports, Wikipedia pages, and random news articles just to get basic information. I wanted to put it all in one place.

It's mostly useful for students doing research, entrepreneurs trying to decide where to invest, or honestly anyone curious about how African economies compare to each other.

No backend, no frameworks, just HTML, CSS, and JavaScript pulling from public APIs.

---

## Screenshot

![App Screenshot](images/screenshot.png)

---

## Demo Video

[https://youtu.be/xsuXMcIENnI](https://youtu.be/xsuXMcIENnI)

---

## Live Links

Main link (goes through the load balancer):
- [https://afribiz-intelligence.gania.tech](https://afribiz-intelligence.gania.tech)
- [http://3.89.88.69/](http://3.89.88.69/)

Or hit the servers directly:
- Web01: [http://52.70.87.10/](http://52.70.87.10/)
- Web02: [http://3.93.218.74/](http://3.93.218.74/)

---

## What It Does

- Fetches live data for all 54 African countries from the World Bank API
- Scores each country from 0–100 using a weighted algorithm I made (GDP, inflation, unemployment, internet access, electricity access, tax revenue, corruption data)
- Filter by region (North, West, East, Central, South Africa) and sort by score, inflation, unemployment, or tax revenue
- Search by country name
- Click any country card to open a full profile with a score breakdown, historical trend chart, pros/cons, and similar countries
- Compare Mode: toggle the switch in the sidebar, then click 2 or 3 country cards - a side-by-side comparison panel slides in showing all their indicators next to each other
- Full rankings table with all 54 countries
- Caches everything in localStorage for 4 hours so repeat visits are instant
- Dark mode toggle in the top right

---

## Running It Locally

No install needed.

1. Clone the repo:
```bash
git clone https://github.com/Gania-Isaro/afribiz-intelligence.git
cd afribiz-intelligence
```

2. Open `index.html` directly in your browser, or serve it with Python if you want proper MIME types:
```bash
python3 -m http.server 8080
```
Then go to `http://localhost:8080`

That's it. Both APIs used are completely free with no API keys needed - no `.env` file, nothing to configure.

> **Note on `.gitignore`:** The repo includes a `.gitignore` that excludes `.env` files, `node_modules/`, OS files like `.DS_Store` and `Thumbs.db`, and editor folders. There are no secrets in this repo and nothing sensitive was ever committed.

---

## Deployment

### Servers

| Server | Role | IP |
|--------|------|----|
| Web01 | Nginx | 52.70.87.10 |
| Web02 | Nginx | 3.93.218.74 |
| Lb01 | HAProxy (load balancer) | 3.89.88.69 |

---

### Step 1 - Deploy to Web01 and Web02

SSH into each server:
```bash
ssh -i ~/.ssh/school ubuntu@52.70.87.10   # Web01
ssh -i ~/.ssh/school ubuntu@3.93.218.74   # Web02
```

Install Nginx and set up the web root:
```bash
sudo apt update && sudo apt install -y nginx
sudo mkdir -p /var/www/afribiz-intelligence
sudo chown -R ubuntu:ubuntu /var/www/afribiz-intelligence
```

From your local machine, copy the app files to each server:
```bash
scp -i ~/.ssh/school -r index.html css/ js/ images/ sw.js ubuntu@52.70.87.10:/var/www/afribiz-intelligence/
scp -i ~/.ssh/school -r index.html css/ js/ images/ sw.js ubuntu@3.93.218.74:/var/www/afribiz-intelligence/
```

Copy the Nginx config to each server and enable it:
```bash
scp -i ~/.ssh/school nginx/afribiz.conf ubuntu@52.70.87.10:/home/ubuntu/afribiz.conf
scp -i ~/.ssh/school nginx/afribiz.conf ubuntu@3.93.218.74:/home/ubuntu/afribiz.conf
```

Then on each server:
```bash
sudo cp /home/ubuntu/afribiz.conf /etc/nginx/sites-available/afribiz
sudo ln -s /etc/nginx/sites-available/afribiz /etc/nginx/sites-enabled/afribiz
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

The Nginx config sets:
- Root: `/var/www/afribiz-intelligence`
- All routes fall back to `index.html`
- No-cache on HTML and the service worker file
- 7-day cache on CSS/JS/images
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, CSP, `Referrer-Policy`, `Permissions-Policy`
- Gzip on

---

### Step 2 - Set Up the Load Balancer

SSH into Lb01:
```bash
ssh -i ~/.ssh/school ubuntu@3.89.88.69
```

Install HAProxy and certbot:
```bash
sudo apt update && sudo apt install -y haproxy certbot
```

Get an SSL certificate:
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

Copy the HAProxy config to the server and start it:
```bash
scp -i ~/.ssh/school nginx/haproxy.cfg ubuntu@3.89.88.69:/home/ubuntu/haproxy.cfg
```

Then on the load balancer:
```bash
sudo cp /home/ubuntu/haproxy.cfg /etc/haproxy/haproxy.cfg
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl enable haproxy && sudo systemctl start haproxy
```

What the HAProxy config does:
- Port 80 redirects everything to HTTPS (except Let's Encrypt challenges)
- Port 443 terminates TLS, rate limits at 100 requests per 10 seconds per IP
- Round-robin between Web01 and Web02
- Health checks every 5 seconds - if a server fails 3 checks it gets removed, comes back after 2 successes
- Blocks common attack paths like `/wp-admin`, `/.env`, `/phpmyadmin`
- Stats page at `127.0.0.1:8404/stats` (only accessible through SSH tunnel)

---

### Step 3 - Verify the Load Balancer is Working

Check that the site responds through the load balancer:
```bash
curl -sI https://afribiz-intelligence.gania.tech/health
```

Expected output:
```
HTTP/2 200
content-type: text/plain
...
```

Verify both backend servers are individually healthy:
```bash
curl -sI http://52.70.87.10   # Web01 - expect HTTP/200
curl -sI http://3.93.218.74   # Web02 - expect HTTP/200
```

To see actual traffic distribution and server health, open the HAProxy stats page via SSH tunnel:
```bash
ssh -i ~/.ssh/school -L 8404:127.0.0.1:8404 ubuntu@3.89.88.69
```
Then open `http://localhost:8404/stats` in your browser. It shows request counts per backend, uptime, and health check status for both servers. In my testing Web01 and Web02 were both green and the session counts were roughly equal after a few page loads, confirming round-robin is working.

---

## Challenges

**World Bank data gaps**
The World Bank doesn't have data for every indicator for every country, especially for smaller or conflict-affected ones like South Sudan and Somalia. I made the scoring algorithm work with partial data - it still gives a score as long as at least 2 weighted indicators are available, and shows "N/A" for anything missing.

**54 countries × multiple indicators = a lot of API calls**
If you naively fetch all indicators for all 54 countries at once you get rate limited immediately. I fixed this by batching requests (8 countries at a time) and caching the results in localStorage for 4 hours. After the first load the app is basically instant.

**API key security**
I specifically chose APIs that don't require any keys - the World Bank Open Data API and REST Countries API are both completely open. This means there's nothing to accidentally expose in the client-side code. For the repo I still added a `.env` file template and a `.gitignore` that excludes it, so if someone forks this and adds a paid API later they have the pattern already set up.

**Country name mismatches**
REST Countries and the World Bank use slightly different country names and codes in some cases. I had to normalize everything to ISO 3166-1 alpha-2 codes and manually handle a few edge cases where the two APIs disagreed on a country's name.

**HAProxy config**
Getting HAProxy to do HTTPS termination, redirect HTTP to HTTPS, run health checks, AND not break Let's Encrypt certificate renewal all at the same time took a few attempts. The ACME challenge handling was the tricky part - you have to let port 80 respond with 200 for `/.well-known/acme-challenge/` but redirect everything else.

---

## APIs Used

| API | What I used it for | Docs |
|-----|--------------------|------|
| [World Bank Open Data](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599) | All the economic indicators - GDP, inflation, unemployment, internet/electricity access, tax revenue, corruption | [API Docs](https://datahelpdesk.worldbank.org/knowledgebase/articles/898599) |
| [REST Countries](https://restcountries.com) | Country names, flags, capitals, currencies, languages, population | [API Docs](https://restcountries.com/#api-endpoints-v3) |

No API keys required for either. Both are completely free and open.

---

## Project Info

- **School:** African Leadership University (ALU)
- **Course:** Web Infrastructure
- **Year:** 2026
- **Author:** Gania Isaro
