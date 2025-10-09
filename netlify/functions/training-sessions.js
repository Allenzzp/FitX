const { connectToDatabase } = require('./utils/db');
const { ObjectId } = require('mongodb');
const { requireAuth } = require('./utils/auth-helper');

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

// Helper function to calculate real-time timer status (bulletproof server-time approach)
const calculateTimerStatus = (session) => {
  // If session has no timer, return null
  if (!session.sessionLen || !session.startTime) {
    return null;
  }

  // For paused sessions, use stored paused timer state if available
  if (session.status === 'paused' && session.pausedTimerState) {
    return {
      remainTime: session.pausedTimerState.remainTime,
      timerExpired: session.pausedTimerState.isExpired,
      extraTime: session.pausedTimerState.extraTime
    };
  }

  // For resume to last activity, use timer override if recently set
  if (session.resumeTimerOverride && session.status === 'active') {
    const now = getCurrentTime();
    const overrideSetAt = new Date(session.resumeTimerOverride.setAt);
    const secondsSinceOverride = Math.floor((now - overrideSetAt) / 1000);

    // Calculate current timer state based on override + elapsed time since override
    const currentRemainTime = session.resumeTimerOverride.remainTime - secondsSinceOverride;

    if (currentRemainTime > 0) {
      return {
        remainTime: currentRemainTime,
        timerExpired: false,
        extraTime: 0
      };
    } else {
      return {
        remainTime: 0,
        timerExpired: true,
        extraTime: Math.abs(currentRemainTime)
      };
    }
  }

  const now = getCurrentTime();
  const startTime = new Date(session.startTime);

  // Calculate total elapsed seconds since session started
  let totalElapsedSeconds = Math.floor((now - startTime) / 1000);

  // Subtract paused time from elapsed time
  if (session.trainingSegments && session.trainingSegments.length > 0) {
    let pausedTimeSeconds = 0;

    session.trainingSegments.forEach(segment => {
      if (segment.start && segment.end) {
        // Completed segment - add gap time as paused time
        const segmentStart = new Date(segment.start);
        const segmentEnd = new Date(segment.end);

        // Find next segment or current time
        const nextSegmentIndex = session.trainingSegments.indexOf(segment) + 1;
        if (nextSegmentIndex < session.trainingSegments.length) {
          const nextSegment = session.trainingSegments[nextSegmentIndex];
          if (nextSegment.start) {
            const nextStart = new Date(nextSegment.start);
            pausedTimeSeconds += Math.floor((nextStart - segmentEnd) / 1000);
          }
        } else {
          // Last completed segment - if session is paused, add pause time
          if (session.status === 'paused' && session.pausedAt) {
            const pausedAt = new Date(session.pausedAt);
            pausedTimeSeconds += Math.floor((now - pausedAt) / 1000);
          }
        }
      }
    });

    totalElapsedSeconds -= pausedTimeSeconds;
  }

  // For paused sessions, don't count current pause time
  if (session.status === 'paused' && session.pausedAt) {
    const pausedAt = new Date(session.pausedAt);
    const currentPauseTime = Math.floor((now - pausedAt) / 1000);
    totalElapsedSeconds -= currentPauseTime;
  }

  // Apply timer compensation if any (for "resume to last activity" feature)
  const compensation = session.timerCompensation || 0;

  // Calculate remaining time
  const remainingSeconds = session.sessionLen - totalElapsedSeconds + compensation;

  if (remainingSeconds > 0) {
    // Timer still running
    return {
      remainTime: remainingSeconds,
      timerExpired: false,
      extraTime: 0
    };
  } else {
    // Timer expired - calculate overtime
    return {
      remainTime: 0,
      timerExpired: true,
      extraTime: Math.abs(remainingSeconds)
    };
  }
};

exports.handler = async (event, context) => {
  const { httpMethod, body, queryStringParameters, headers } = event;

  // Require authentication for all requests
  const authResult = requireAuth(headers);
  if (authResult.error) {
    return authResult.error;
  }
  const { userId } = authResult;

  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('trainingSessions');

    switch (httpMethod) {
      case 'GET':
        // Check if this is a request to check for test data
        if (queryStringParameters?.checkTestData) {
          const testSessions = await collection.find({ userId, testing: true }).toArray();
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({ hasTestData: testSessions.length > 0 })
          };
        }

        // Get current non-ended session (active or paused) for this user
        const currentSession = await collection.findOne({
          userId,
          status: { $ne: "ended" }
        });

        if (currentSession) {
          // Calculate real-time timer status
          const timerStatus = calculateTimerStatus(currentSession);

          // Add calculated timer fields to session
          const sessionWithTimer = {
            ...currentSession,
            ...(timerStatus && timerStatus)
          };

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify(sessionWithTimer)
          };
        } else {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify(null)
          };
        }
        
      case 'POST':
        // Create new training session
        const sessionData = JSON.parse(body);

        // Check if there's already a non-ended session for this user
        const existingSession = await collection.findOne({ userId, status: { $ne: "ended" } });
        if (existingSession) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({
              error: 'A session already exists. End current session first.'
            })
          };
        }

        const now = sessionData.startTime ? new Date(sessionData.startTime) : getCurrentTime();
        const newSession = {
          userId,  // Add userId to new session
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
          // Timer fields (only sessionLen is stored - rest calculated dynamically)
          sessionLen: sessionData.sessionLen || null,  // Target duration in seconds
          testing: sessionData.testing || false,
          createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : getCurrentTime()
        };
        
        const result = await collection.insertOne(newSession);
        
        return {
          statusCode: 201,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
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
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
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
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({ error: 'Invalid session ID format' })
          };
        }
        
        let updateFields = {};
        

        // Handle different update types
        if (updateData.action === 'updateProgress') {
          updateFields.completed = updateData.completed;
          updateFields.lastActivityAt = getCurrentTime();
          // Timer state is now calculated dynamically - no need to store it
        } else if (updateData.action === 'pause') {
          const now = updateData.pausedAt ? new Date(updateData.pausedAt) : getCurrentTime();
          updateFields.status = "paused";
          updateFields.pausedAt = now;

          // Store client timer state for accurate resume
          if (updateData.clientTimerState) {
            // Use client's displayed time as authoritative source (what user saw when they clicked pause)
            const authoritativeRemainTime = updateData.clientDisplayedTime !== undefined
              ? updateData.clientDisplayedTime
              : updateData.clientTimerState.remainTime;

            updateFields.pausedTimerState = {
              remainTime: authoritativeRemainTime, // ← User's ground truth
              isExpired: updateData.clientTimerState.isExpired,
              extraTime: updateData.clientTimerState.extraTime,
              pausedAt: now
            };
          }

          // End current training segment
          const session = await collection.findOne({ _id: objectId, userId });
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

          // Handle time compensation for "resume to last activity" feature
          if (updateData.compensateTime && typeof updateData.compensateTime === 'number') {
            // Store compensation time to be used by timer calculation
            updateFields.timerCompensation = (updateFields.timerCompensation || 0) + updateData.compensateTime;

            // Log client last rep timestamp for debugging
            if (updateData.clientLastRepAt) {
              console.log(`Resume to last activity: client last rep at ${updateData.clientLastRepAt}, compensating ${updateData.compensateTime} seconds`);
            }
          }

          // Start new training segment
          updateFields.$push = { trainingSegments: { start: now, end: null } };
        } else if (updateData.action === 'resumeToLastActivity') {
          const now = getCurrentTime();
          updateFields.status = "active";
          updateFields.pausedAt = null;
          updateFields.lastActivityAt = now;

          // Store the exact timer state from last rep time (direct override)
          if (updateData.lastRepTimerState) {
            updateFields.resumeTimerOverride = {
              remainTime: updateData.lastRepTimerState.remainTime,
              isExpired: updateData.lastRepTimerState.isExpired,
              extraTime: updateData.lastRepTimerState.extraTime,
              setAt: now
            };
          }

          // Start new training segment
          updateFields.$push = { trainingSegments: { start: now, end: null } };
        } else if (updateData.action === 'autoPause') {
          const now = getCurrentTime();
          updateFields.status = "paused";
          updateFields.pausedAt = now;

          // Store client timer state for accurate auto-pause
          if (updateData.clientTimerState) {
            updateFields.pausedTimerState = {
              remainTime: updateData.clientTimerState.remainTime,
              isExpired: updateData.clientTimerState.isExpired,
              extraTime: updateData.clientTimerState.extraTime,
              pausedAt: now
            };
          }

          // End current training segment
          const session = await collection.findOne({ _id: objectId, userId });
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
          // Timer state is calculated dynamically - no need to store it
          // End current training segment and calculate actual workout duration
          const session = await collection.findOne({ _id: objectId, userId });
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
          // Timer state is calculated dynamically - no need to store it
          // End current training segment and calculate actual workout duration
          const session = await collection.findOne({ _id: objectId, userId });
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
        
        // Special handling for resume action: get paused timer state before updating
        let resumeTimerState = null;
        if (updateData.action === 'resume') {
          const currentSession = await collection.findOne({ _id: objectId });
          if (currentSession && currentSession.pausedTimerState) {
            resumeTimerState = currentSession.pausedTimerState;
          }
        }

        let updateOperation = { $set: updateFields };
        if (updateFields.$push) {
          updateOperation.$push = updateFields.$push;
          delete updateFields.$push;
        }

        const updateResult = await collection.updateOne(
          { _id: objectId, userId },
          updateOperation
        );

        if (updateResult.matchedCount === 0) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({ error: 'Session not found' })
          };
        }

        const updatedSession = await collection.findOne({ _id: objectId, userId });

        // For resume action: use stored paused timer state and then clear it
        if (updateData.action === 'resume' && resumeTimerState) {
          const responseSession = {
            ...updatedSession,
            // Override calculated timer with paused state for resume initialization
            remainTime: resumeTimerState.remainTime,
            timerExpired: resumeTimerState.isExpired,
            extraTime: resumeTimerState.extraTime
          };

          // Clear the paused timer state for future calculations
          await collection.updateOne(
            { _id: objectId, userId },
            { $set: { pausedTimerState: null } }
          );

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify(responseSession)
          };
        }

        // Calculate real-time timer status for the updated session (same as GET)
        const timerStatus = calculateTimerStatus(updatedSession);

        // Add calculated timer fields to session
        const sessionWithTimer = {
          ...updatedSession,
          ...(timerStatus && timerStatus)
        };

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(sessionWithTimer)
        };
        
      case 'DELETE':
        // Delete test data (only for this user)
        if (queryStringParameters?.deleteTestData) {
          const deleteResult = await collection.deleteMany({ userId, testing: true });
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
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