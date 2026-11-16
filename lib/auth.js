// lib/auth.js — staff login with one shared password (ADMIN_PASSWORD).
// After a correct password, the server sets a signed, HttpOnly cookie that
// JavaScript can't read and that expires after 12 hours. Changing
// ADMIN_PASSWORD or SESSION_SECRET in Vercel logs everyone out.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "cm2_admin";
const MAX_AGE_SECONDS = 12 * 60 * 60;

function settings() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password) throw new Error("ADMIN_PASSWORD is not set in Vercel environment variables.");
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters).");
  return { password, secret };
}

function sign(value) {
  const { password, secret } = settings();
  return createHmac("sha256", `${secret}|${password}`).update(value).digest("base64url");
}

function sameText(a, b) {
  // Hash both so the comparison takes the same time whatever the length.
  const h = (s) => createHmac("sha256", "compare").update(String(s)).digest();
  return timingSafeEqual(h(a), h(b));
}

export function checkPassword(attempt) {
  return sameText(attempt ?? "", settings().password);
}

export function loginCookie() {
  const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
  const value = `${expires}.${sign(expires)}`;
  return `${COOKIE}=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}`;
}

export function logoutCookie() {
  return `${COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function isAdmin(request) {
  const header = request.headers.get("cookie") || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!match) return false;
  const [expires, signature] = match.slice(COOKIE.length + 1).split(".");
  if (!expires || !signature) return false;
  if (!sameText(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}
