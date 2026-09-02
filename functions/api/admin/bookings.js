// Admin-only: read full booking details (name/email/phone/message), not
// just the booked date strings the public /availability endpoint exposes.
// Shares the "bookings" KV key the public booking Worker writes to.

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.AVAILABILITY.get("bookings");
  const bookings = raw ? JSON.parse(raw) : [];

  return new Response(JSON.stringify({ bookings }), {
    headers: { "content-type": "application/json" },
  });
}
