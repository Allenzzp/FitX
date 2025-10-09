const { connectToDatabase } = require('./utils/db');
const bcrypt = require('bcryptjs');
const { signToken } = require('./utils/jwt');
const { createAuthCookie } = require('./utils/cookies');
const { sanitizeEmail } = require('./utils/validation');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { email, password, rememberMe } = JSON.parse(event.body);

    // Validate inputs
    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email and password are required' })
      };
    }

    // Sanitize email
    const sanitizedEmail = sanitizeEmail(email);

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    // Find user by email
    const user = await usersCollection.findOne({ email: sanitizedEmail });

    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid email or password' })
      };
    }

    // Check if email is verified
    if (!user.emailVerified) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Please verify your email first',
          emailVerified: false
        })
      };
    }

    // Update lastLogin timestamp
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    // Create JWT token (always 21 days, rememberMe only affects browser password saving)
    const token = signToken({
      userId: user.userId,
      email: user.email,
      username: user.username
    });

    // Format userId for display (0000-0000)
    const padded = String(user.userId).padStart(8, '0');
    const formattedUserId = `${padded.slice(0, 4)}-${padded.slice(4)}`;

    return {
      statusCode: 200,
      headers: {
        'Set-Cookie': createAuthCookie(token),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: {
          userId: formattedUserId,
          email: user.email,
          username: user.username,
          emailVerified: true
        }
      })
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
