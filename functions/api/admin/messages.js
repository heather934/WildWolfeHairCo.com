// Admin-only: read/delete/mark-read contact form messages. Shares the
// "contactMessages" KV key the public booking Worker's /messages route
// writes to when a visitor submits the homepage contact form.

async function readMessages(env) {
  const raw = await env.AVAILABILITY.get("contactMessages");
  return raw ? JSON.parse(raw) : [];
}

export async function onRequestGet(context) {
  const { env } = context;
  const messages = await readMessages(env);

  return new Response(JSON.stringify({ messages }), {
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

  const messages = (await readMessages(env)).filter((m) => m.id !== id);
  await env.AVAILABILITY.put("contactMessages", JSON.stringify(messages));

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const id = new URL(request.url).searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = await readMessages(env);
  const message = messages.find((m) => m.id === id);
  if (message) {
    message.read = true;
    await env.AVAILABILITY.put("contactMessages", JSON.stringify(messages));
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}
