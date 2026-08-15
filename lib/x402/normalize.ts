// URL normalization: this is the dedupe key for the whole registry, so changes here
// can silently fork endpoint identities. Lowercase scheme+host, drop default ports and
// fragments, strip trailing slash, keep path case and query string.

export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  const scheme = u.protocol.toLowerCase(); // includes ':'
  let host = u.hostname.toLowerCase();
  const port = u.port;
  const isDefault =
    (scheme === "https:" && (port === "" || port === "443")) ||
    (scheme === "http:" && (port === "" || port === "80"));
  if (!isDefault && port) host += `:${port}`;
  const path = u.pathname.replace(/\/+$/, "");
  const query = u.search; // keep as-is
  return `${scheme}//${host}${path}${query}`;
}
