// api.js — the only way the web pages talk to the server.
// Wraps fetch(): sends/receives JSON and turns server errors into JS errors
// with `.kind` (e.g. "taken", "duplicate") and a friendly `.message`.
export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("We couldn't reach the server. Please check your connection and try again."), { kind: "network" });
  }

  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    throw Object.assign(new Error(data.message || `Request failed (${res.status})`), {
      kind: data.error || "server",
      status: res.status,
    });
  }
  return data;
}
