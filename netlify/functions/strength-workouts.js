const { connectToDatabase } = require('./utils/db');
const { ObjectId } = require('mongodb');

// Helper function to get current local time
const getCurrentTime = () => {
  return new Date();
};

// Helper function to validate date string and convert to date object
const parseDate = (dateString) => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format');
  }
  return date;
};

// Helper function to create daily date identifier from UTC timestamp
// Extracts local date from UTC timestamp for workout grouping
const createDailyDate = (utcTimestamp) => {
  const date = new Date(utcTimestamp);
  // Extract local date components (automatically handles timezone conversion)
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  // Create UTC midnight for the local date (for consistent storage format)
  return new Date(Date.UTC(year, month, day)).toISOString();
};

exports.handler = async (event, context) => {
  const { httpMethod, body, queryStringParameters } = event;
  
  try {
    const client = await connectToDatabase();
    const db = client.db('fitx');
    const collection = db.collection('strengthWorkouts');
    
    switch (httpMethod) {
      case 'GET':
        // Check if this is a request to check for test data
        if (queryStringParameters?.checkTestData) {
          const testWorkouts = await collection.find({ testing: true }).toArray();
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ hasTestData: testWorkouts.length > 0 })
          };
        }
        
        // Get workouts for a date range (month query with local-to-UTC boundaries)
        const startDate = queryStringParameters?.startDate;
        const endDate = queryStringParameters?.endDate;
        
        if (startDate && endDate) {
          // Frontend sends UTC boundaries converted from local time
          // Query database directly with these UTC boundaries
          const start = new Date(startDate);
          const end = new Date(endDate);
          
          // Database stores date as ISO string, so compare with strings
          const workouts = await collection.find({
            date: {
              $gte: start.toISOString(),
              $lte: end.toISOString()
            }
          }).sort({ date: 1 }).toArray();
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(workouts)
          };
        }
        
        // Get workouts for a specific date
        const dateParam = queryStringParameters?.date;
        if (dateParam) {
          const queryDate = new Date(dateParam);
          const localYear = queryDate.getFullYear();
          const localMonth = queryDate.getMonth();
          const localDay = queryDate.getDate();

          // Create start and end of day boundaries in local timezone
          const dayStart = new Date(localYear, localMonth, localDay, 0, 0, 0, 0);
          const dayEnd = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);

          const workouts = await collection.findOne({
            date: {
              $gte: dayStart.toISOString(),
              $lte: dayEnd.toISOString()
            }
          });
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(workouts || { date: targetDate, exercises: [] })
          };
        }
        
        // Get today's workouts by default
        const today = createDailyDate(new Date());
        const todaysWorkouts = await collection.findOne({ 
          date: today 
        });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(todaysWorkouts || { date: today, exercises: [] })
        };
        
      case 'POST':
        const workoutData = JSON.parse(body);
        const recordingTimestamp = workoutData.date || getCurrentTime().toISOString();
        const dailyDateKey = createDailyDate(recordingTimestamp);

        // Find existing workout for this local date using timestamp range
        const recordingDate = new Date(recordingTimestamp);
        const localYear = recordingDate.getFullYear();
        const localMonth = recordingDate.getMonth();
        const localDay = recordingDate.getDate();

        // Create start and end of day boundaries in local timezone
        const dayStart = new Date(localYear, localMonth, localDay, 0, 0, 0, 0);
        const dayEnd = new Date(localYear, localMonth, localDay, 23, 59, 59, 999);

        let existingWorkout = await collection.findOne({
          date: {
            $gte: dayStart.toISOString(),
            $lte: dayEnd.toISOString()
          }
        });
        
        if (existingWorkout) {
          // Add new set to existing workout
          const exerciseIndex = existingWorkout.exercises.findIndex(
            ex => ex.exercise === workoutData.exercise
          );
          
          if (exerciseIndex >= 0) {
            // Exercise already exists, add new set
            existingWorkout.exercises[exerciseIndex].sets.push({
              reps: workoutData.reps,
              timestamp: recordingTimestamp
            });
          } else {
            // New exercise for this date
            existingWorkout.exercises.push({
              exercise: workoutData.exercise,
              sets: [{
                reps: workoutData.reps,
                timestamp: recordingTimestamp
              }]
            });
          }
          
          existingWorkout.updatedAt = recordingTimestamp;
          
          // Update the document
          await collection.updateOne(
            { _id: existingWorkout._id },
            { $set: existingWorkout }
          );
          
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(existingWorkout)
          };
        } else {
          // Create new workout document for this date
          const newWorkout = {
            date: recordingTimestamp,
            exercises: [{
              exercise: workoutData.exercise,
              sets: [{
                reps: workoutData.reps,
                timestamp: recordingTimestamp
              }]
            }],
            testing: workoutData.testing || false,
            createdAt: recordingTimestamp,
            updatedAt: recordingTimestamp
          };
          
          const result = await collection.insertOne(newWorkout);
          newWorkout._id = result.insertedId;
          
          return {
            statusCode: 201,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(newWorkout)
          };
        }
        
      case 'PUT':
        // Update or delete specific sets
        const updateData = JSON.parse(body);
        const workoutId = queryStringParameters?.id;
        
        if (!workoutId) {
          return {
            statusCode: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Workout ID required' })
          };
        }
        
        // Update workout data
        const workoutUpdate = JSON.parse(body);
        
        // Remove _id from update data to avoid MongoDB error
        const { _id, ...updateFields } = workoutUpdate;
        
        // Update the workout document
        const result = await collection.updateOne(
          { _id: new ObjectId(workoutId) },
          { 
            $set: {
              ...updateFields,
              updatedAt: getCurrentTime().toISOString()
            }
          }
        );
        
        if (result.matchedCount === 0) {
          return {
            statusCode: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Workout not found' })
          };
        }
        
        // Fetch and return updated document
        const updatedWorkout = await collection.findOne({ _id: new ObjectId(workoutId) });
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(updatedWorkout)
        };
        
      case 'DELETE':
        // Delete test data
        if (queryStringParameters?.deleteTestData === 'true') {
          const deleteResult = await collection.deleteMany({ testing: true });
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ 
              message: 'Test strength workouts deleted successfully',
              deletedCount: deleteResult.deletedCount 
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
        
      case 'OPTIONS':
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
          },
          body: ''
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
    console.error('Strength workouts function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};