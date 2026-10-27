// ============================================================================
// serviceValidator.js — Robust URL Validation, SSRF Prevention & Service Verifier
// ============================================================================

const dns = require('dns').promises;
const net = require('net');

/**
 * Standard allowed web ports for microservice monitoring.
 * Disallows arbitrary ports (e.g. 22 SSH, 25 SMTP, 3306 MySQL, 6379 Redis).
 */
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443', '3000', '5000', '6001']);

/**
 * Known placeholder, dummy, or internal hostnames that must not be added.
 */
const RESTRICTED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.internal',
  'instance-data',
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'foo.bar',
  'placeholder.com',
  'fake.com',
  'dummy.com',
]);

/**
 * Reserved, internal, or test top-level domains.
 */
const RESTRICTED_TLDS = [
  '.example',
  '.invalid',
  '.test',
  '.localhost',
  '.local',
  '.internal',
  '.arpa',
  '.lan',
  '.home',
  '.corp',
];

const MAX_REDIRECTS = 3;
const VERIFY_TIMEOUT_MS = 5000;

/**
 * Checks whether an IP address belongs to private, loopback, link-local,
 * cloud metadata, or other non-routable internal ranges.
 *
 * Covers IPv4:
 *   - 0.0.0.0/8 (Current network)
 *   - 10.0.0.0/8 (Private RFC 1918)
 *   - 100.64.0.0/10 (Carrier-grade NAT RFC 6598)
 *   - 127.0.0.0/8 (Loopback RFC 1122)
 *   - 169.254.0.0/16 (Link-local RFC 3927 / cloud metadata 169.254.169.254)
 *   - 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
 *   - 192.0.0.0/24 (IETF assignments)
 *   - 192.0.2.0/24 (TEST-NET-1)
 *   - 192.168.0.0/16 (Private RFC 1918)
 *   - 198.18.0.0/15 (Benchmarking)
 *   - 198.51.100.0/24 (TEST-NET-2)
 *   - 203.0.113.0/24 (TEST-NET-3)
 *   - 224.0.0.0/4 (Multicast)
 *   - 240.0.0.0/4 (Reserved)
 *   - 255.255.255.255 (Broadcast)
 *
 * Covers IPv6:
 *   - ::/128 (Unspecified)
 *   - ::1/128 (Loopback)
 *   - ::ffff:0:0/96 (IPv4-mapped IPv6)
 *   - fe80::/10 (Link-local)
 *   - fc00::/7 (Unique Local Address ULA)
 *   - ff00::/8 (Multicast)
 *   - 2001:db8::/32 (Documentation)
 *   - 100::/64 (Discard)
 *
 * @param {string} ip
 * @returns {boolean}
 */
function isPrivateOrRestrictedIp(ip) {
  if (!ip || typeof ip !== 'string') return true;
  const version = net.isIP(ip.trim());
  if (!version) return false;

  const cleanIp = ip.trim();

  if (version === 4) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    const [p0, p1, p2] = parts;

    // 0.0.0.0/8
    if (p0 === 0) return true;
    // 10.0.0.0/8
    if (p0 === 10) return true;
    // 100.64.0.0/10 (CGNAT)
    if (p0 === 100 && (p1 & 0xc0) === 64) return true;
    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return true;
    // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (p0 === 169 && p1 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
    // 192.0.0.0/24
    if (p0 === 192 && p1 === 0 && p2 === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (p0 === 192 && p1 === 0 && p2 === 2) return true;
    // 192.168.0.0/16 (Private)
    if (p0 === 192 && p1 === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (p0 === 198 && (p1 === 18 || p1 === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (p0 === 198 && p1 === 51 && p2 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (p0 === 203 && p1 === 0 && p2 === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (p0 >= 224 && p0 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (p0 >= 240) return true;

    return false;
  }

  if (version === 6) {
    const lower = cleanIp.toLowerCase();

    // Loopback / unspecified
    if (lower === '::' || lower === '::1' || lower === '0:0:0:0:0:0:0:1' || lower === '0:0:0:0:0:0:0:0') {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1, etc.)
    if (lower.startsWith('::ffff:')) {
      const v4Part = lower.slice(7);
      if (net.isIPv4(v4Part)) {
        return isPrivateOrRestrictedIp(v4Part);
      }
    }

    // Link-local fe80::/10
    if (/^fe[89ab]/i.test(lower)) return true;

    // Unique Local Address ULA fc00::/7 (fc00:: & fd00::)
    if (/^f[cd]/i.test(lower)) return true;

    // Multicast ff00::/8
    if (lower.startsWith('ff')) return true;

    // Documentation 2001:db8::/32
    if (lower.startsWith('2001:db8:') || lower.startsWith('2001:0db8:')) return true;

    // Discard 100::/64
    if (lower.startsWith('100::')) return true;

    return false;
  }

  return false;
}

/**
 * Validates the syntax, structure, protocol, and hostname of a URL.
 * Does NOT perform network calls.
 *
 * @param {string} rawUrl
 * @returns {{ ok: boolean, error?: string, parsed?: URL }}
 */
function validateUrlStructure(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
  }

  const trimmed = rawUrl.trim();

  // Basic sanity check before parsing
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
  }

  // Must be http: or https:
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
  }

  // Disallow user:pass credentials in URL
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with embedded authentication credentials are not permitted.' };
  }

  const hostname = parsed.hostname ? parsed.hostname.toLowerCase().trim() : '';
  if (!hostname) {
    return { ok: false, error: 'Please enter a valid HTTP or HTTPS URL.' };
  }

  // Hostname length validation (RFC 1035)
  if (hostname.length > 253) {
    return { ok: false, error: 'Hostname exceeds maximum allowed length.' };
  }

  // Check port restrictions
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { ok: false, error: 'This URL uses a restricted or unsupported port.' };
  }

  // Direct IP literal check
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      return { ok: false, error: 'This URL points to a restricted or internal network address.' };
    }
    return { ok: true, parsed };
  }

  // Obvious placeholder / internal hostname check
  if (RESTRICTED_HOSTNAMES.has(hostname)) {
    if (
      hostname.includes('example') ||
      hostname.includes('test') ||
      hostname.includes('fake') ||
      hostname.includes('dummy') ||
      hostname.includes('foo.bar')
    ) {
      return { ok: false, error: 'Please enter a real service URL, not a placeholder.' };
    }
    return { ok: false, error: 'This URL points to a restricted or internal network address.' };
  }

  // Restricted TLD check
  for (const tld of RESTRICTED_TLDS) {
    if (hostname.endsWith(tld)) {
      return { ok: false, error: 'This URL points to a restricted or internal network address.' };
    }
  }

  // Single-word hostnames (no dot, e.g. "localhost", "nas", "router", "myserver")
  if (!hostname.includes('.')) {
    return { ok: false, error: 'This URL points to a restricted or internal network address.' };
  }

  return { ok: true, parsed };
}

/**
 * Resolves hostname via DNS and checks all returned IP addresses for SSRF risks.
 *
 * @param {string} hostname
 * @returns {Promise<{ ok: boolean, error?: string, addresses?: string[] }>}
 */
async function resolveAndVerifyDns(hostname) {
  // If hostname is already an IP address
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      return { ok: false, error: 'This URL points to a restricted or internal network address.' };
    }
    return { ok: true, addresses: [hostname] };
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { ok: false, error: 'This domain could not be found. Please check the URL.' };
    }

    for (const record of records) {
      if (isPrivateOrRestrictedIp(record.address)) {
        return { ok: false, error: 'This URL points to a restricted or internal network address.' };
      }
    }

    return { ok: true, addresses: records.map((r) => r.address) };
  } catch (err) {
    const code = err.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { ok: false, error: 'This domain could not be found. Please check the URL.' };
    }
    if (code === 'EAI_AGAIN') {
      return { ok: false, error: 'The service could not be reached. Please try again later.' };
    }
    return { ok: false, error: 'This domain could not be found. Please check the URL.' };
  }
}

/**
 * Performs actual HTTP/HTTPS network connectivity check against user-supplied URL.
 * Enforces SSRF protection, redirect revalidation, timeouts, and bounded payload handling.
 *
 * @param {string} rawUrl
 * @param {object} [options]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.hop]
 * @returns {Promise<{ ok: boolean, error?: string, normalizedUrl?: string, httpStatus?: number, latencyMs?: number }>}
 */
async function verifyServiceUrl(rawUrl, options = {}) {
  const hop = options.hop || 0;
  const timeoutMs = options.timeoutMs || VERIFY_TIMEOUT_MS;

  if (hop > MAX_REDIRECTS) {
    return { ok: false, error: 'Too many redirects encountered while verifying the service.' };
  }

  // 1. Structural URL validation
  const structCheck = validateUrlStructure(rawUrl);
  if (!structCheck.ok) {
    return structCheck;
  }
  const parsed = structCheck.parsed;

  // 2. DNS & SSRF validation
  const dnsCheck = await resolveAndVerifyDns(parsed.hostname);
  if (!dnsCheck.ok) {
    return dnsCheck;
  }

  // 3. Live HTTP/HTTPS connectivity check
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(parsed.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'PulseTrace-Monitor/1.0 (+https://pulsetrace.io)',
        'Accept': '*/*',
      },
      redirect: 'manual', // Enforce manual redirect handling to revalidate destination
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    // Immediately cancel response body stream to avoid downloading large files
    if (response.body && typeof response.body.cancel === 'function') {
      response.body.cancel().catch(() => {});
    }

    // 4. Handle redirects safely by revalidating target URL
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        let redirectTarget;
        try {
          redirectTarget = new URL(location, parsed.href).href;
        } catch {
          return { ok: false, error: 'Service returned an invalid redirect URL.' };
        }

        // Recursively revalidate redirect target against all security rules
        return await verifyServiceUrl(redirectTarget, { ...options, hop: hop + 1 });
      }
    }

    // Any HTTP response (status 100-599) proves the HTTP server exists and responded!
    // Statuses like 401, 403, 404, 500 still prove the service is reachable.
    return {
      ok: true,
      normalizedUrl: parsed.href,
      httpStatus: response.status,
      latencyMs,
    };
  } catch (err) {
    clearTimeout(timer);

    if (err.name === 'AbortError') {
      return { ok: false, error: 'The service could not be reached. Please try again later.' };
    }

    const code = err.cause?.code || err.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { ok: false, error: 'This domain could not be found. Please check the URL.' };
    }
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      return { ok: false, error: 'The service could not be reached. Please try again later.' };
    }
    if (code === 'ECONNREFUSED') {
      return {
        ok: false,
        error: 'The service could not be reached (connection refused). Please verify the server is running.',
      };
    }
    if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
      return { ok: false, error: 'The service could not be reached. Please try again later.' };
    }
    if (
      err.message &&
      (err.message.includes('certificate') ||
        err.message.includes('SSL') ||
        err.message.includes('TLS') ||
        err.message.includes('DEPTH_ZERO_SELF_SIGNED_CERT'))
    ) {
      return { ok: false, error: 'SSL/TLS certificate verification failed for this service URL.' };
    }

    return { ok: false, error: 'The service could not be reached. Please try again later.' };
  }
}

module.exports = {
  isPrivateOrRestrictedIp,
  validateUrlStructure,
  resolveAndVerifyDns,
  verifyServiceUrl,
  ALLOWED_PORTS,
  RESTRICTED_HOSTNAMES,
};
