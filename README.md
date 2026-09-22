# EUTOPIA Automotive — website

Static site for EUTOPIA Automotive (formerly Total Motor Care), Montague Gardens, Cape Town.
No framework and no build step on Vercel — the pages are pre-generated and committed.

## Pages (same slugs as the old site, so redirects are one-to-one)
`/` · `/about` · `/our-services` · `/car-servicing` · `/repairs` · `/contact` · `/terms-conditions` · `/privacy-policy`

## Editing
1. Make design/content changes in `src/prototype.html` (the single-file prototype).
2. Run `python3 tools/build.py` — regenerates every page, `assets/css/site.css`, `assets/js/site.js`,
   `sitemap.xml`, robots files, `llms.txt` and `pricing.md`.
3. Commit and push. Vercel deploys `main` automatically.
Prices, address and hours live in the `BIZ` and `PACKAGES` blocks at the top of `tools/build.py` —
change them there so the schema, llms.txt and pricing.md stay in sync with the page.

## SEO / AI search — what's in place
- Unique title, meta description, canonical, Open Graph and Twitter card on every page; share image `assets/img/og-eutopia.jpg`
- JSON-LD on every page: AutoRepair/LocalBusiness (address, hours, phone, MIWA + RMI membership),
  plus per page: WebSite, BreadcrumbList, AboutPage, ContactPage, CollectionPage, Service, OfferCatalog (package prices), FAQPage
- FAQ schema is generated from the visible FAQ on Car Servicing and Repairs, so it can never drift from the page
- `sitemap.xml`; legal pages and 404 are `noindex, follow`
- `robots.txt` allows search engines and AI answer engines (GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, Bingbot)
- `llms.txt` and `pricing.md` give AI assistants a clean, factual summary and the package prices
- Preview deployments on `*.vercel.app` automatically get `noindex` + a blocking robots.txt (by hostname, in vercel.json).
  Adding the real domain needs no change.

## Before launch
- Confirm the domain: canonicals, sitemap and schema assume `https://www.eutopiaautomotive.co.za`
  (change `DOMAIN` in `tools/build.py`, rebuild).
- All imagery is hosted locally in `assets/img/` — nothing depends on the old site.
- The two turbo images (eutopia-11, eutopia-12) show 'BILSTEIN' lettering — replace when possible.
- Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools; rename the Google Business Profile
  to EUTOPIA Automotive and set its website to the new domain.
- Google rating (4.6 / 47) and prices are typed in — keep them current.

## Booking form → email (`api/booking.js`)
Every submission sends **two emails** through [Resend](https://resend.com), and shows the customer an on-screen
confirmation with a reference number (e.g. `EUT-260922-PNS3`):
1. **To the workshop** (`MAIL_TO`, default `johan@webrage.co.za`) — Reply-To is the customer, so replying answers them directly.
2. **To the customer** — a receipt with a copy of what they submitted and what happens next.

Both are sent from `EUTOPIA Automotive <noreply@eutopiaautomotive.co.za>` as HTML with a plain-text alternative.
**Spam protection:** origin check, hidden honeypot field, 3-second time trap, per-IP rate limit (5 per 10 min),
content filter (links / SEO pitches / junk), optional Cloudflare Turnstile. Bots get a fake success and nothing is sent.
Tests: `node tests/booking.test.js` (19 tests, email service mocked).

### One-time setup (≈15 minutes)
1. Create a free account at resend.com → **Domains → Add domain** → `eutopiaautomotive.co.za`.
2. Add the DNS records Resend shows you at the domain's DNS host — they're on subdomains, so they
   don't touch the existing email setup:
   - **DKIM** — TXT `resend._domainkey`
   - **SPF / bounce** — MX + TXT on `send.eutopiaautomotive.co.za`
   - **DMARC** (add if the domain has none) — TXT `_dmarc` → `v=DMARC1; p=none; rua=mailto:bookings@eutopiaautomotive.co.za`
     (move to `p=quarantine` after a few weeks of clean reports)
3. Wait for Resend to show the domain as **Verified**.
4. Resend → **API Keys → Create** (sending access only).
5. Vercel → project → **Settings → Environment Variables**: `RESEND_API_KEY` = the key. Redeploy.
6. Submit the form on the live site — both emails should arrive within seconds.

Optional variables: `MAIL_TO` (switch from the test inbox to the workshop), `MAIL_REPLY_TO` (default
`bookings@eutopiaautomotive.co.za` — make sure that mailbox exists), `ALLOWED_ORIGINS`, `TURNSTILE_SECRET`.
