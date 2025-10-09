/**
 * Validate email format
 * @param {String} email
 * @returns {Boolean}
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password requirements
 * - Minimum 8 characters
 * - Must contain both letters and numbers
 * @param {String} password
 * @returns {Object} { valid: Boolean, error: String }
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters' };
  }

  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!hasLetter || !hasNumber) {
    return { valid: false, error: 'Password must contain both letters and numbers' };
  }

  return { valid: true };
}

/**
 * Validate username requirements
 * - Max 20 characters
 * - Alphanumeric + underscore/hyphen/period
 * - Must start/end with letter or number
 * - No consecutive special characters
 * @param {String} username
 * @returns {Object} { valid: Boolean, error: String }
 */
function isValidUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }

  if (username.length > 20) {
    return { valid: false, error: 'Username must be 20 characters or less' };
  }

  // Must start and end with alphanumeric
  if (!/^[a-zA-Z0-9]/.test(username) || !/[a-zA-Z0-9]$/.test(username)) {
    return { valid: false, error: 'Username must start and end with a letter or number' };
  }

  // Only allow alphanumeric + underscore/hyphen/period
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, hyphens, and periods' };
  }

  // No consecutive special characters
  if (/[._-]{2,}/.test(username)) {
    return { valid: false, error: 'Username cannot contain consecutive special characters' };
  }

  return { valid: true };
}

/**
 * Sanitize string input to prevent injection attacks
 * - Strips HTML/script tags
 * - Trims whitespace
 * @param {String} input
 * @returns {String}
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return '';

  // Remove HTML tags and trim
  return input
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Sanitize email input
 * @param {String} email
 * @returns {String}
 */
function sanitizeEmail(email) {
  return sanitizeString(email).toLowerCase();
}

/**
 * Sanitize username input
 * @param {String} username
 * @returns {String}
 */
function sanitizeUsername(username) {
  return sanitizeString(username);
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  sanitizeString,
  sanitizeEmail,
  sanitizeUsername
};
