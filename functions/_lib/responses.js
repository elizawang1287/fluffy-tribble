export const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "permissions-policy": "microphone=(self), camera=(), geolocation=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
};

export function jsonResponse(status, body, { cacheControl = "no-store", headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": cacheControl,
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders,
      ...headers,
    },
  });
}

export function methodNotAllowed(allowed) {
  return jsonResponse(405, {
    error: { code: "METHOD_NOT_ALLOWED", message: "此接口不支持当前请求方式。" },
  }, { headers: { allow: allowed.join(", ") } });
}

export async function readJson(request, maxBytes = 32_000) {
  const declaredLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Object.assign(new Error("too large"), { status: 413 });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error("too large"), { status: 413 });
  }
  return JSON.parse(text);
}
