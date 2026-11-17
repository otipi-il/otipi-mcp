// @ts-check
// Minimal Otipi HTTP client. The API key is read from env and never logged.

const TIMEOUT_MS = 15000;

export function getKey() {
  return (process.env.OTIPI_KEY || process.env.OTIPI_API_KEY || '').trim();
}

export function getBaseUrl() {
  return (process.env.OTIPI_BASE_URL || 'https://otipi.co.il').replace(/\/+$/, '');
}

export class OtipiHttpError extends Error {
  /**
   * @param {number} status HTTP status, 0 for network errors
   * @param {string} code
   * @param {string} message
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {'GET'|'POST'} method
 * @param {string} path path under /v1, starting with a slash
 * @param {object} [body]
 * @returns {Promise<any>} parsed JSON body of a 2xx response
 */
export async function api(method, path, body) {
  const key = getKey();
  if (!key) throw new OtipiHttpError(0, 'missing_key', 'OTIPI_KEY is not set');
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/json' };
  /** @type {RequestInit} */
  const init = { method, headers, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`${getBaseUrl()}/v1${path}`, init);
  } catch (err) {
    const e = /** @type {any} */ (err);
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new OtipiHttpError(0, 'timeout', `Request timed out after ${TIMEOUT_MS / 1000}s`);
    }
    throw new OtipiHttpError(0, 'network_error', `Could not reach Otipi at ${getBaseUrl()}: ${e && e.message}`);
  }
  const raw = await res.text();
  /** @type {any} */
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const code = (data && data.error && data.error.code) || `http_${res.status}`;
    const message = (data && data.error && data.error.message) || `HTTP ${res.status}`;
    throw new OtipiHttpError(res.status, code, message);
  }
  return data;
}
