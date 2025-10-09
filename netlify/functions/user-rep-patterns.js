const { connectToDatabase } = require('./utils/db');
const { requireAuth } = require('./utils/auth-helper');

// Helper function to get current time
const getCurrentTime = () => {
  return new Date();
};

exports.handler = async (event, context) => {
  const { httpMethod, body, headers } = event;

  // Require authentication for all requests
  const authResult = requireAuth(headers);
  if (authResult.error) {
    return authResult.error;
  }
  const { userId } = authResult;

  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('userRepPatterns');
    
    switch (httpMethod) {
      case 'GET':
        // Get user's top 3 rep patterns
        const userPattern = await collection.findOne({ userId });
        
        if (!userPattern) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'No rep patterns found for user',
              topThreeReps: [] 
            })
          };
        }
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({
            userId: userPattern.userId,
            topThreeReps: userPattern.topThreeReps || [],
            updatedAt: userPattern.updatedAt
          })
        };
        
      case 'PUT':
        // Update user's top 3 rep patterns
        const updateData = JSON.parse(body);
        
        if (!updateData.topThreeReps || !Array.isArray(updateData.topThreeReps)) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'topThreeReps array is required' })
          };
        }
        
        // Validate that all values are numbers
        const isValidReps = updateData.topThreeReps.every(rep => 
          typeof rep === 'number' && rep > 0
        );
        
        if (!isValidReps) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'All rep values must be positive numbers' 
            })
          };
        }
        
        // Ensure we only store up to 3 values
        const topThreeReps = updateData.topThreeReps.slice(0, 3);
        
        const now = getCurrentTime();
        const upsertData = {
          userId,
          topThreeReps,
          updatedAt: now
        };
        
        const result = await collection.replaceOne(
          { userId },
          upsertData,
          { upsert: true }
        );
        
        // Return the updated document
        const updatedPattern = await collection.findOne({ userId });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({
            ...updatedPattern,
            upserted: result.upsertedId !== null
          })
        };
        
      case 'POST':
        // Create initial user rep patterns (same as PUT for this use case)
        const createData = JSON.parse(body);
        
        if (!createData.topThreeReps || !Array.isArray(createData.topThreeReps)) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'topThreeReps array is required' })
          };
        }
        
        // Check if user pattern already exists
        const existingPattern = await collection.findOne({ userId });
        if (existingPattern) {
          return {
            statusCode: 409,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'User rep patterns already exist. Use PUT to update.' 
            })
          };
        }
        
        const validReps = createData.topThreeReps.every(rep => 
          typeof rep === 'number' && rep > 0
        );
        
        if (!validReps) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'All rep values must be positive numbers' 
            })
          };
        }
        
        const newPattern = {
          userId,
          topThreeReps: createData.topThreeReps.slice(0, 3),
          createdAt: getCurrentTime(),
          updatedAt: getCurrentTime()
        };
        
        const insertResult = await collection.insertOne(newPattern);
        
        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({
            ...newPattern,
            _id: insertResult.insertedId
          })
        };
        
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
  } catch (error) {
    console.error('User rep patterns error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};