// Public: the homepage's contact email/location/social links, kept in
// sync with the admin panel's Contact Info tab (functions/api/admin/content.js).
// No auth needed - this is exactly the info already shown to every site
// visitor, just no longer hardcoded into index.html.

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.AVAILABILITY.get("siteContact");
  const contact = raw ? JSON.parse(raw) : null;

  return new Response(JSON.stringify({ contact }), {
    headers: { "content-type": "application/json" },
  });
}
