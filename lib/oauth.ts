export function buildGoogleAuthUrl(): URL {
  const state = globalThis.crypto.randomUUID();
  // Store state in a cookie for CSRF.
  document.cookie = `faceiq_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax`;
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URL;
  u.searchParams.set("client_id", clientId ?? "");
  u.searchParams.set("redirect_uri", redirectUri ?? "");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  return u;
}
