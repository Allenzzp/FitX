const { getTokenFromCookie } = require('./cookies');
const { verifyToken } = require('./jwt');

/**
 * Extract and verify userId from JWT cookie in request headers
 * @param {Object} headers - Request headers object
 * @returns {Number|null} userId or null if not authenticated
 */
function getUserIdFromRequest(headers) {
  try {
    // Get token from cookie
    const token = getTokenFromCookie(headers);

    if (!token) {
      return null;
    }

    // Verify and decode token
    const decoded = verifyToken(token);

    if (!decoded || typeof decoded.userId !== 'number') {
      return null;
    }

    return decoded.userId;
  } catch (error) {
    console.error('Error extracting userId from request:', error);
    return null;
  }
}

/**
 * Middleware to require authentication
 * Returns error response if not authenticated, otherwise returns userId
 * @param {Object} headers - Request headers object
 * @returns {Object} { userId: Number } or { error: Object }
 */
function requireAuth(headers) {
  const userId = getUserIdFromRequest(headers);

  if (userId === null) {
    return {
      error: {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Authentication required' })
      }
    };
  }

  return { userId };
}

module.exports = {
  getUserIdFromRequest,
  requireAuth
};
