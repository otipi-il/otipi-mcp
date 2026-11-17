// @ts-check
// Errors of the Otipi MCP tools and how they are explained to the agent.
// Shared as is by the npm package (stdio) and the Otipi service (/mcp over HTTP): keep the copies the same.

export class ToolError extends Error {}

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

/** Hints keyed by API error code. */
const HINTS = {
  test_key_required: 'This action only works with a test key (sk_test_...). You are using a live key.',
  too_many_test_recipients: 'The account reached the limit of test recipients. Ask the human to remove one in the Otipi dashboard.',
  invalid_recipient: 'The recipient is not valid. Use an Israeli mobile number like +972501234567 or a valid email address.',
  rate_limited: 'Too many requests. Wait a minute and try again.',
  test_mode_busy: 'Test mode is busy right now. Retry in a few seconds.',
  not_found: 'Nothing pending for this recipient. Call add_test_recipient first.',
  wrong_code: 'The code is wrong. Ask the human to re-check the code they received.',
  code_expired: 'The code expired. Call add_test_recipient again to get a new one.',
  too_many_attempts: 'Too many wrong attempts. Wait a few minutes, then call add_test_recipient again.',
  free_test_sms_used:
    'The 5 free test SMS of this account are used up. Use the email channel, reuse test_code from earlier sends, or subscribe at https://otipi.co.il to get a live key.',
  too_many_codes: 'Too many codes were requested for this number. Wait a few minutes before sending another.',
  subscription_required: 'Live keys need an active monthly subscription. Use a free test key (sk_test_) to try things, or subscribe in the Otipi dashboard.',
  unauthorized: 'The API key was rejected. It must start with sk_test_ or sk_live_ and must not be revoked.',
  invalid_api_key: 'The API key was rejected. It must start with sk_test_ or sk_live_ and must not be revoked.',
};

/**
 * @param {unknown} err
 * @param {string} [signupHelp] what to say when there is no key at all
 * @returns {string}
 */
export function explainError(err, signupHelp = '') {
  if (err instanceof ToolError) return err.message;
  if (err instanceof OtipiHttpError) {
    if (err.code === 'missing_key') return signupHelp || err.message;
    const hint = /** @type {Record<string,string>} */ (HINTS)[err.code] || (err.status === 401 ? HINTS.unauthorized : '');
    const head = err.status ? `Otipi API error ${err.status} ${err.code}: ${err.message}` : `${err.code}: ${err.message}`;
    return hint ? `${head}\n${hint}` : head;
  }
  return `Unexpected error: ${err instanceof Error ? err.message : String(err)}`;
}
