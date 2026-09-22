#!/usr/bin/env python3
"""
EUTOPIA Automotive — static site build.

Turns the single-file prototype (src/prototype.html, hash-routed) into real,
crawlable pages on the same slugs as the old totalmotorcare.co.za site, and
generates every SEO / AI-search artefact:

  /index.html /about.html /our-services.html /car-servicing.html /repairs.html
  /contact.html /terms-conditions.html /privacy-policy.html /404.html
  /assets/css/site.css  /assets/js/site.js
  /sitemap.xml  /robots-production.txt  /robots-preview.txt
  /llms.txt  /pricing.md  /assets/img/og-eutopia.jpg

Run from the repo root:  python3 tools/build.py
"""
import re, json, html, datetime, pathlib, hashlib

ROOT   = pathlib.Path(__file__).resolve().parent.parent
SRC    = ROOT / 'src' / 'prototype.html'
DOMAIN = 'https://www.eutopiaautomotive.co.za'
TODAY  = datetime.date.today().isoformat()

BIZ = {
  'name': 'EUTOPIA Automotive', 'alt': 'Total Motor Care',
  'street': 'Unit 6, 1 Printers Way', 'locality': 'Montague Gardens', 'city': 'Cape Town',
  'region': 'Western Cape', 'postcode': '7441', 'country': 'ZA',
  'phone': '+27872653684', 'phone_display': '+27 87 265 3684',
  'whatsapp': '+27796701967', 'whatsapp_display': '079 670 1967',
  'email': 'bookings@eutopiaautomotive.co.za',
}
PACKAGES = [
  ('Minor Service', 850, 'Routine maintenance, typically every 10,000 km',
   ['Full diagnostic system scan', 'Engine oil replacement', 'New oil filter', 'Complimentary exterior wash']),
  ('Major Service', 1980, 'Comprehensive service, annually or every 15,000–20,000 km',
   ['Full diagnostic system scan', 'Engine oil and oil filter', 'Air filter replacement', 'Fuel filter replacement',
    'Brake fluid flush', 'Cabin filter replacement', 'Complimentary exterior wash']),
  ('Executive Service', 4250, 'All-inclusive service',
   ['Everything in the Major Service', 'Brake fluid check and top-up', 'Spark plug replacement', 'Four-wheel alignment',
    'Wheel balancing', 'Wiper blade replacement', 'Complimentary exterior wash']),
]

# id -> (file, slug, title ≤60, description ≤160, schema page type, index?)
PAGES = {
 'home':      ('index.html', '', 'Car Service & Repairs Cape Town | EUTOPIA Automotive',
               'MIWA 5-star graded workshop in Montague Gardens, Cape Town. Car servicing from R850, diagnostics, repairs and overnight service — every job done in house.',
               'WebPage', True),
 'about':     ('about.html', 'about', 'About Us | EUTOPIA Automotive, Montague Gardens',
               'An independent Cape Town workshop: MIWA 5-star graded, RMI registered (6005778), with mechanical, auto-electrical and diagnostic work all done in house.',
               'AboutPage', True),
 'services':  ('our-services.html', 'our-services', 'Car Services in Cape Town | EUTOPIA Automotive',
               'Mechanical repairs, advanced diagnostics, preventative servicing and overnight service for all makes, including European and premium marques, in Cape Town.',
               'CollectionPage', True),
 'servicing': ('car-servicing.html', 'car-servicing', 'Car Servicing Cape Town from R850 | EUTOPIA Automotive',
               'Minor service from R850, major from R1,980, executive from R4,250. Upfront pricing, no work without approval, and every package available overnight.',
               'WebPage', True),
 'repairs':   ('repairs.html', 'repairs', 'Car Repairs & Diagnostics Cape Town | EUTOPIA Automotive',
               'Brakes, suspension, engine rebuilds, air-conditioning and auto-electrical repairs in Montague Gardens. Diagnose first, quote second, repair third.',
               'WebPage', True),
 'contact':   ('contact.html', 'contact', 'Contact & Directions | EUTOPIA Automotive, Cape Town',
               'Unit 6, 1 Printers Way, Montague Gardens, Cape Town. Open Monday to Friday 07:00–17:00. Call +27 87 265 3684 or WhatsApp 079 670 1967.',
               'ContactPage', True),
 'terms':     ('terms-conditions.html', 'terms-conditions', 'Terms & Conditions | EUTOPIA Automotive',
               'Terms and conditions for vehicle servicing and repairs at EUTOPIA Automotive, Montague Gardens, Cape Town.', 'WebPage', False),
 'privacy':   ('privacy-policy.html', 'privacy-policy', 'Privacy Policy | EUTOPIA Automotive',
               'How EUTOPIA Automotive collects, uses and protects your personal information, in line with POPIA.', 'WebPage', False),
}
CRUMB = {'home':'Home','about':'About','services':'Our Services','servicing':'Car Servicing','repairs':'Repairs',
         'contact':'Contact','terms':'Terms & Conditions','privacy':'Privacy Policy'}
PARENT = {'servicing':'services', 'repairs':'services'}
LINKS = {'#/home':'/', '#/about':'/about', '#/services':'/our-services', '#/servicing':'/car-servicing',
         '#/repairs':'/repairs', '#/contact':'/contact', '#/terms':'/terms-conditions', '#/privacy':'/privacy-policy'}

def url(pid): slug = PAGES[pid][1]; return DOMAIN + ('/' + slug if slug else '/')

# ---------------------------------------------------------------- parse source
src = SRC.read_text()
head = src[src.index('<head>')+6 : src.index('</head>')]
body = src[src.index('<body>')+6 : src.rindex('</body>')]

styles = re.findall(r'<style[^>]*>(.*?)</style>', head, re.S)
css = '\n'.join(styles)
fonts = '\n'.join(re.findall(r'<link rel="(?:preconnect|stylesheet)"[^>]*>', head))

script = re.findall(r'<script>(.*?)</script>', body, re.S)[-1]
body_wo_script = body[:body.rindex('<script>')]
prefix = body_wo_script[:body_wo_script.index('<main id="view"')]
main_open = re.search(r'<main id="view"[^>]*>', body_wo_script).group(0)
suffix = body_wo_script[body_wo_script.index('</main>')+7:]
main_inner = body_wo_script[body_wo_script.index(main_open)+len(main_open) : body_wo_script.index('</main>')]

pages_html = {}
starts = [(m.start(), m.group(1)) for m in re.finditer(r'<div class="page" id="page-([a-z]+)"', main_inner)]
for i, (st, pid) in enumerate(starts):
    en = starts[i+1][0] if i+1 < len(starts) else len(main_inner)
    pages_html[pid] = main_inner[st:en].rstrip()

def relink(h):
    for k, v in LINKS.items(): h = h.replace(f'href="{k}"', f'href="{v}"')
    return h

# ------------------------------------------------------------- shared assets
(ROOT/'assets/css').mkdir(parents=True, exist_ok=True); (ROOT/'assets/js').mkdir(parents=True, exist_ok=True)
(ROOT/'assets/css/site.css').write_text('/* EUTOPIA Automotive — generated by tools/build.py from src/prototype.html */\n' + css)
js = script
js = js.replace("function idFromHash(){", "function idFromHash(){\n    var fixed = document.body.getAttribute('data-page'); if (fixed) return fixed;", 1)
js = js.replace("    window.scrollTo(0, 0);\n    onScroll();", "    if (animate !== false) window.scrollTo(0, 0);\n    onScroll();", 1)
js = js.replace("    document.title = titles[id] || titles.home;", "    if (!document.body.getAttribute('data-page')) document.title = titles[id] || titles.home;", 1)
(ROOT/'assets/js/site.js').write_text('/* EUTOPIA Automotive — generated by tools/build.py */\n' + js)
CSSV = hashlib.md5((ROOT/'assets/css/site.css').read_bytes()).hexdigest()[:10]
JSV  = hashlib.md5((ROOT/'assets/js/site.js').read_bytes()).hexdigest()[:10]

# ---------------------------------------------------------------- JSON-LD
def business():
    return {
      '@type': ['AutoRepair', 'LocalBusiness'], '@id': DOMAIN + '/#business',
      'name': BIZ['name'], 'alternateName': BIZ['alt'], 'url': DOMAIN + '/',
      'logo': DOMAIN + '/assets/brand/eutopia-logo-obsidian.svg', 'image': DOMAIN + '/assets/img/og-eutopia.jpg',
      'description': 'Independent automotive workshop in Montague Gardens, Cape Town: servicing, diagnostics, mechanical and auto-electrical repairs and overnight service for all makes.',
      'telephone': BIZ['phone'], 'email': BIZ['email'],
      'address': {'@type': 'PostalAddress', 'streetAddress': BIZ['street'], 'addressLocality': BIZ['city'],
                  'addressRegion': BIZ['region'], 'postalCode': BIZ['postcode'], 'addressCountry': BIZ['country']},
      'areaServed': [{'@type': 'City', 'name': 'Cape Town'}, {'@type': 'Place', 'name': 'Montague Gardens'},
                     {'@type': 'Place', 'name': 'Milnerton'}, {'@type': 'Place', 'name': 'Century City'}],
      'openingHoursSpecification': [{'@type': 'OpeningHoursSpecification',
          'dayOfWeek': ['Monday','Tuesday','Wednesday','Thursday','Friday'], 'opens': '07:00', 'closes': '17:00'}],
      'priceRange': 'R850–R4250', 'currenciesAccepted': 'ZAR',
      'memberOf': [{'@type': 'Organization', 'name': 'Motor Industry Workshop Association (MIWA)', 'url': 'https://www.miwa.org.za/'},
                   {'@type': 'Organization', 'name': 'Retail Motor Industry Organisation (RMI)', 'url': 'https://www.rmi.org.za/'}],
      'knowsAbout': ['Car servicing', 'Vehicle diagnostics', 'Auto-electrical repairs', 'Brake repairs', 'Suspension repairs',
                     'Engine rebuilds', 'Vehicle air-conditioning', 'Wheel alignment and balancing', 'Fleet maintenance'],
      'contactPoint': [{'@type': 'ContactPoint', 'contactType': 'customer service', 'telephone': BIZ['phone'],
                        'email': BIZ['email'], 'areaServed': 'ZA', 'availableLanguage': ['English']}],
      'hasOfferCatalog': {'@id': DOMAIN + '/car-servicing#packages'},
    }

def offer_catalog():
    return {'@type': 'OfferCatalog', '@id': DOMAIN + '/car-servicing#packages', 'name': 'Car service packages',
            'itemListElement': [{
                '@type': 'Offer', 'name': n, 'description': d + '. Includes: ' + ', '.join(inc) + '.',
                'priceCurrency': 'ZAR', 'url': DOMAIN + '/car-servicing',
                'priceSpecification': {'@type': 'PriceSpecification', 'minPrice': p, 'priceCurrency': 'ZAR'},
                'itemOffered': {'@type': 'Service', 'name': n, 'serviceType': 'Car servicing',
                                'provider': {'@id': DOMAIN + '/#business'}}} for n, p, d, inc in PACKAGES]}

def faq_from(page_html):
    qs = re.findall(r'<summary>(.*?)</summary>\s*<div class="answer">(.*?)</div>', page_html, re.S)
    if not qs: return None
    clean = lambda t: html.unescape(re.sub(r'<[^>]+>', ' ', t)).replace('\u00a0',' ')
    return {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': clean(q).strip(),
            'acceptedAnswer': {'@type': 'Answer', 'text': re.sub(r'\s+', ' ', clean(a)).strip()}} for q, a in qs]}

def services_list(names):
    return [{'@type': 'Service', 'name': n, 'provider': {'@id': DOMAIN + '/#business'},
             'areaServed': {'@type': 'City', 'name': 'Cape Town'}} for n in names]

def graph(pid, page_html):
    f, slug, title, desc, ptype, index = PAGES[pid]
    g = [business()]
    wp = {'@type': ptype, '@id': url(pid) + '#webpage', 'url': url(pid), 'name': title, 'description': desc,
          'inLanguage': 'en-ZA', 'isPartOf': {'@id': DOMAIN + '/#website'}, 'about': {'@id': DOMAIN + '/#business'},
          'dateModified': TODAY, 'primaryImageOfPage': {'@type': 'ImageObject', 'url': DOMAIN + '/assets/img/og-eutopia.jpg'}}
    if pid == 'home':
        g.append({'@type': 'WebSite', '@id': DOMAIN + '/#website', 'url': DOMAIN + '/', 'name': BIZ['name'],
                  'alternateName': BIZ['alt'], 'inLanguage': 'en-ZA', 'publisher': {'@id': DOMAIN + '/#business'}})
    else:
        trail = ['home'] + ([PARENT[pid]] if pid in PARENT else []) + [pid]
        g.append({'@type': 'BreadcrumbList', '@id': url(pid) + '#breadcrumb', 'itemListElement': [
            {'@type': 'ListItem', 'position': i+1, 'name': CRUMB[t], 'item': url(t)} for i, t in enumerate(trail)]})
        wp['breadcrumb'] = {'@id': url(pid) + '#breadcrumb'}
    g.append(wp)
    if pid == 'servicing':
        g.append(offer_catalog())
    if pid == 'repairs':
        g += services_list(['Brake repairs', 'Suspension and steering repairs', 'Engine rebuilds',
                            'Vehicle air-conditioning repairs', 'Auto-electrical repairs and diagnostics'])
    if pid == 'services':
        g += services_list(['Mechanical repairs', 'Advanced vehicle diagnostics', 'Preventative car servicing',
                            'Overnight car service', 'Fleet and commercial vehicle maintenance', 'Pre-purchase inspections'])
    fq = faq_from(page_html)
    if fq: fq['@id'] = url(pid) + '#faq'; g.append(fq)
    return json.dumps({'@context': 'https://schema.org', '@graph': g}, ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- page shell
def shell(pid, content, extra_body_class=''):
    f, slug, title, desc, ptype, index = PAGES[pid] if pid in PAGES else pid
    canon = url(pid) if pid in PAGES else DOMAIN + '/'
    robots = 'index, follow, max-image-preview:large, max-snippet:-1' if index else 'noindex, follow'
    ld = graph(pid, content) if pid in PAGES else ''
    pcls = pid if isinstance(pid, str) else '404'
    return f'''<!DOCTYPE html>
<html lang="en-ZA">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="robots" content="{robots}">
<link rel="canonical" href="{canon}">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_ZA">
<meta property="og:site_name" content="EUTOPIA Automotive">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{canon}">
<meta property="og:image" content="{DOMAIN}/assets/img/og-eutopia.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="EUTOPIA Automotive — premium automotive care in Cape Town">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{html.escape(title)}">
<meta name="twitter:description" content="{html.escape(desc)}">
<meta name="twitter:image" content="{DOMAIN}/assets/img/og-eutopia.jpg">
<meta name="geo.region" content="ZA-WC">
<meta name="geo.placename" content="Montague Gardens, Cape Town">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<meta name="theme-color" content="#0B0B0C">
<link rel="alternate" type="text/plain" title="LLM summary" href="/llms.txt">
{fonts}
<link rel="stylesheet" href="/assets/css/site.css?v={CSSV}">
{('<script type="application/ld+json">' + chr(10) + ld + chr(10) + '</script>') if ld else ''}
</head>
<body data-page="{pid if pid in PAGES else 'home'}" class="page-{pcls}{extra_body_class}">
{relink(prefix)}{main_open}
{relink(content)}
</main>{relink(suffix)}<script src="/assets/js/site.js?v={JSV}"></script>
</body>
</html>
'''

for pid, (f, *_rest) in PAGES.items():
    content = pages_html[pid].replace('<div class="page" ', '<div class="page active" ', 1)
    (ROOT / f).write_text(shell(pid, content))

# 404 — reuses the shell with the home chrome
nf = ('<div class="page active" id="page-home"><section class="banner banner--light"><div class="inner">'
      '<p class="kicker">Error 404</p><h1>PAGE NOT FOUND</h1></div></section>'
      '<section class="bg-ivory" style="padding-top:40px"><div class="wrap narrow center">'
      '<p class="lede">The page you were looking for has moved or no longer exists. If you followed a link to '
      'Total Motor Care, you are in the right place — we are now EUTOPIA Automotive.</p>'
      '<p><a class="btn" href="/">Return home</a> &nbsp; <a class="btn" href="/car-servicing">Service packages</a></p>'
      '</div></section></div>')
(ROOT/'404.html').write_text(shell(('404.html', '', 'Page not found | EUTOPIA Automotive',
   'This page could not be found.', 'WebPage', False), nf))

# ---------------------------------------------------------------- sitemap
urls = [pid for pid, v in PAGES.items() if v[5]]
prio = {'home':'1.0','servicing':'0.9','repairs':'0.9','services':'0.8','contact':'0.8','about':'0.6'}
sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for pid in urls:
    sm.append(f'  <url><loc>{url(pid)}</loc><lastmod>{TODAY}</lastmod><priority>{prio.get(pid,"0.5")}</priority></url>')
sm.append('</urlset>'); (ROOT/'sitemap.xml').write_text('\n'.join(sm) + '\n')

# ---------------------------------------------------------------- robots
(ROOT/'robots-production.txt').write_text(f'''# EUTOPIA Automotive — search and AI answer engines are welcome.
User-agent: *
Allow: /

# AI search / answer engines (explicitly allowed so they can cite the business)
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Bingbot
Allow: /

Sitemap: {DOMAIN}/sitemap.xml
''')
(ROOT/'robots-preview.txt').write_text('# Preview deployment — not for indexing. The live site is ' + DOMAIN + '\nUser-agent: *\nDisallow: /\n')

# ---------------------------------------------------------------- llms.txt + pricing.md
pk = '\n'.join(f'- [{n}]({DOMAIN}/car-servicing): from R{p:,}'.replace(',', ' ') + f' — {d.lower()}' for n, p, d, _ in PACKAGES)
(ROOT/'llms.txt').write_text(f'''# EUTOPIA Automotive

> Independent automotive workshop in Montague Gardens, Cape Town, South Africa. Car servicing, advanced diagnostics, mechanical and auto-electrical repairs, engine rebuilds, air-conditioning and overnight service for all makes and models, including European and premium marques. MIWA-accredited 5-star graded workshop; RMI member, registration 6005778. Formerly trading as Total Motor Care.

## Key facts
- Address: {BIZ['street']}, {BIZ['locality']}, {BIZ['city']}, {BIZ['postcode']}, South Africa
- Hours: Monday to Friday, 07:00–17:00. Closed weekends. Overnight service by arrangement.
- Phone: {BIZ['phone_display']} · WhatsApp: {BIZ['whatsapp_display']} · Email: {BIZ['email']}
- All work is done in house by the workshop's own technicians — nothing is subcontracted.
- Process: diagnose first, quote second, repair third. No work without the customer's approval.
- Google rating: 4.6 out of 5 from 47 reviews (as of September 2026).

## Service packages (upfront pricing, varies by make and model)
{pk}
- Full inclusions: [{DOMAIN}/pricing.md]({DOMAIN}/pricing.md)

## Pages
- [Home]({DOMAIN}/): overview of the workshop and services
- [Our Services]({DOMAIN}/our-services): mechanical, diagnostics, preventative care, premium vehicle care
- [Car Servicing]({DOMAIN}/car-servicing): service packages, prices, intervals and FAQs
- [Repairs]({DOMAIN}/repairs): brakes, suspension, engine rebuilds, air-conditioning, auto-electrical, with FAQs
- [About]({DOMAIN}/about): the workshop, accreditation and standards
- [Contact]({DOMAIN}/contact): address, hours, directions and booking
''')
lines = ['# Pricing — EUTOPIA Automotive (car service packages)', '',
         f'Currency: South African rand (ZAR). Prices are starting prices and vary by make, model and engine. '
         f'Anything beyond the listed inclusions is quoted separately and only done with approval. '
         f'Every package can be booked as an overnight service. Last reviewed: {TODAY}.', '']
for n, p, d, inc in PACKAGES:
    lines += [f'## {n}', f'- Price: from R{p:,}'.replace(',', ' '), f'- Suited to: {d}', '- Includes:'] + [f'  - {i}' for i in inc] + ['']
lines += ['## Optional extras (Executive Service)', '- Gearbox oil replacement — quoted separately',
          '- Differential oil replacement — quoted separately', '',
          f'Book: {DOMAIN}/car-servicing · {BIZ["phone_display"]} · WhatsApp {BIZ["whatsapp_display"]}']
(ROOT/'pricing.md').write_text('\n'.join(lines) + '\n')

print('built:', ', '.join(v[0] for v in PAGES.values()), '+ 404.html, site.css, site.js, sitemap.xml, robots, llms.txt, pricing.md')
