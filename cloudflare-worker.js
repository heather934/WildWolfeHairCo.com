/**
 * Cloudflare Worker for sending emails via MailChannels
 * Deploy this worker to your Cloudflare account
 *
 * Setup Instructions:
 * 1. Go to Cloudflare Dashboard > Workers & Pages > Create Application
 * 2. Choose "Create a Worker"
 * 3. Replace the default code with this entire script
 * 4. Name it "send-booking-email"
 * 5. Click "Deploy"
 * 6. Copy the Worker URL (format: https://send-booking-email.yourusername.workers.dev)
 */

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const data = await request.json();

      // Validate required fields
      if (!data.to || !data.subject || !data.html) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
          { status: 400 }
        );
      }

      // Send email via MailChannels
      const result = await sendEmailViaMailChannels(data);

      return new Response(JSON.stringify(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500 }
      );
    }
  },
};

async function sendEmailViaMailChannels(data) {
  const {
    to,
    subject,
    html,
    text = '',
    from = { email: 'bookings@zoee-hair.com', name: 'Zoee - Bridal Hair Styling' },
  } = data;

  const endpoint = 'https://api.mailchannels.net/tx/v1/send';

  // Ensure 'to' is an array
  const toArray = Array.isArray(to) ? to : [{ email: to }];

  const payload = {
    personalizations: [
      {
        to: toArray,
      },
    ],
    from: typeof from === 'string' ? { email: from } : from,
    subject,
    content: [
      {
        type: 'text/html',
        value: html,
      },
    ],
  };

  // Add plain text if provided
  if (text) {
    payload.content.push({
      type: 'text/plain',
      value: text,
    });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
  } catch (error) {
    console.error('MailChannels API error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
