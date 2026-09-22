# EUTOPIA Automotive — website prototype

Design prototype for the EUTOPIA Automotive rebrand (formerly Total Motor Care, Montague Gardens, Cape Town).
A single self-contained static page with client-side page routing — no build step.

## Structure
- `index.html` — the full site: Home, About, Our Services, Car Servicing, Repairs, Contact, Terms, Privacy
- `assets/brand/` — official logo and ⊖ mark as SVG, ivory and obsidian
- `vercel.json` — security headers; `noindex` while this is a preview
- `robots.txt` — blocks indexing of the preview

## Deploy
Connected to Vercel project `eutopiaautomotive`. Every push to `main` deploys automatically.
No framework, no build command, output directory = project root.

## Before this becomes the live site
- Booking forms are front-end only — wire them to email / a form service
- Five legacy photos are still linked from totalmotorcare.co.za (engine block, Bentley wheel, diagnostic
  laptop, wheel on flatbed, brake pads). Download them into `assets/img/` and update the links in
  `index.html` BEFORE the old site is taken down, or those five slots will fall back to plain gradients.
- The two turbo images (eutopia-11, eutopia-12) show 'BILSTEIN' lettering — replace when possible.
- Remove the `noindex` header and `robots.txt` block at launch
- Google rating (4.6 / 47) and prices are typed in — keep them current
