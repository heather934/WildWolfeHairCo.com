/**
 * Cloudflare Pages Functions middleware — guards every route in the folder
 * it's placed in (Pages convention: `_middleware.js` applies to its own
 * directory and everything under it), i.e. everything under `/api/admin/*`.
 *
 * This is the SECOND layer of defense, independent of Cloudflare Access
 * sitting in front of the route. Access is the primary lock; this file
 * means the API stays shut even if that lock is ever accidentally removed
 * or misconfigured — it verifies the signed token on every request itself,
 * rather than assuming Access already checked it.
 *
 * Required environment variables (set on the Pages project):
 *   ACCESS_TEAM_DOMAIN  e.g. underpressureadminlogin.cloudflareaccess.com
 *   ACCESS_AUD          the Access application's Audience (AUD) tag
 *   ADMIN_EMAIL          allowed email(s) — comma-separated for more than one
 */

let certCache = { keys: null, fetchedAt: 0 };
const CERT_TTL_MS = 60 * 60 * 1000; // 1 hour — Access rotates keys infrequently

function b64urlToBytes(input) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function b64urlToJson(input) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(input)));
}

async function getCerts(teamDomain) {
  const now = Date.now();
  if (certCache.keys && now - certCache.fetchedAt < CERT_TTL_MS) {
    return certCache.keys;
  }
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not fetch Access certificates");
  const data = await res.json();
  certCache = { keys: data.keys || [], fetchedAt: now };
  return certCache.keys;
}

async function verifyAccessToken(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = b64urlToJson(headerB64);
  const payload = b64urlToJson(payloadB64);

  // Expiry
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    throw new Error("Token expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) {
    throw new Error("Token not yet valid");
  }

  // Audience must match this specific Access application — not just any
  // valid Access token from the same Cloudflare account.
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) {
    throw new Error("Token audience mismatch");
  }

  // Issuer must be this team's own Access domain
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) {
    throw new Error("Token issuer mismatch");
  }

  // Signature — verified against Access's own public keys, no shared
  // secret needed since this is standard RS256 JWT verification.
  const keys = await getCerts(env.ACCESS_TEAM_DOMAIN);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("Signing key not found");

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    b64urlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) throw new Error("Bad signature");

  return payload;
}

function deny(message, status = 403) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Defense-in-depth against CSRF: the Access session cookie rides along on
// any cross-site request automatically, so a state-changing request
// (anything but GET) must also show it actually originated from this site.
// A forged request from another page won't carry a matching Origin header.
function originIsTrusted(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return true; // same-origin browser requests often omit Origin
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env, next } = context;

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL) {
    return deny("Admin access is not configured yet.");
  }

  if (request.method !== "GET" && !originIsTrusted(request)) {
    return deny("That request didn't come from this site.");
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("CF_Authorization="))
      ?.slice("CF_Authorization=".length);

  if (!token) return deny("Not signed in.");

  let payload;
  try {
    payload = await verifyAccessToken(token, env);
  } catch (err) {
    return deny("Sign-in could not be verified.");
  }

  const allowed = env.ADMIN_EMAIL.split(",").map((e) => e.trim().toLowerCase());
  const email = (payload.email || "").toLowerCase();
  if (!allowed.includes(email)) return deny("This account is not allowed in.");

  context.data.adminEmail = email;
  return next();
}
