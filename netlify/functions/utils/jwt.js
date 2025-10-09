const jwt = require('jsonwebtoken');

// JWT secret - should be stored in environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Token expiration: 21 days in seconds (default)
const TOKEN_EXPIRATION = 21 * 24 * 60 * 60; // 1814400 seconds

// Extended token expiration: 90 days in seconds (for "Remember Me")
const EXTENDED_TOKEN_EXPIRATION = 90 * 24 * 60 * 60; // 7776000 seconds

/**
 * Sign a JWT token with user data
 * @param {Object} payload - User data to encode (userId, email, username)
 * @param {Boolean} rememberMe - If true, use extended expiration (90 days)
 * @returns {String} JWT token
 */
function signToken(payload, rememberMe = false) {
  const expiresIn = rememberMe ? EXTENDED_TOKEN_EXPIRATION : TOKEN_EXPIRATION;
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn
  });
}

/**
 * Verify and decode a JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken,
  TOKEN_EXPIRATION,
  EXTENDED_TOKEN_EXPIRATION
};
