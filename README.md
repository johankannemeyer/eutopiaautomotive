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
- Booking forms are front-end only — wire them to email or a form service.
- All imagery is hosted locally in `assets/img/` — nothing depends on the old site.
- The two turbo images (eutopia-11, eutopia-12) show 'BILSTEIN' lettering — replace when possible.
- Submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools; rename the Google Business Profile
  to EUTOPIA Automotive and set its website to the new domain.
- Google rating (4.6 / 47) and prices are typed in — keep them current.
