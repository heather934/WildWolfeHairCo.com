// Admin-only: remove a booking. Shares the same "bookedDates" KV key the
// public booking Worker writes to, so removing a booking here immediately
// frees that date back up on the public calendar.

export async function onRequestDelete(context) {
  const { request, env } = context;
  const date = new URL(request.url).searchParams.get("date");

  if (!date) {
    return new Response(JSON.stringify({ error: "Missing date" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const raw = await env.AVAILABILITY.get("bookedDates");
  const bookedDates = (raw ? JSON.parse(raw) : []).filter((d) => d !== date);
  await env.AVAILABILITY.put("bookedDates", JSON.stringify(bookedDates));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}
