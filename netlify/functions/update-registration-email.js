const { connectToDatabase } = require('./utils/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./utils/email');
const { isValidEmail, sanitizeEmail } = require('./utils/validation');

exports.handler = async (event) => {
  // Only allow PUT
  if (event.httpMethod !== 'PUT') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { oldEmail, newEmail, password } = JSON.parse(event.body);

    if (!oldEmail || !newEmail || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Old email, new email, and password are required' })
      };
    }

    const sanitizedOldEmail = sanitizeEmail(oldEmail);
    const sanitizedNewEmail = sanitizeEmail(newEmail);

    // Validate new email format
    if (!isValidEmail(sanitizedNewEmail)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    // Find user by old email
    const user = await usersCollection.findOne({ email: sanitizedOldEmail });

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid password' })
      };
    }

    // Check if user is already verified (don't allow email change after verification for MVP)
    if (user.emailVerified) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Cannot change email after verification' })
      };
    }

    // Check if new email is already taken
    const existingEmail = await usersCollection.findOne({ email: sanitizedNewEmail });
    if (existingEmail) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email already registered' })
      };
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Update user email and verification token
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          email: sanitizedNewEmail,
          emailVerified: false,
          emailVerificationToken,
          emailVerificationExpires,
          updatedAt: new Date()
        }
      }
    );

    // Send verification email to new address
    try {
      await sendVerificationEmail(sanitizedNewEmail, user.username, emailVerificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to send verification email' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Email updated. Verification email sent to new address.'
      })
    };

  } catch (error) {
    console.error('Update email error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
