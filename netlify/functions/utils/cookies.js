const { TOKEN_EXPIRATION, EXTENDED_TOKEN_EXPIRATION } = require('./jwt');

/**
 * Parse cookies from request header
 * @param {String} cookieHeader - Cookie header string
 * @returns {Object} Parsed cookies as key-value pairs
 */
function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((cookies, cookie) => {
    const [name, value] = cookie.trim().split('=');
    cookies[name] = value;
    return cookies;
  }, {});
}

/**
 * Get token from cookie header
 * @param {Object} headers - Request headers object
 * @returns {String|null} JWT token or null
 */
function getTokenFromCookie(headers) {
  const cookieHeader = headers.cookie || headers.Cookie;
  const cookies = parseCookies(cookieHeader);
  return cookies.token || null;
}

/**
 * Create Set-Cookie header string for JWT token
 * @param {String} token - JWT token
 * @param {Boolean} rememberMe - If true, use extended expiration (90 days)
 * @returns {String} Set-Cookie header value
 */
function createAuthCookie(token, rememberMe = false) {
  const maxAge = rememberMe ? EXTENDED_TOKEN_EXPIRATION : TOKEN_EXPIRATION;
  return `token=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`;
}

/**
 * Create Set-Cookie header to clear auth cookie
 * @returns {String} Set-Cookie header value that clears the token
 */
function clearAuthCookie() {
  return `token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`;
}

module.exports = {
  parseCookies,
  getTokenFromCookie,
  createAuthCookie,
  clearAuthCookie
};
