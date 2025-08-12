const { connectToDatabase } = require('./utils/db');
const { ObjectId } = require('mongodb');

// Helper function to get current local time (uses server time, but frontend will send local times)
const getCurrentTime = () => {
  return new Date();
};

exports.handler = async (event, context) => {
  const { httpMethod, body, queryStringParameters } = event;
  
  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('trainingSessions');
    
    switch (httpMethod) {
      case 'GET':
        // Check if this is a request to check for test data
        if (queryStringParameters?.checkTestData) {
          const testSessions = await collection.find({ testing: true }).toArray();
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ hasTestData: testSessions.length > 0 })
          };
        }
        
        // Get current active session
        const activeSession = await collection.findOne({ 
          isActive: true 
        });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(activeSession)
        };
        
      case 'POST':
        // Create new training session
        const sessionData = JSON.parse(body);
        
        // Check if there's already an active session
        const existingActive = await collection.findOne({ isActive: true });
        if (existingActive) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'An active session already exists. End current session first.' 
            })
          };
        }
        
        const newSession = {
          goal: sessionData.goal,
          completed: 0,
          startTime: sessionData.startTime ? new Date(sessionData.startTime) : getCurrentTime(),
          endTime: null,
          isActive: true,
          isPaused: false,
          pausedAt: null,
          totalPausedDuration: 0,
          testing: sessionData.testing || false,
          createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : getCurrentTime()
        };
        
        const result = await collection.insertOne(newSession);
        
        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ 
            ...newSession, 
            _id: result.insertedId 
          })
        };
        
      case 'PUT':
        // Update session (progress, pause/resume, end)
        const updateData = JSON.parse(body);
        const sessionId = queryStringParameters?.id;
        
        if (!sessionId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Session ID is required' })
          };
        }

        // Convert string ID to ObjectId
        let objectId;
        try {
          objectId = new ObjectId(sessionId);
        } catch (error) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Invalid session ID format' })
          };
        }
        
        let updateFields = {};
        
        // Handle different update types
        if (updateData.action === 'updateProgress') {
          updateFields.completed = updateData.completed;
        } else if (updateData.action === 'pause') {
          updateFields.isPaused = true;
          updateFields.pausedAt = updateData.pausedAt ? new Date(updateData.pausedAt) : getCurrentTime();
        } else if (updateData.action === 'resume') {
          const session = await collection.findOne({ _id: objectId });
          if (session && session.pausedAt) {
            const pauseDuration = getCurrentTime() - new Date(session.pausedAt);
            updateFields.isPaused = false;
            updateFields.pausedAt = null;
            updateFields.totalPausedDuration = (session.totalPausedDuration || 0) + pauseDuration;
          }
        } else if (updateData.action === 'finalSync') {
          // Final sync: update progress AND end session in one operation
          updateFields.completed = updateData.completed;
          updateFields.isActive = false;
          updateFields.endTime = updateData.endTime ? new Date(updateData.endTime) : getCurrentTime();
          updateFields.isPaused = false;
          updateFields.pausedAt = null;
        } else if (updateData.action === 'end') {
          updateFields.isActive = false;
          updateFields.endTime = updateData.endTime ? new Date(updateData.endTime) : getCurrentTime();
          updateFields.isPaused = false;
          updateFields.pausedAt = null;
        }
        
        const updateResult = await collection.updateOne(
          { _id: objectId },
          { $set: updateFields }
        );
        
        if (updateResult.matchedCount === 0) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Session not found' })
          };
        }
        
        const updatedSession = await collection.findOne({ _id: objectId });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(updatedSession)
        };
        
      case 'DELETE':
        // Delete test data
        if (queryStringParameters?.deleteTestData) {
          const deleteResult = await collection.deleteMany({ testing: true });
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              deletedCount: deleteResult.deletedCount,
              message: `Deleted ${deleteResult.deletedCount} test sessions` 
            })
          };
        }
        
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Invalid delete request' })
        };
        
      default:
        return {
          statusCode: 405,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }
    
  } catch (error) {
    console.error('Training sessions error:', error);
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