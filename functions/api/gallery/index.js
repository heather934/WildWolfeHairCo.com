// Public: list gallery photos for the homepage. Read-only, no auth - this
// is the same "gallery" KV entry functions/api/admin/gallery.js manages,
// exposed without the internal fields admins don't need to see publicly.

export async function onRequestGet(context) {
  const { env } = context;
  const raw = await env.AVAILABILITY.get("gallery");
  const gallery = raw ? JSON.parse(raw) : [];
  const images = gallery.map(({ id, caption }) => ({ id, caption, url: `/api/gallery/${id}` }));

  return new Response(JSON.stringify({ images }), {
    headers: { "content-type": "application/json" },
  });
}
