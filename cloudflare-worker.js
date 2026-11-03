/**
 * Cloudflare Worker for Zoee's booking system
 * Handles two things:
 *   1. Availability API backed by a KV namespace (shared source of truth for
 *      both the public booking calendar and the admin panel)
 *   2. Emailing Zoee about new bookings and contact messages via EmailJS
 *      (see sendEmailJS below for the settings it needs)
 *
 * Deploy this worker to your Cloudflare account with a KV namespace bound
 * as `AVAILABILITY` (Settings > Variables > KV Namespace Bindings).
 *
 * Setup Instructions:
 * 1. Go to Cloudflare Dashboard > Workers & Pages > Create Application
 * 2. Choose "Create a Worker"
 * 3. Replace the default code with this entire script
 * 4. Name it "send-booking-email"
 * 5. Create a KV namespace and bind it to this worker as `AVAILABILITY`
 * 6. Click "Deploy"
 * 7. Copy the Worker URL (format: https://send-booking-email.yourusername.workers.dev)
 *
 * API (all public, unauthenticated - keep it that way only for read-only or
 * additive operations a site visitor is meant to be able to do):
 *   GET  /availability   -> { bookedDates: string[], blockedDates: string[] }
 *   POST /availability/book -> body: { date, name, email, phone, service, message }
 *   POST /messages           -> body: { name, email, phone, weddingDate, message } (public contact form)
 *
 * Full booking details (name/email/phone/message) and contact form messages
 * are written to KV too, but are only ever read back through this site's own
 * Access-protected /api/admin/* routes (see functions/api/admin/) - never
 * through this worker directly, since that data is not meant to be public.
 *
 * Deliberately NOT here: unblocking/blocking dates, removing a booking, or a
 * generic "send any email" relay. Those are destructive/abusable and require
 * a login, so they live exclusively in functions/api/admin/ (Cloudflare
 * Access + independent JWT verification) instead of this worker. Do not add
 * them back here without auth - this worker's URL is public (it's in the
 * site's own client-side JS), so anything unauthenticated here is reachable
 * by anyone who finds it, not just this site's visitors.
 *
 * Both POST routes require a Cloudflare Turnstile token (body field
 * `turnstileToken`, verified server-side against the `TURNSTILE_SECRET_KEY`
 * secret) and are additionally rate-limited per IP via the AVAILABILITY KV
 * namespace, to keep them from being scripted/spammed.
 */

// EmailJS IDs and the public key aren't secret, so they live here; a Worker variable of
// the same name, if set, overrides the value below.
const EMAILJS_DEFAULTS = {
  EMAILJS_SERVICE_ID: 'service_bp3k18e',
  EMAILJS_PUBLIC_KEY: 'MvoE6IVKYaAJ4FbPu',
  EMAILJS_CONTACT_TEMPLATE_ID: 'template_zuoas3f', // "Contact Us" template
};

const ADMIN_EMAILS = [
  { email: 'zoee.burley@yahoo.com', name: 'Zoee Burley' },
  { email: 'h.m.ward1846@gmail.com', name: 'Admin' },
];

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/availability' && request.method === 'GET') {
        const availability = await getAvailability(env);
        return jsonResponse(availability, 200, corsHeaders);
      }

      if (url.pathname === '/availability/book' && request.method === 'POST') {
        const data = await request.json();
        const ip = request.headers.get('CF-Connecting-IP');
        return await handleBookDate(data, env, corsHeaders, ip);
      }

      if (url.pathname === '/messages' && request.method === 'POST') {
        const data = await request.json();
        const ip = request.headers.get('CF-Connecting-IP');
        return await handleContactMessage(data, env, corsHeaders, ip);
      }

      return jsonResponse({ error: 'Not found' }, 404, corsHeaders);
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: error.message }, 500, corsHeaders);
    }
  },
};

function jsonResponse(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

async function readDateList(env, key) {
  const raw = await env.AVAILABILITY.get(key);
  return raw ? JSON.parse(raw) : [];
}

async function getAvailability(env) {
  const [bookedDates, blockedDates] = await Promise.all([
    readDateList(env, 'bookedDates'),
    readDateList(env, 'blockedDates'),
  ]);
  return { bookedDates, blockedDates };
}

// Verifies a Cloudflare Turnstile token against Cloudflare's own siteverify
// endpoint. If the secret isn't configured (shouldn't happen in production -
// it's set as a Worker secret), fail OPEN rather than break booking/contact
// entirely over a config mistake; log it so it's visible either way.
async function verifyTurnstile(token, ip, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('TURNSTILE_SECRET_KEY is not configured - skipping verification');
    return true;
  }
  if (!token) return false;

  const formData = new URLSearchParams();
  formData.append('secret', env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const outcome = await res.json();
    return !!outcome.success;
  } catch (error) {
    console.error('Turnstile verification request failed:', error);
    return false;
  }
}

// Simple per-IP rate limit backed by the same KV namespace, as a backstop
// behind Turnstile (Turnstile stops bots; this caps abuse from anyone who
// still gets a token, human or not). Fails open if there's no IP to key on.
async function checkRateLimit(env, ip, bucket, limit = 5, windowSeconds = 600) {
  if (!ip) return true;

  const key = `ratelimit:${bucket}:${ip}`;
  const raw = await env.AVAILABILITY.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= limit) return false;

  await env.AVAILABILITY.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

async function handleBookDate(data, env, corsHeaders, ip) {
  const { date, name, email, phone, service, message, turnstileToken } = data;

  if (!date || !name || !email || !service) {
    return jsonResponse({ error: 'Missing required booking fields' }, 400, corsHeaders);
  }

  if (!(await checkRateLimit(env, ip, 'book'))) {
    return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, corsHeaders);
  }

  if (!(await verifyTurnstile(turnstileToken, ip, env))) {
    return jsonResponse({ error: 'Verification failed. Please refresh the page and try again.' }, 403, corsHeaders);
  }

  const [bookedDates, blockedDates] = await Promise.all([
    readDateList(env, 'bookedDates'),
    readDateList(env, 'blockedDates'),
  ]);

  if (bookedDates.includes(date) || blockedDates.includes(date)) {
    return jsonResponse({ error: 'That date is no longer available' }, 409, corsHeaders);
  }

  bookedDates.push(date);
  await env.AVAILABILITY.put('bookedDates', JSON.stringify(bookedDates));

  const bookingData = {
    name,
    email,
    phone: phone || '',
    date,
    service,
    message: message || '',
    bookingDate: new Date().toLocaleString(),
  };

  const bookings = await readDateList(env, 'bookings');
  bookings.push(bookingData);
  await env.AVAILABILITY.put('bookings', JSON.stringify(bookings));

  try {
    await sendEmailJS(env, 'EMAILJS_BOOKING_TEMPLATE_ID', {
      name,
      email,
      phone: bookingData.phone,
      date,
      service,
      message: bookingData.message,
    });
  } catch (emailError) {
    // The booking itself is already saved; a failed notification email
    // shouldn't make the booking appear to fail for the client.
    console.error('Booking saved but notification email failed:', emailError);
  }

  return jsonResponse({ success: true, message: 'Booking confirmed' }, 200, corsHeaders);
}

async function handleContactMessage(data, env, corsHeaders, ip) {
  const { name, email, phone, weddingDate, message, turnstileToken } = data;

  if (!name || !email) {
    return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
  }

  if (!(await checkRateLimit(env, ip, 'messages'))) {
    return jsonResponse({ error: 'Too many requests. Please try again later.' }, 429, corsHeaders);
  }

  if (!(await verifyTurnstile(turnstileToken, ip, env))) {
    return jsonResponse({ error: 'Verification failed. Please refresh the page and try again.' }, 403, corsHeaders);
  }

  const messageData = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    phone: phone || '',
    weddingDate: weddingDate || '',
    message: message || '',
    receivedAt: new Date().toISOString(),
    read: false,
  };

  const messages = await readDateList(env, 'contactMessages');
  messages.unshift(messageData);
  await env.AVAILABILITY.put('contactMessages', JSON.stringify(messages));

  try {
    await sendEmailJS(env, 'EMAILJS_CONTACT_TEMPLATE_ID', {
      name,
      email,
      phone: messageData.phone,
      wedding_date: messageData.weddingDate,
      message: messageData.message,
    });
  } catch (emailError) {
    console.error('Message saved but notification email failed:', emailError);
  }

  return jsonResponse({ success: true, message: 'Message sent' }, 200, corsHeaders);
}

// Sends a notification email through EmailJS's REST API
// (https://www.emailjs.com/docs/rest-api/send/). Called server-side from this
// Worker - not from the browser - so the private key stays a Worker secret
// and every email has already passed Turnstile + the rate limit above.
//
// Required Worker settings (Workers & Pages > send-booking-email > Settings >
// Variables and Secrets):
//   EMAILJS_SERVICE_ID            (plain text) optional - defaults to EMAILJS_DEFAULTS
//   EMAILJS_PUBLIC_KEY            (plain text) optional - defaults to EMAILJS_DEFAULTS
//   EMAILJS_PRIVATE_KEY           (SECRET)     Account > General > Private Key
//   EMAILJS_CONTACT_TEMPLATE_ID   (plain text) optional - defaults to EMAILJS_DEFAULTS
//   EMAILJS_BOOKING_TEMPLATE_ID   (plain text) template for bookings (optional)
// and in EmailJS, Account > Security > "Allow EmailJS API for non-browser
// applications" must be ON.
//
// Template variables are escaped by EmailJS when used as {{name}}, so
// visitor-supplied text can't inject markup into the email.
async function sendEmailJS(env, templateVar, templateParams) {
  const setting = (k) => env[k] || EMAILJS_DEFAULTS[k];
  const missing = ['EMAILJS_SERVICE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_PRIVATE_KEY', templateVar].filter((k) => !setting(k));
  if (missing.length) {
    throw new Error(`EmailJS is not configured - missing: ${missing.join(', ')}`);
  }

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: setting('EMAILJS_SERVICE_ID'),
      template_id: setting(templateVar),
      user_id: setting('EMAILJS_PUBLIC_KEY'),
      accessToken: env.EMAILJS_PRIVATE_KEY,
      template_params: {
        // Use {{to_email}} as the template's "To Email" to keep the
        // recipient list here in ADMIN_EMAILS; a fixed address in the
        // template also works and simply ignores this.
        to_email: ADMIN_EMAILS.map((a) => a.email).join(', '),
        ...templateParams,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`EmailJS error: ${response.status} - ${errorText}`);
  }
}
