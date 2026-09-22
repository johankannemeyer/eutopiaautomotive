/**
 * EUTOPIA Automotive — booking form handler (Vercel serverless function)
 * POST /api/booking  (JSON)
 *
 * Sends two emails through Resend (https://resend.com):
 *   1. the booking request to the workshop  (MAIL_TO, Reply-To = customer)
 *   2. a receipt to the customer with a copy of what they submitted
 *
 * Spam protection, in order:
 *   1. origin check      — only accepts posts from the site's own domains
 *   2. honeypot field    — hidden field humans never fill; bots do
 *   3. time trap         — rejects forms submitted in under 3 seconds
 *   4. rate limit        — max 5 submissions per IP per 10 minutes (per instance)
 *   5. content filter    — links, spam phrases, non-Latin script floods
 *   6. Cloudflare Turnstile — optional; enforced when TURNSTILE_SECRET is set
 * Anything caught by 2–5 gets a fake "success" so bots learn nothing.
 *
 * Environment variables (Vercel → Project → Settings → Environment Variables):
 *   RESEND_API_KEY    required
 *   MAIL_TO           default: johan@webrage.co.za
 *   MAIL_FROM         default: EUTOPIA Automotive <noreply@eutopiaautomotive.co.za>
 *   MAIL_REPLY_TO     default: bookings@eutopiaautomotive.co.za  (where customer replies go)
 *   ALLOWED_ORIGINS   default: eutopiaautomotive.co.za, www.…, *.vercel.app, localhost
 *   TURNSTILE_SECRET  optional
 */

const BIZ = {
  name: 'EUTOPIA Automotive',
  address: 'Unit 6, 1 Printers Way, Montague Gardens, Cape Town, 7441',
  phone: '+27 87 265 3684', phoneHref: 'tel:+27872653684',
  whatsapp: '079 670 1967', whatsappHref: 'https://wa.me/27796701967',
  hours: 'Monday to Friday, 07:00 – 17:00',
  site: 'https://www.eutopiaautomotive.co.za',
};
const CFG = () => ({
  key: process.env.RESEND_API_KEY || '',
  to: process.env.MAIL_TO || 'johan@webrage.co.za',
  from: process.env.MAIL_FROM || 'EUTOPIA Automotive <noreply@eutopiaautomotive.co.za>',
  replyTo: process.env.MAIL_REPLY_TO || 'bookings@eutopiaautomotive.co.za',
  origins: (process.env.ALLOWED_ORIGINS ||
    'eutopiaautomotive.co.za,www.eutopiaautomotive.co.za,.vercel.app,localhost,127.0.0.1')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  turnstile: process.env.TURNSTILE_SECRET || '',
});

const FIELDS = {
  first_name: { label: 'First name', required: true, max: 60 },
  last_name:  { label: 'Last name',  required: false, max: 60 },
  email:      { label: 'Email',      required: true, max: 120 },
  mobile:     { label: 'Mobile',     required: true, max: 25 },
  make:       { label: 'Vehicle make', required: false, max: 40 },
  model:      { label: 'Model',      required: false, max: 40 },
  year:       { label: 'Year',       required: false, max: 4 },
  service:    { label: 'Service required', required: false, max: 80 },
  message:    { label: 'Message',    required: false, max: 2000 },
};
const SERVICES = ['Minor Service — from R850', 'Major Service — from R1 980', 'Executive Service — from R4 250',
  'Repair or fault', 'Diagnostics', 'Overnight service', 'Something else'];

// ---------------------------------------------------------------- helpers
const hits = new Map();                                   // best-effort, per warm instance
function rateLimited(ip, now = Date.now()) {
  const win = 10 * 60 * 1000, max = 5;
  const list = (hits.get(ip) || []).filter(t => now - t < win);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const oneLine = s => String(s || '').replace(/[\r\n\t\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const multiLine = s => String(s || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
const nl2br = s => esc(s).replace(/\n/g, '<br>');

function originAllowed(req, origins) {
  const src = req.headers.origin || req.headers.referer || '';
  let host = '';
  try { host = new URL(src).hostname.toLowerCase(); } catch { return false; }
  return origins.some(o => o.startsWith('.') ? host.endsWith(o) : host === o);
}

function looksLikeSpam(d) {
  const text = `${d.first_name} ${d.last_name} ${d.message} ${d.make} ${d.model}`;
  const links = (text.match(/https?:\/\/|www\.|\[url|<a\s/gi) || []).length;
  if (links > 1) return 'links';
  if (/\b(viagra|cialis|casino|crypto|bitcoin|forex|loan offer|backlinks?|seo services?|guest post|rank your (site|website)|web ?design services|increase (your )?traffic)\b/i.test(text)) return 'phrases';
  const nonLatin = (d.message.match(/[\u0400-\u04ff\u4e00-\u9fff\u0600-\u06ff]/g) || []).length;
  if (d.message.length > 40 && nonLatin / d.message.length > 0.3) return 'script';
  if (/(.)\1{9,}/.test(text)) return 'repetition';
  if (d.first_name && d.first_name === d.last_name && d.first_name.length > 8 && !/\s/.test(d.first_name)) return 'names';
  return '';
}

function validate(raw) {
  const d = {}, errors = {};
  for (const [k, f] of Object.entries(FIELDS)) {
    let v = k === 'message' ? multiLine(raw[k]) : oneLine(raw[k]);
    if (v.length > f.max) v = v.slice(0, f.max);
    d[k] = v;
    if (f.required && !v) errors[k] = `Please enter your ${f.label.toLowerCase()}.`;
  }
  if (d.email && !/^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(d.email)) errors.email = 'Please enter a valid email address.';
  if (d.mobile) {
    const digits = d.mobile.replace(/[^\d]/g, '');
    if (digits.length < 9 || digits.length > 15 || /[^\d\s()+\-.]/.test(d.mobile)) errors.mobile = 'Please enter a valid phone number.';
  }
  if (d.year && !/^(19[5-9]\d|20\d\d)$/.test(d.year)) errors.year = 'Please enter a four-digit year.';
  if (d.service && !SERVICES.includes(d.service)) d.service = 'Something else';
  return { d, errors };
}

function reference(now = new Date()) {
  const z = n => String(n).padStart(2, '0');
  const sast = new Date(now.getTime() + 2 * 3600 * 1000);                 // South African Standard Time, UTC+2
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EUT-${String(sast.getUTCFullYear()).slice(2)}${z(sast.getUTCMonth() + 1)}${z(sast.getUTCDate())}-${rand}`;
}
function sastStamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'long', day: 'numeric',
    month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

// ---------------------------------------------------------------- email templates
// Table-based, inline-styled, system fonts, no images and no tracking: the
// patterns mail clients render consistently and spam filters trust.
function shell({ preheader, heading, bodyHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background:#F4F1EC;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#F4F1EC;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F4F1EC;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E2DDD4;">
    <tr><td align="center" style="background:#0B0B0C;padding:30px 24px 26px;">
      <div style="font-family:'Century Gothic','Futura','Helvetica Neue',Arial,sans-serif;font-size:26px;letter-spacing:9px;color:#F4F1EC;font-weight:300;padding-left:9px;">EUTOPIA</div>
      <div style="font-family:'Century Gothic','Futura','Helvetica Neue',Arial,sans-serif;font-size:9px;letter-spacing:5px;color:#C6A972;padding-top:8px;padding-left:5px;">AUTOMOTIVE</div>
    </td></tr>
    <tr><td style="padding:36px 40px 8px;font-family:'Helvetica Neue',Arial,sans-serif;color:#2A2C2F;">
      <h1 style="margin:0 0 18px;font-family:'Century Gothic','Futura','Helvetica Neue',Arial,sans-serif;font-weight:300;font-size:21px;letter-spacing:2px;color:#0B0B0C;line-height:1.4;">${esc(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:26px 40px 32px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.7;color:#6B6B6E;border-top:1px solid #E2DDD4;">
      <strong style="color:#2A2C2F;letter-spacing:1px;">${BIZ.name}</strong><br>
      ${esc(BIZ.address)}<br>
      <a href="${BIZ.phoneHref}" style="color:#6B6B6E;text-decoration:none;">${BIZ.phone}</a> &nbsp;·&nbsp;
      WhatsApp <a href="${BIZ.whatsappHref}" style="color:#6B6B6E;text-decoration:none;">${BIZ.whatsapp}</a><br>
      MIWA 5-star graded workshop · RMI 6005778${footerNote ? `<br><br>${footerNote}` : ''}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function rowsHtml(d) {
  const rows = [
    ['Name', `${d.first_name} ${d.last_name}`.trim()], ['Email', d.email], ['Mobile', d.mobile],
    ['Vehicle', [d.year, d.make, d.model].filter(Boolean).join(' ') || '—'],
    ['Service', d.service || '—'],
  ];
  const cells = rows.map(([k, v]) => `<tr>
    <td style="padding:10px 14px 10px 0;border-bottom:1px solid #EDE9E2;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6B6B6E;width:110px;vertical-align:top;">${k}</td>
    <td style="padding:10px 0;border-bottom:1px solid #EDE9E2;font-size:15px;color:#0B0B0C;vertical-align:top;">${esc(v)}</td></tr>`).join('');
  const msg = d.message ? `<tr><td colspan="2" style="padding:16px 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6B6B6E;">Message</td></tr>
    <tr><td colspan="2" style="padding:0 0 10px;font-size:15px;line-height:1.6;color:#0B0B0C;">${nl2br(d.message)}</td></tr>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:'Helvetica Neue',Arial,sans-serif;margin:8px 0 22px;">${cells}${msg}</table>`;
}
function rowsText(d) {
  return [`Name:     ${`${d.first_name} ${d.last_name}`.trim()}`, `Email:    ${d.email}`, `Mobile:   ${d.mobile}`,
    `Vehicle:  ${[d.year, d.make, d.model].filter(Boolean).join(' ') || '—'}`, `Service:  ${d.service || '—'}`,
    ...(d.message ? ['', 'Message:', d.message] : [])].join('\n');
}
const refBadge = ref => `<p style="margin:0 0 20px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#6B6B6E;">Reference &nbsp;<span style="color:#0B0B0C;font-size:14px;letter-spacing:2px;">${ref}</span></p>`;

function workshopEmail(d, ref, stamp, page) {
  const subject = `New booking request — ${`${d.first_name} ${d.last_name}`.trim()}${d.service ? ` · ${d.service.split(' — ')[0]}` : ''} (${ref})`;
  const html = shell({
    preheader: `${d.first_name} ${d.last_name} · ${d.mobile} · ${d.service || 'General enquiry'}`,
    heading: 'New booking request',
    bodyHtml: `${refBadge(ref)}
      <p style="margin:0 0 6px;font-size:15px;line-height:1.7;">A booking request came in through the website on ${esc(stamp)}. Reply to this email to answer the customer directly.</p>
      ${rowsHtml(d)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;"><tr>
        <td style="background:#0B0B0C;"><a href="tel:${esc(d.mobile.replace(/[^\d+]/g, ''))}" style="display:inline-block;padding:13px 24px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#F4F1EC;text-decoration:none;">Call ${esc(d.first_name)}</a></td>
        <td style="width:10px;"></td>
        <td style="border:1px solid #0B0B0C;"><a href="mailto:${esc(d.email)}?subject=${encodeURIComponent('Your booking request — ' + ref)}" style="display:inline-block;padding:12px 24px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#0B0B0C;text-decoration:none;">Email ${esc(d.first_name)}</a></td>
      </tr></table>
      <p style="margin:0 0 8px;font-size:12px;color:#6B6B6E;">Submitted from: ${esc(page || BIZ.site)}</p>`,
  });
  const text = `NEW BOOKING REQUEST — ${ref}\nReceived ${stamp}\n\n${rowsText(d)}\n\nReply to this email to answer the customer directly.\nSubmitted from: ${page || BIZ.site}\n`;
  return { subject, html, text };
}

function customerEmail(d, ref, stamp) {
  const subject = `We've received your booking request — ${BIZ.name} (${ref})`;
  const html = shell({
    preheader: `Thanks, ${d.first_name}. We'll call you to confirm a slot, usually the same working day.`,
    heading: `Thank you, ${d.first_name}`,
    bodyHtml: `${refBadge(ref)}
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;">We've received your booking request and one of our team will call you on <strong>${esc(d.mobile)}</strong> to confirm a slot — usually the same working day.</p>
      <p style="margin:0 0 6px;font-size:15px;line-height:1.7;">Here is a copy of what you sent us:</p>
      ${rowsHtml(d)}
      <p style="margin:0 0 6px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#0B0B0C;">What happens next</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;">We confirm your date and time by phone. When your vehicle is with us we diagnose first and quote before any work starts — nothing is done without your approval.</p>
      <p style="margin:0 0 26px;font-size:15px;line-height:1.7;">Need us sooner? Call <a href="${BIZ.phoneHref}" style="color:#0B0B0C;">${BIZ.phone}</a> or WhatsApp <a href="${BIZ.whatsappHref}" style="color:#0B0B0C;">${BIZ.whatsapp}</a>. We're open ${BIZ.hours}.</p>`,
    footerNote: `You're receiving this because a booking request was submitted with this email address on ${stamp} at eutopiaautomotive.co.za. If that wasn't you, simply ignore this email.`,
  });
  const text = `Thank you, ${d.first_name}.\n\nWe've received your booking request (reference ${ref}). One of our team will call you on ${d.mobile} to confirm a slot — usually the same working day.\n\nA copy of what you sent us:\n\n${rowsText(d)}\n\nWhat happens next: we confirm your date and time by phone. We diagnose first and quote before any work starts — nothing is done without your approval.\n\nNeed us sooner? Call ${BIZ.phone} or WhatsApp ${BIZ.whatsapp}. Open ${BIZ.hours}.\n\n${BIZ.name}\n${BIZ.address}\n\nYou're receiving this because a booking request was submitted with this email address at eutopiaautomotive.co.za. If that wasn't you, ignore this email.\n`;
  return { subject, html, text };
}

// ---------------------------------------------------------------- sending
async function send(cfg, msg, idem) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function turnstileOk(secret, token, ip) {
  if (!secret) return true;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: token, remoteip: ip || '' }),
  });
  return (await r.json()).success === true;
}

// ---------------------------------------------------------------- handler
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false, error: 'Method not allowed' }); }

  const cfg = CFG();
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const fake = () => res.status(200).json({ ok: true, reference: reference() });   // bots get a convincing "success"

  if (!originAllowed(req, cfg.origins)) return res.status(403).json({ ok: false, error: 'Forbidden' });
  if (oneLine(body.company)) return fake();                                        // honeypot
  const started = Number(body.t) || 0, elapsed = Date.now() - started;
  if (!started || elapsed < 3000 || elapsed > 24 * 3600 * 1000) return fake();    // time trap
  if (rateLimited(ip || 'unknown')) return res.status(429).json({ ok: false, error: 'Too many requests. Please call or WhatsApp us instead.' });

  const { d, errors } = validate(body);
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });
  if (looksLikeSpam(d)) return fake();
  if (!(await turnstileOk(cfg.turnstile, body.turnstile, ip))) return res.status(400).json({ ok: false, error: 'Please complete the verification and try again.' });

  if (!cfg.key) {
    console.error('booking: RESEND_API_KEY is not set');
    return res.status(503).json({ ok: false, error: 'Online booking is temporarily unavailable. Please call or WhatsApp us.' });
  }

  const ref = reference(), stamp = sastStamp();
  const page = oneLine(body.page).slice(0, 200);
  const w = workshopEmail(d, ref, stamp, page), c = customerEmail(d, ref, stamp);
  try {
    await send(cfg, { from: cfg.from, to: [cfg.to], reply_to: d.email, subject: w.subject, html: w.html, text: w.text,
      tags: [{ name: 'type', value: 'booking-workshop' }] }, `${ref}-workshop`);
  } catch (e) {
    console.error('booking: workshop email failed', e.message);
    return res.status(502).json({ ok: false, error: 'We couldn’t send your request just now. Please call or WhatsApp us — we’re sorry for the trouble.' });
  }
  let receiptSent = true;
  try {
    await send(cfg, { from: cfg.from, to: [d.email], reply_to: cfg.replyTo, subject: c.subject, html: c.html, text: c.text,
      tags: [{ name: 'type', value: 'booking-receipt' }] }, `${ref}-receipt`);
  } catch (e) { receiptSent = false; console.error('booking: receipt email failed', e.message); }

  return res.status(200).json({ ok: true, reference: ref, receiptSent });
};

// exported for tests
module.exports._internal = { validate, looksLikeSpam, workshopEmail, customerEmail, reference, esc, oneLine, hits };
