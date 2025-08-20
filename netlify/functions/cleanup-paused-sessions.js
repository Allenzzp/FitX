const { connectToDatabase } = require('./utils/db');

// Helper function to get current time
const getCurrentTime = () => {
  return new Date();
};

// Helper function to check if date is a new day (after midnight)
const isNewDay = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getDate() !== d2.getDate() || 
         d1.getMonth() !== d2.getMonth() || 
         d1.getFullYear() !== d2.getFullYear();
};

exports.handler = async (event, context) => {
  const { httpMethod } = event;
  
  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const sessionsCollection = db.collection('trainingSessions');
    const summariesCollection = db.collection('dailySummaries');
    
    if (httpMethod !== 'GET' && httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }
    
    console.log('Starting cleanup of paused sessions...');
    
    // Find all paused sessions
    const pausedSessions = await sessionsCollection.find({ 
      status: "paused" 
    }).toArray();
    
    console.log(`Found ${pausedSessions.length} paused sessions`);
    
    let cleanedSessions = 0;
    const now = getCurrentTime();
    
    for (const session of pausedSessions) {
      // Check if the session was paused before today (different day)
      if (session.pausedAt && isNewDay(session.pausedAt, now)) {
        console.log(`Cleaning up session ${session._id} paused on ${new Date(session.pausedAt).toISOString()}`);
        
        // Calculate the date for daily summary (use pause date, not today)
        const pauseDate = new Date(session.pausedAt);
        const summaryDate = new Date(pauseDate.getFullYear(), pauseDate.getMonth(), pauseDate.getDate()).toISOString();
        
        try {
          // End the session with pause timestamp as end time
          await sessionsCollection.updateOne(
            { _id: session._id },
            { 
              $set: { 
                status: "ended",
                endTime: session.pausedAt,
                pausedAt: null
              } 
            }
          );
          
          // Create or update daily summary for the pause date
          await summariesCollection.updateOne(
            { 
              date: summaryDate,
              testing: session.testing || false
            },
            {
              $inc: { 
                totalJumps: session.completed,
                sessionsCount: 1 
              },
              $setOnInsert: {
                createdAt: now,
              },
              $set: {
                updatedAt: now
              }
            },
            { upsert: true }
          );
          
          cleanedSessions++;
          console.log(`Successfully cleaned session ${session._id}, added ${session.completed} jumps to ${summaryDate}`);
          
        } catch (error) {
          console.error(`Failed to cleanup session ${session._id}:`, error);
        }
      }
    }
    
    console.log(`Cleanup completed. Processed ${cleanedSessions} sessions.`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true,
        message: `Cleanup completed. Processed ${cleanedSessions} sessions.`,
        cleanedSessions: cleanedSessions
      })
    };
    
  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'Internal server error during cleanup',
        details: error.message
      })
    };
  }
};