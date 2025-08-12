const { connectToDatabase } = require('./utils/db');

// Helper function to get current time
const getCurrentTime = () => {
  return new Date();
};

// Helper function to parse date (frontend will send local timezone dates)
const parseDate = (dateInput) => {
  return dateInput ? new Date(dateInput) : getCurrentTime();
};

exports.handler = async (event, context) => {
  const { httpMethod, body, queryStringParameters } = event;
  
  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('dailySummaries');
    
    switch (httpMethod) {
      case 'GET':
        // Check if this is a request to check for test data
        if (queryStringParameters?.checkTestData) {
          const testSummaries = await collection.find({ testing: true }).toArray();
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ hasTestData: testSummaries.length > 0 })
          };
        }
        
        // Get week summaries (Monday to Sunday) with optional offset
        const weekOffset = parseInt(queryStringParameters?.weekOffset || '0');
        const today = getCurrentTime();
        const startOfWeek = new Date(today);
        // Get Monday of current week
        const dayOfWeek = today.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, so we need -6, otherwise 1-dayOfWeek
        startOfWeek.setDate(today.getDate() + diff + (weekOffset * 7));
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
        endOfWeek.setHours(23, 59, 59, 999);
        
        const summaries = await collection.find({
          date: {
            $gte: startOfWeek,
            $lte: endOfWeek
          }
        }).sort({ date: 1 }).toArray();
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(summaries)
        };
        
      case 'POST':
        // Create or update daily summary
        const summaryData = JSON.parse(body);
        const targetDate = parseDate(summaryData.date);
        
        // Check if summary already exists for this date
        const existing = await collection.findOne({
          date: targetDate
        });
        
        if (existing) {
          // Update existing summary
          const updateResult = await collection.updateOne(
            { date: targetDate },
            { 
              $inc: { 
                totalJumps: summaryData.totalJumps || 0,
                sessionsCount: summaryData.sessionsCount || 0
              },
              $set: {
                updatedAt: summaryData.updatedAt ? new Date(summaryData.updatedAt) : getCurrentTime()
              }
            }
          );
          
          const updated = await collection.findOne({ date: targetDate });
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(updated)
          };
        } else {
          // Create new summary
          const newSummary = {
            date: targetDate,
            totalJumps: summaryData.totalJumps || 0,
            sessionsCount: summaryData.sessionsCount || 0,
            testing: summaryData.testing || false,
            createdAt: summaryData.createdAt ? new Date(summaryData.createdAt) : getCurrentTime(),
            updatedAt: summaryData.updatedAt ? new Date(summaryData.updatedAt) : getCurrentTime()
          };
          
          const result = await collection.insertOne(newSummary);
          
          return {
            statusCode: 201,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              ...newSummary,
              _id: result.insertedId
            })
          };
        }
        
      case 'PUT':
        // Direct update of daily summary (for historical data)
        const updateData = JSON.parse(body);
        const updateDate = parseDate(updateData.date);
        
        const updateResult = await collection.replaceOne(
          { date: updateDate },
          {
            date: updateDate,
            totalJumps: updateData.totalJumps,
            sessionsCount: updateData.sessionsCount,
            createdAt: updateData.createdAt || getCurrentTime(),
            updatedAt: getCurrentTime()
          },
          { upsert: true }
        );
        
        const updatedDoc = await collection.findOne({ date: updateDate });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(updatedDoc)
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
              message: `Deleted ${deleteResult.deletedCount} test summaries` 
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
    console.error('Daily summaries error:', error);
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