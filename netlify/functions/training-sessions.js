const { connectToDatabase } = require('./utils/db');
const { ObjectId } = require('mongodb');

// Helper function to get current local time (uses server time, but frontend will send local times)
const getCurrentTime = () => {
  return new Date();
};

// Helper function to calculate actual workout duration from training segments
const calculateActualWorkoutDuration = (segments) => {
  if (!segments || segments.length === 0) return 0;
  
  return segments.reduce((total, segment) => {
    if (segment.start && segment.end) {
      return total + (new Date(segment.end) - new Date(segment.start));
    }
    return total;
  }, 0);
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
        
        // Get current non-ended session (active or paused)
        const currentSession = await collection.findOne({ 
          status: { $ne: "ended" } 
        });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(currentSession)
        };
        
      case 'POST':
        // Create new training session
        const sessionData = JSON.parse(body);
        
        // Check if there's already a non-ended session
        const existingSession = await collection.findOne({ status: { $ne: "ended" } });
        if (existingSession) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              error: 'A session already exists. End current session first.' 
            })
          };
        }
        
        const now = sessionData.startTime ? new Date(sessionData.startTime) : getCurrentTime();
        const newSession = {
          goal: sessionData.goal,
          completed: 0,
          startTime: now,
          endTime: null,
          status: "active",
          pausedAt: null,
          lastActivityAt: now,
          actualWorkoutDuration: 0,
          trainingSegments: [{
            start: now,
            end: null
          }],
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
          updateFields.lastActivityAt = getCurrentTime();
        } else if (updateData.action === 'pause') {
          const now = updateData.pausedAt ? new Date(updateData.pausedAt) : getCurrentTime();
          updateFields.status = "paused";
          updateFields.pausedAt = now;
          // End current training segment
          const session = await collection.findOne({ _id: objectId });
          if (session && session.trainingSegments && session.trainingSegments.length > 0) {
            const lastSegmentIndex = session.trainingSegments.length - 1;
            if (!session.trainingSegments[lastSegmentIndex].end) {
              updateFields[`trainingSegments.${lastSegmentIndex}.end`] = now;
            }
          }
        } else if (updateData.action === 'resume') {
          const now = getCurrentTime();
          updateFields.status = "active";
          updateFields.pausedAt = null;
          updateFields.lastActivityAt = now;
          // Start new training segment
          updateFields.$push = { trainingSegments: { start: now, end: null } };
        } else if (updateData.action === 'autoPause') {
          const now = getCurrentTime();
          updateFields.status = "paused";
          updateFields.pausedAt = now;
          // End current training segment
          const session = await collection.findOne({ _id: objectId });
          if (session && session.trainingSegments && session.trainingSegments.length > 0) {
            const lastSegmentIndex = session.trainingSegments.length - 1;
            if (!session.trainingSegments[lastSegmentIndex].end) {
              updateFields[`trainingSegments.${lastSegmentIndex}.end`] = now;
            }
          }
        } else if (updateData.action === 'finalSync') {
          // Final sync: update progress AND end session in one operation
          const now = updateData.endTime ? new Date(updateData.endTime) : getCurrentTime();
          updateFields.completed = updateData.completed;
          updateFields.status = "ended";
          updateFields.endTime = now;
          updateFields.pausedAt = null;
          // End current training segment and calculate actual workout duration
          const session = await collection.findOne({ _id: objectId });
          if (session && session.trainingSegments && session.trainingSegments.length > 0) {
            const lastSegmentIndex = session.trainingSegments.length - 1;
            if (!session.trainingSegments[lastSegmentIndex].end) {
              updateFields[`trainingSegments.${lastSegmentIndex}.end`] = now;
              // Calculate actual workout duration with the final segment
              const updatedSegments = [...session.trainingSegments];
              updatedSegments[lastSegmentIndex].end = now;
              updateFields.actualWorkoutDuration = calculateActualWorkoutDuration(updatedSegments);
            } else {
              updateFields.actualWorkoutDuration = calculateActualWorkoutDuration(session.trainingSegments);
            }
          }
        } else if (updateData.action === 'end') {
          const now = updateData.endTime ? new Date(updateData.endTime) : getCurrentTime();
          updateFields.status = "ended";
          updateFields.endTime = now;
          updateFields.pausedAt = null;
          // End current training segment and calculate actual workout duration
          const session = await collection.findOne({ _id: objectId });
          if (session && session.trainingSegments && session.trainingSegments.length > 0) {
            const lastSegmentIndex = session.trainingSegments.length - 1;
            if (!session.trainingSegments[lastSegmentIndex].end) {
              updateFields[`trainingSegments.${lastSegmentIndex}.end`] = now;
              // Calculate actual workout duration with the final segment
              const updatedSegments = [...session.trainingSegments];
              updatedSegments[lastSegmentIndex].end = now;
              updateFields.actualWorkoutDuration = calculateActualWorkoutDuration(updatedSegments);
            } else {
              updateFields.actualWorkoutDuration = calculateActualWorkoutDuration(session.trainingSegments);
            }
          }
        }
        
        let updateOperation = { $set: updateFields };
        if (updateFields.$push) {
          updateOperation.$push = updateFields.$push;
          delete updateFields.$push;
        }
        
        const updateResult = await collection.updateOne(
          { _id: objectId },
          updateOperation
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