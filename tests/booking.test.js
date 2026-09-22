// Run: node tests/booking.test.js   (no dependencies; the Resend API is mocked)
const assert = require('assert');
process.env.RESEND_API_KEY = 'test_key';
const handler = require('../api/booking.js');
let sent = [], failNext = null;
global.fetch = async (url, opts) => {
  if (failNext) { const f = failNext; failNext = null; return { ok: false, status: f, text: async () => 'boom' }; }
  sent.push({ url, body: JSON.parse(opts.body), headers: opts.headers });
  return { ok: true, json: async () => ({ id: 'mock' }) };
};
function call(body, { origin = 'https://www.eutopiaautomotive.co.za', ip = '10.0.0.1', method = 'POST' } = {}) {
  return new Promise(resolve => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(p) { resolve({ code: this.code, body: p }); } };
    handler({ method, body, headers: { origin, 'x-forwarded-for': ip } }, res);
  });
}
const good = (o = {}) => ({ first_name: 'Thandi', last_name: 'Mokoena', email: 'thandi@example.com', mobile: '082 555 0123',
  make: 'BMW', model: '320d', year: '2019', service: 'Major Service — from R1 980', message: 'Brakes squeal when cold.\nAlso due for a service.',
  company: '', t: Date.now() - 12000, page: 'https://www.eutopiaautomotive.co.za/car-servicing', ...o });
const results = [];
async function t(name, fn) { sent = []; handler._internal.hits.clear(); try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' — ' + e.message]); } }

(async () => {
  await t('valid booking sends 2 emails: workshop then customer receipt', async () => {
    const r = await call(good()); assert.equal(r.code, 200); assert.equal(r.body.ok, true); assert.match(r.body.reference, /^EUT-\d{6}-[A-Z0-9]{4}$/);
    assert.equal(sent.length, 2); assert.equal(r.body.receiptSent, true);
  });
  await t('workshop email: to johan@webrage.co.za, from noreply@, reply-to customer, html + text', async () => {
    await call(good()); const w = sent[0].body;
    assert.deepEqual(w.to, ['johan@webrage.co.za']); assert.equal(w.from, 'EUTOPIA Automotive <noreply@eutopiaautomotive.co.za>');
    assert.equal(w.reply_to, 'thandi@example.com'); assert.ok(w.html.includes('<!DOCTYPE html>') && w.text.length > 50);
    assert.match(w.subject, /^New booking request — Thandi Mokoena · Major Service \(EUT-/);
  });
  await t('customer receipt: to customer, from noreply@, reply-to bookings@, contains their submission', async () => {
    await call(good()); const c = sent[1].body;
    assert.deepEqual(c.to, ['thandi@example.com']); assert.equal(c.reply_to, 'bookings@eutopiaautomotive.co.za');
    for (const s of ['Thandi', '082 555 0123', '2019 BMW 320d', 'Major Service', 'Brakes squeal when cold.<br>Also due']) assert.ok(c.html.includes(s), 'missing ' + s);
    assert.match(c.subject, /We've received your booking request — EUTOPIA Automotive \(EUT-/);
  });
  await t('each email carries an idempotency key (no duplicate sends on retry)', async () => {
    await call(good()); assert.ok(sent.every(s => /^EUT-.*-(workshop|receipt)$/.test(s.headers['Idempotency-Key'])));
  });
  await t('honeypot filled -> fake success, nothing sent', async () => {
    const r = await call(good({ company: 'Acme SEO' })); assert.equal(r.body.ok, true); assert.equal(sent.length, 0);
  });
  await t('submitted in under 3 seconds -> fake success, nothing sent', async () => {
    const r = await call(good({ t: Date.now() - 800 })); assert.equal(r.body.ok, true); assert.equal(sent.length, 0);
  });
  await t('missing timestamp -> fake success, nothing sent', async () => {
    const r = await call(good({ t: undefined })); assert.equal(sent.length, 0); assert.equal(r.body.ok, true);
  });
  await t('foreign origin -> 403, nothing sent', async () => {
    const r = await call(good(), { origin: 'https://spam-bot.example' }); assert.equal(r.code, 403); assert.equal(sent.length, 0);
  });
  await t('vercel preview and localhost origins allowed', async () => {
    assert.equal((await call(good(), { origin: 'https://eutopiaautomotive-abc.vercel.app' })).code, 200);
    assert.equal((await call(good(), { origin: 'http://localhost:3000', ip: '10.0.0.9' })).code, 200);
  });
  await t('spam content (links / SEO pitch) -> fake success, nothing sent', async () => {
    await call(good({ message: 'Visit http://a.io and http://b.io now' })); await call(good({ message: 'We offer SEO services to rank your website', ip: 2 }));
    assert.equal(sent.length, 0);
  });
  await t('6th submission from one IP within 10 min -> 429', async () => {
    let last; for (let i = 0; i < 6; i++) last = await call(good()); assert.equal(last.code, 429); assert.equal(sent.length, 10);
  });
  await t('missing/invalid fields -> 400 with per-field messages, nothing sent', async () => {
    const r = await call(good({ first_name: '', email: 'not-an-email', mobile: '12', year: '19' }));
    assert.equal(r.code, 400); assert.deepEqual(Object.keys(r.body.errors).sort(), ['email', 'first_name', 'mobile', 'year']); assert.equal(sent.length, 0);
  });
  await t('HTML/script injection is escaped in both emails', async () => {
    await call(good({ first_name: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>' }));
    assert.ok(sent.every(s => !s.body.html.includes('<script>alert') && !s.body.html.includes('<img src=x')));
    assert.ok(sent[0].body.html.includes('&lt;script&gt;'));
  });
  await t('newlines stripped from single-line fields (header injection)', async () => {
    await call(good({ first_name: 'Bob\r\nBcc: victim@x.com' })); assert.ok(!/[\r\n]/.test(sent[0].body.subject));
  });
  await t('unknown service value is normalised', async () => {
    await call(good({ service: 'Free money' })); assert.ok(sent[0].body.subject.includes('Something else'));
  });
  await t('workshop send fails -> 502 with call/WhatsApp fallback, no receipt sent', async () => {
    failNext = 500; const r = await call(good()); assert.equal(r.code, 502); assert.match(r.body.error, /call or WhatsApp/); assert.equal(sent.length, 0);
  });
  await t('receipt fails (bad customer address) -> booking still succeeds, flagged', async () => {
    const orig = global.fetch; let n = 0;
    global.fetch = async (u, o) => (++n === 2 ? { ok: false, status: 422, text: async () => 'invalid' } : orig(u, o));
    const r = await call(good()); global.fetch = orig; assert.equal(r.code, 200); assert.equal(r.body.receiptSent, false);
  });
  await t('GET -> 405', async () => { const r = await call(good(), { method: 'GET' }); assert.equal(r.code, 405); });
  await t('no API key -> 503 with call/WhatsApp message', async () => {
    delete process.env.RESEND_API_KEY; const r = await call(good()); process.env.RESEND_API_KEY = 'test_key';
    assert.equal(r.code, 503); assert.match(r.body.error, /call or WhatsApp/);
  });
  // save rendered emails for visual review
  sent = []; handler._internal.hits.clear(); await call(good());
  require('fs').writeFileSync('/tmp/email-workshop.html', sent[0].body.html); require('fs').writeFileSync('/tmp/email-receipt.html', sent[1].body.html);
  for (const [s, n] of results) console.log(s, ' ', n);
  const failed = results.filter(r => r[0] === 'FAIL').length; console.log(`\n${results.length - failed}/${results.length} passed`); process.exit(failed ? 1 : 0);
})();
