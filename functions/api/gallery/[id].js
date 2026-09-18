// Public: stream a single gallery photo's bytes straight from R2. No auth -
// these are the same photos rendered in the homepage gallery grid.

export async function onRequestGet(context) {
  const { env, params } = context;
  const object = await env.GALLERY_BUCKET.get(params.id);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
