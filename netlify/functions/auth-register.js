const { connectToDatabase } = require('./utils/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { signToken } = require('./utils/jwt');
const { createAuthCookie } = require('./utils/cookies');
const { sendVerificationEmail } = require('./utils/email');
const {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  sanitizeEmail,
  sanitizeUsername
} = require('./utils/validation');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, password, username } = JSON.parse(event.body);

    // Validate inputs
    if (!email || !password || !username) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email, password, and username are required' })
      };
    }

    // Sanitize inputs
    const sanitizedEmail = sanitizeEmail(email);
    const sanitizedUsername = sanitizeUsername(username);

    // Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Validate password
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: passwordValidation.error })
      };
    }

    // Validate username
    const usernameValidation = isValidUsername(sanitizedUsername);
    if (!usernameValidation.valid) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: usernameValidation.error })
      };
    }

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    // Check if email already exists
    const existingEmail = await usersCollection.findOne({
      email: sanitizedEmail
    });
    if (existingEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email already registered' })
      };
    }

    // Check if username already exists (case-insensitive)
    const existingUsername = await usersCollection.findOne({
      username: { $regex: new RegExp(`^${sanitizedUsername}$`, 'i') }
    });
    if (existingUsername) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Username already taken' })
      };
    }

    // Get next userId (auto-increment)
    const lastUser = await usersCollection.find().sort({ userId: -1 }).limit(1).toArray();
    const nextUserId = lastUser.length > 0 ? lastUser[0].userId + 1 : 0;

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create user document
    const now = new Date();
    const newUser = {
      userId: nextUserId,
      email: sanitizedEmail,
      username: sanitizedUsername,
      passwordHash,
      emailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
      passwordResetToken: null,
      passwordResetExpires: null,
      createdAt: now,
      updatedAt: now,
      lastLogin: null
    };

    await usersCollection.insertOne(newUser);

    // Send verification email
    try {
      await sendVerificationEmail(sanitizedEmail, sanitizedUsername, emailVerificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails, user can resend later
    }

    // Format userId for display (0000-0000)
    const formattedUserId = String(nextUserId).padStart(8, '0');
    const displayUserId = `${formattedUserId.slice(0, 4)}-${formattedUserId.slice(4)}`;

    // DON'T create JWT token yet - only after email verification
    // User must verify email first before getting authenticated session
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: {
          userId: displayUserId,
          email: sanitizedEmail,
          username: sanitizedUsername,
          emailVerified: false
        }
      })
    };

  } catch (error) {
    console.error('Registration error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
