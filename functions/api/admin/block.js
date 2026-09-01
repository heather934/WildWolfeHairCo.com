// Admin-only: block/unblock a date. Shares the same KV keys
// ("blockedDates") that the public booking Worker reads from, so a date
// blocked here is immediately unavailable on the public calendar.

async function readDateList(env, key) {
  const raw = await env.AVAILABILITY.get(key);
  return raw ? JSON.parse(raw) : [];
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const data = await request.json();
  const date = data.date;

  if (!date) {
    return new Response(JSON.stringify({ error: "Missing date" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const blockedDates = await readDateList(env, "blockedDates");
  if (!blockedDates.includes(date)) {
    blockedDates.push(date);
    await env.AVAILABILITY.put("blockedDates", JSON.stringify(blockedDates));
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const date = new URL(request.url).searchParams.get("date");

  if (!date) {
    return new Response(JSON.stringify({ error: "Missing date" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const blockedDates = (await readDateList(env, "blockedDates")).filter((d) => d !== date);
  await env.AVAILABILITY.put("blockedDates", JSON.stringify(blockedDates));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}
