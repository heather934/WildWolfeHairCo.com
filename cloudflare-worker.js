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
 * API:
 *   GET    /availability        -> { bookedDates: string[], blockedDates: string[] }
 *   POST   /availability/book   -> body: { date, name, email, phone, service, message }
 *   DELETE /availability/book?date=YYYY-MM-DD
 *   POST   /availability/block  -> body: { date, reason }
 *   DELETE /availability/block?date=YYYY-MM-DD
 *   POST   /                    -> legacy generic email send: { to, subject, html, text?, from? }
 *
 * NOTE: The /availability/block and DELETE endpoints are meant for the admin
 * panel and are NOT currently authenticated - anyone who knows the worker
 * URL could call them directly. Add real authentication (e.g. a shared
 * admin key checked against an env var, or Cloudflare Access in front of
 * admin.html) before relying on this for a real business.
 */

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
        return await handleBookDate(data, env, corsHeaders);
      }

      if (url.pathname === '/availability/book' && request.method === 'DELETE') {
        return await handleRemoveBooking(url.searchParams.get('date'), env, corsHeaders);
      }

      if (url.pathname === '/availability/block' && request.method === 'POST') {
        const data = await request.json();
        return await handleBlockDate(data, env, corsHeaders);
      }

      if (url.pathname === '/availability/block' && request.method === 'DELETE') {
        return await handleRemoveBlocked(url.searchParams.get('date'), env, corsHeaders);
      }

      if (request.method === 'POST') {
        const data = await request.json();

        if (!data.to || !data.subject || !data.html) {
          return jsonResponse(
            { error: 'Missing required fields: to, subject, html' },
            400,
            corsHeaders
          );
        }

        const result = await sendEmailViaMailChannels(data);
        return jsonResponse(result, 200, corsHeaders);
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

async function handleBookDate(data, env, corsHeaders) {
  const { date, name, email, phone, service, message } = data;

  if (!date || !name || !email || !service) {
    return jsonResponse({ error: 'Missing required booking fields' }, 400, corsHeaders);
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

async function handleRemoveBooking(date, env, corsHeaders) {
  if (!date) {
    return jsonResponse({ error: 'Missing date' }, 400, corsHeaders);
  }

  const bookedDates = (await readDateList(env, 'bookedDates')).filter((d) => d !== date);
  await env.AVAILABILITY.put('bookedDates', JSON.stringify(bookedDates));
  return jsonResponse({ success: true }, 200, corsHeaders);
}

async function handleBlockDate(data, env, corsHeaders) {
  const { date } = data;
  if (!date) {
    return jsonResponse({ error: 'Missing date' }, 400, corsHeaders);
  }

  const blockedDates = await readDateList(env, 'blockedDates');
  if (!blockedDates.includes(date)) {
    blockedDates.push(date);
    await env.AVAILABILITY.put('blockedDates', JSON.stringify(blockedDates));
  }

  return jsonResponse({ success: true }, 200, corsHeaders);
}

async function handleRemoveBlocked(date, env, corsHeaders) {
  if (!date) {
    return jsonResponse({ error: 'Missing date' }, 400, corsHeaders);
  }

  const blockedDates = (await readDateList(env, 'blockedDates')).filter((d) => d !== date);
  await env.AVAILABILITY.put('blockedDates', JSON.stringify(blockedDates));
  return jsonResponse({ success: true }, 200, corsHeaders);
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
                <span class="detail-value"><strong>${bookingData.name}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📧 Email:</span>
                <span class="detail-value"><strong>${bookingData.email}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📱 Phone:</span>
                <span class="detail-value"><strong>${bookingData.phone}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📅 Booking Date:</span>
                <span class="detail-value"><strong>${bookingData.date}</strong></span>
            </div>
            <div class="detail-row">
                <span class="detail-label">🎯 Service:</span>
                <span class="detail-value"><strong>${bookingData.service}</strong></span>
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
                ${bookingData.message.replace(/\n/g, '<br>')}
            </div>
        </div>
        ` : ''}

        <div style="text-align: center;">
            <a href="https://wildwolfehairco-com.pages.dev/admin.html" class="action-button">View in Admin Panel</a>
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
