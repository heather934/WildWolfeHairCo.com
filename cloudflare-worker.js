/**
 * Cloudflare Worker for Zoee's booking system
 * Handles two things:
 *   1. Availability API backed by a KV namespace (shared source of truth for
 *      both the public booking calendar and the admin panel)
 *   2. Sending booking notification emails via MailChannels
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

const ADMIN_EMAILS = [
  { email: 'zoee.burley@yahoo.com', name: 'Zoee Burley' },
  { email: 'h.m.ward1846@gmail.com', name: 'Admin' },
];

// Booking/message fields come straight from site visitors and get
// interpolated into HTML email bodies below - escape them so a name or
// message like `<img src=x onerror=...>` can't inject markup into the
// notification email.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    const emailHtml = buildBookingEmailHTML(bookingData);
    await Promise.all(
      ADMIN_EMAILS.map((admin) =>
        sendEmailViaMailChannels({
          to: admin.email,
          subject: `🎉 New Booking: ${name} - ${date}`,
          html: emailHtml,
          from: { email: 'bookings@wildwolfehaircostyling.com', name: 'Zoee - Bridal Hair Styling' },
        })
      )
    );
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
    const emailHtml = buildContactMessageEmailHTML(messageData);
    await Promise.all(
      ADMIN_EMAILS.map((admin) =>
        sendEmailViaMailChannels({
          to: admin.email,
          subject: `💬 New Contact Message: ${name}`,
          html: emailHtml,
          from: { email: 'bookings@wildwolfehaircostyling.com', name: 'Zoee - Bridal Hair Styling' },
        })
      )
    );
  } catch (emailError) {
    console.error('Message saved but notification email failed:', emailError);
  }

  return jsonResponse({ success: true, message: 'Message sent' }, 200, corsHeaders);
}

async function sendEmailViaMailChannels(data) {
  const {
    to,
    subject,
    html,
    text = '',
    from = { email: 'bookings@zoee-hair.com', name: 'Zoee - Bridal Hair Styling' },
  } = data;

  const endpoint = 'https://api.mailchannels.net/tx/v1/send';

  const toArray = Array.isArray(to) ? to : [{ email: to }];

  const payload = {
    personalizations: [{ to: toArray }],
    from: typeof from === 'string' ? { email: from } : from,
    subject,
    content: [{ type: 'text/html', value: html }],
  };

  if (text) {
    payload.content.push({ type: 'text/plain', value: text });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MailChannels error: ${response.status} - ${errorText}`);
  }

  return {
    success: true,
    message: 'Email sent successfully',
    timestamp: new Date().toISOString(),
  };
}

function buildBookingEmailHTML(bookingData) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Lato', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f3f0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #d4af37;
        }
        .header h1 {
            color: #6b7e5b;
            margin: 0;
            font-size: 28px;
        }
        .header p {
            color: #a8b8a8;
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        .booking-details {
            background-color: #f5f3f0;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 25px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7e5b;
            width: 40%;
        }
        .detail-value {
            color: #333;
            width: 60%;
            text-align: right;
        }
        .message-section {
            margin-top: 25px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
        }
        .message-section h3 {
            color: #6b7e5b;
            margin: 0 0 10px 0;
            font-size: 16px;
        }
        .message-text {
            color: #666;
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #d4af37;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #999;
            font-size: 12px;
        }
        .action-button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background-color: #6b7e5b;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            text-align: center;
        }
        .action-button:hover {
            background-color: #5a6f4c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 New Booking!</h1>
            <p>A client has requested a booking appointment</p>
        </div>

        <div class="booking-details">
            <div class="detail-row">
                <span class="detail-label">👤 Client Name:</span>
                <span class="detail-value"><strong>${escapeHtml(bookingData.name)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📧 Email:</span>
                <span class="detail-value"><strong>${escapeHtml(bookingData.email)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📱 Phone:</span>
                <span class="detail-value"><strong>${escapeHtml(bookingData.phone)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📅 Booking Date:</span>
                <span class="detail-value"><strong>${escapeHtml(bookingData.date)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">🎯 Service:</span>
                <span class="detail-value"><strong>${escapeHtml(bookingData.service)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">⏰ Submitted:</span>
                <span class="detail-value"><strong>${bookingData.bookingDate}</strong></span>
            </div>
        </div>

        ${bookingData.message ? `
        <div class="message-section">
            <h3>📝 Client's Message:</h3>
            <div class="message-text">
                ${escapeHtml(bookingData.message).replace(/\n/g, '<br>')}
            </div>
        </div>
        ` : ''}

        <div style="text-align: center;">
            <a href="https://wildwolfehairco.com/admin.html" class="action-button">View in Admin Panel</a>
        </div>

        <div class="footer">
            <p>This is an automated booking notification from Zoee's Bridal Hair Styling website.</p>
            <p>© 2026 Zoee - Bridal Hair Styling. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
}

function buildContactMessageEmailHTML(messageData) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Lato', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f3f0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #d4af37;
        }
        .header h1 {
            color: #6b7e5b;
            margin: 0;
            font-size: 28px;
        }
        .details {
            background-color: #f5f3f0;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 25px;
        }
        .detail-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
            border-bottom: none;
        }
        .detail-label {
            font-weight: 600;
            color: #6b7e5b;
            width: 40%;
        }
        .detail-value {
            color: #333;
            width: 60%;
            text-align: right;
        }
        .message-text {
            color: #666;
            background-color: #f9f9f9;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #d4af37;
            margin-top: 20px;
        }
        .action-button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background-color: #6b7e5b;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            text-align: center;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            color: #999;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💬 New Contact Message</h1>
            <p>Someone reached out through the website contact form</p>
        </div>

        <div class="details">
            <div class="detail-row">
                <span class="detail-label">👤 Name:</span>
                <span class="detail-value"><strong>${escapeHtml(messageData.name)}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📧 Email:</span>
                <span class="detail-value"><strong>${escapeHtml(messageData.email)}</strong></span>
            </div>
            ${messageData.phone ? `
            <div class="detail-row">
                <span class="detail-label">📱 Phone:</span>
                <span class="detail-value"><strong>${escapeHtml(messageData.phone)}</strong></span>
            </div>
            ` : ''}
            ${messageData.weddingDate ? `
            <div class="detail-row">
                <span class="detail-label">💍 Wedding Date:</span>
                <span class="detail-value"><strong>${escapeHtml(messageData.weddingDate)}</strong></span>
            </div>
            ` : ''}
        </div>

        ${messageData.message ? `<div class="message-text">${escapeHtml(messageData.message).replace(/\n/g, '<br>')}</div>` : ''}

        <div style="text-align: center;">
            <a href="https://wildwolfehairco.com/admin.html" class="action-button">View in Admin Panel</a>
        </div>

        <div class="footer">
            <p>This is an automated notification from Zoee's Bridal Hair Styling website.</p>
            <p>© 2026 Zoee - Bridal Hair Styling. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
}
