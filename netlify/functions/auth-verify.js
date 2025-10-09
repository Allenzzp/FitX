const { connectToDatabase } = require('./utils/db');
const { getTokenFromCookie } = require('./utils/cookies');
const { verifyToken } = require('./utils/jwt');

exports.handler = async (event) => {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get token from cookie
    const token = getTokenFromCookie(event.headers);

    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Not authenticated' })
      };
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid or expired token' })
      };
    }

    // Optionally verify user still exists in database
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const usersCollection = db.collection('users');

    const user = await usersCollection.findOne({ userId: decoded.userId });

    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Format userId for display (0000-0000)
    const formattedUserId = String(user.userId).padStart(8, '0');
    const displayUserId = `${formattedUserId.slice(0, 4)}-${formattedUserId.slice(4)}`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: {
          userId: displayUserId,
          email: user.email,
          username: user.username,
          emailVerified: user.emailVerified
        }
      })
    };

  } catch (error) {
    console.error('Auth verify error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
