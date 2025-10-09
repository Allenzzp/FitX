const { connectToDatabase } = require('./utils/db');

exports.handler = async (event) => {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get token from query string
    const token = event.queryStringParameters?.token;

    if (!token) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Verification token is required' })
      };
    }

    // Connect to database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    // Find user with this verification token
    const user = await usersCollection.findOne({
      emailVerificationToken: token
    });

    if (!user) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid verification token' })
      };
    }

    // Check if token has expired
    if (new Date() > user.emailVerificationExpires) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Verification token has expired. Please request a new one.' })
      };
    }

    // Check if already verified
    if (user.emailVerified) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: true,
          message: 'Email already verified'
        })
      };
    }

    // Update user - set emailVerified to true and clear verification token
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          updatedAt: new Date()
        }
      }
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'Email verified successfully!'
      })
    };

  } catch (error) {
    console.error('Email verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
