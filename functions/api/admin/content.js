// Admin-only: read/save the site's public-facing contact info (email,
// phone, location, social links) shown on the homepage. Shares the
// "siteContact" KV key with the public /api/site-content endpoint, which
// the homepage reads from directly.

const FIELDS = ["email", "phone", "location", "responseMessage", "instagram", "facebook", "pinterest"];

async function readContact(env) {
  const raw = await env.AVAILABILITY.get("siteContact");
  return raw ? JSON.parse(raw) : {};
}

export async function onRequestGet(context) {
  const { env } = context;
  const contact = await readContact(env);

  return new Response(JSON.stringify({ contact }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return new Response(JSON.stringify({ error: "Invalid email address" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const contact = {};
  for (const field of FIELDS) {
    contact[field] = typeof data[field] === "string" ? data[field].trim() : "";
  }

  await env.AVAILABILITY.put("siteContact", JSON.stringify(contact));

  return new Response(JSON.stringify({ success: true, contact }), {
    headers: { "content-type": "application/json" },
  });
}
