// Admin-only: manage the public gallery. Photo bytes live in the
// GALLERY_BUCKET R2 bucket; captions/order live under the "gallery" key of
// the same AVAILABILITY KV namespace everything else here uses. The public
// /api/gallery/* routes (no auth) read the same KV entry and R2 bucket to
// render the homepage gallery.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // the admin panel resizes/recompresses before upload; this guards the API directly
const MAX_CAPTION_LENGTH = 200;

async function readGallery(env) {
  const raw = await env.AVAILABILITY.get("gallery");
  return raw ? JSON.parse(raw) : [];
}

export async function onRequestGet(context) {
  const { env } = context;
  const gallery = await readGallery(env);
  const images = gallery.map((item) => ({ ...item, url: `/api/gallery/${item.id}` }));

  return new Response(JSON.stringify({ images }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const image = formData.get("image");
  const caption = (formData.get("caption") || "").toString().trim();

  if (!(image instanceof File) || !caption) {
    return new Response(JSON.stringify({ error: "Missing image or caption" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    return new Response(JSON.stringify({ error: "Caption is too long" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return new Response(JSON.stringify({ error: "Image is too large" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const id = crypto.randomUUID();
  const contentType = image.type || "image/jpeg";

  await env.GALLERY_BUCKET.put(id, image.stream(), {
    httpMetadata: { contentType },
  });

  const gallery = await readGallery(env);
  const entry = { id, caption, uploadedAt: new Date().toISOString() };
  gallery.unshift(entry);
  await env.AVAILABILITY.put("gallery", JSON.stringify(gallery));

  return new Response(JSON.stringify({ ...entry, url: `/api/gallery/${id}` }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const gallery = (await readGallery(env)).filter((item) => item.id !== id);
  await env.AVAILABILITY.put("gallery", JSON.stringify(gallery));
  await env.GALLERY_BUCKET.delete(id);

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}
