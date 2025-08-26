const { connectToDatabase } = require('./utils/db');

// Cache for first record date (7-day expiry)
let firstRecordCache = {
  date: null,
  expiry: null
};

// Helper function to get current time
const getCurrentTime = () => {
  return new Date();
};

// Helper function to parse date (frontend will send local timezone dates)
const parseDate = (dateInput) => {
  return dateInput ? new Date(dateInput) : getCurrentTime();
};

// Get first record date with 7-day caching
const getFirstRecordDate = async (collection) => {
  const now = Date.now();
  
  // Check if cache is valid
  if (firstRecordCache.date && firstRecordCache.expiry && now < firstRecordCache.expiry) {
    return firstRecordCache.date;
  }
  
  // Cache expired or empty, fetch from database
  const firstRecord = await collection.findOne({}, { sort: { date: 1 } });
  
  if (!firstRecord) {
    throw new Error('No records found in database');
  }
  
  // Cache for 7 days
  firstRecordCache.date = firstRecord.date;
  firstRecordCache.expiry = now + (7 * 24 * 60 * 60 * 1000);
  
  return firstRecord.date;
};

// Calculate Monday of a given date (local timezone)
const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, so we need -6
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

// Calculate total weeks from first record to current week
const calculateTotalWeeks = (firstRecordDate) => {
  const firstMonday = getMondayOfWeek(firstRecordDate);
  const currentMonday = getMondayOfWeek(getCurrentTime());
  const diffTime = currentMonday.getTime() - firstMonday.getTime();
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1; // +1 because we count the first week as week 1
};

// Convert week numbers to date ranges
const getWeekDateRanges = (weekNumbers, firstRecordDate) => {
  const firstMonday = getMondayOfWeek(firstRecordDate);
  
  let earliestStart = null;
  let latestEnd = null;
  
  weekNumbers.forEach(weekNumber => {
    // Week 1 starts at firstMonday, Week 2 starts 7 days later, etc.
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + ((weekNumber - 1) * 7));
    weekStart.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Sunday
    weekEnd.setHours(23, 59, 59, 999);
    
    if (!earliestStart || weekStart < earliestStart) {
      earliestStart = weekStart;
    }
    if (!latestEnd || weekEnd > latestEnd) {
      latestEnd = weekEnd;
    }
  });
  
  return { start: earliestStart, end: latestEnd };
};

exports.handler = async (event, context) => {
  const { httpMethod, body, queryStringParameters } = event;
  
  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('dailySummaries');
    
    switch (httpMethod) {
      case 'GET':
        // New metadata endpoint
        if (queryStringParameters?.metadata) {
          try {
            const firstRecordDate = await getFirstRecordDate(collection);
            const totalWeeks = calculateTotalWeeks(firstRecordDate);
            
            // Calculate current week number based on today's date
            const currentWeekNumber = Math.min(
              calculateTotalWeeks(firstRecordDate), // Today's week relative to first record
              totalWeeks // Don't exceed available weeks
            );
            
            return {
              statusCode: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({
                firstRecordDate: firstRecordDate,
                totalWeeksAvailable: totalWeeks,
                currentWeekNumber: currentWeekNumber
              })
            };
          } catch (error) {
            if (error.message === 'No records found in database') {
              return {
                statusCode: 404,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'No workout records found' })
              };
            }
            throw error;
          }
        }
        
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
        
        // Check if using new week-based API or legacy offset API
        if (queryStringParameters?.weekNumbers) {
          // New week-based API
          const weekNumbersParam = queryStringParameters.weekNumbers;
          let weekNumbers;
          
          try {
            // Parse comma-separated week numbers
            weekNumbers = weekNumbersParam.split(',').map(num => {
              const parsed = parseInt(num.trim());
              if (isNaN(parsed) || parsed < 1) {
                throw new Error(`Invalid week number: ${num}`);
              }
              return parsed;
            });
            
            if (weekNumbers.length === 0) {
              throw new Error('No week numbers provided');
            }
            
          } catch (error) {
            return {
              statusCode: 400,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ error: `Invalid weekNumbers parameter: ${error.message}` })
            };
          }
          
          try {
            // Get first record date and calculate total available weeks
            const firstRecordDate = await getFirstRecordDate(collection);
            const totalWeeks = calculateTotalWeeks(firstRecordDate);
            
            // Validate requested week numbers
            const invalidWeeks = weekNumbers.filter(weekNum => weekNum > totalWeeks);
            if (invalidWeeks.length > 0) {
              return {
                statusCode: 400,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ 
                  error: `Week numbers ${invalidWeeks.join(',')} don't exist. Available weeks: 1-${totalWeeks}` 
                })
              };
            }
            
            // Calculate date ranges for requested weeks
            const dateRanges = getWeekDateRanges(weekNumbers, firstRecordDate);
            
            // Query database with date range
            const summaries = await collection.find({
              date: {
                $gte: dateRanges.start,
                $lte: dateRanges.end
              }
            }).sort({ date: 1 }).toArray();
            
            // Return data with metadata
            return {
              statusCode: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({
                data: summaries,
                meta: {
                  requestedWeeks: weekNumbers.sort((a, b) => a - b),
                  totalWeeksAvailable: totalWeeks,
                  firstRecordDate: firstRecordDate
                }
              })
            };
            
          } catch (error) {
            if (error.message === 'No records found in database') {
              return {
                statusCode: 404,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: 'No workout records found' })
              };
            }
            throw error; // Re-throw unexpected errors
          }
          
        } else {
          // Legacy offset-based API (keep for backward compatibility during transition)
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
        }
        
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