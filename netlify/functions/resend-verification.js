const { connectToDatabase } = require('./utils/db');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./utils/email');
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
    const { email } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email is required' })
      };
    }

    const sanitizedEmail = sanitizeEmail(email);

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    // Find user by email
    const user = await usersCollection.findOne({ email: sanitizedEmail });

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Check if already verified
    if (user.emailVerified) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email already verified' })
      };
    }

    // Generate new verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Update user with new token
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationToken,
          emailVerificationExpires,
          updatedAt: new Date()
        }
      }
    );

    // Send verification email
    try {
      await sendVerificationEmail(sanitizedEmail, user.username, emailVerificationToken);
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
        message: 'Verification email sent'
      })
    };

  } catch (error) {
    console.error('Resend verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
