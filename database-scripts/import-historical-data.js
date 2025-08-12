require('dotenv').config();
const { MongoClient } = require('mongodb');

// Helper function to create date at midnight
const createDate = (year, month, day) => {
  // month is 0-indexed in JavaScript Date constructor
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

// Helper function to create time (4-8 PM range)
const createTime = (year, month, day, hour = 18) => {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
};

async function importHistoricalData() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    const db = client.db('fitx');
    const collection = db.collection('dailySummaries');
    
    console.log('\n=== IMPORTING HISTORICAL DATA ===');
    
    // Historical data for current week: Aug 4, 6, 7, 2025 (local timezone)
    const historicalData = [
      {
        date: createDate(2025, 8, 4),
        totalJumps: 5000,
        sessionsCount: 1,
        testing: false,
        createdAt: createTime(2025, 8, 4, 16),
        updatedAt: createTime(2025, 8, 4, 16)
      },
      {
        date: createDate(2025, 8, 6),
        totalJumps: 4500,
        sessionsCount: 1,
        testing: false,
        createdAt: createTime(2025, 8, 6, 19),
        updatedAt: createTime(2025, 8, 6, 19)
      },
      {
        date: createDate(2025, 8, 7),
        totalJumps: 4000,
        sessionsCount: 1,
        testing: false,
        createdAt: createTime(2025, 8, 7, 17),
        updatedAt: createTime(2025, 8, 7, 17)
      }
    ];
    
    console.log(`Importing ${historicalData.length} records...`);
    console.log('');
    
    // Insert historical data (upsert to avoid duplicates)
    for (const record of historicalData) {
      const result = await collection.replaceOne(
        { date: record.date },
        record,
        { upsert: true }
      );
      
      const action = result.upsertedCount ? 'Inserted' : 'Updated';
      console.log(`✅ ${action} record for ${record.date.toDateString()}: ${record.totalJumps} jumps`);
    }
    
    console.log('\n=== VERIFICATION ===');
    
    // Verify the imported data
    const allSummaries = await collection.find({}).sort({ date: 1 }).toArray();
    console.log(`Found ${allSummaries.length} daily summaries in database:`);
    
    allSummaries.forEach((summary, index) => {
      console.log(`  ${index + 1}. ${new Date(summary.date).toDateString()}: ${summary.totalJumps} jumps`);
    });
    
    console.log('\n🎉 Historical data import completed successfully!');
    
  } catch (error) {
    console.error('❌ Import failed:', error);
  } finally {
    await client.close();
    console.log('\nConnection closed.');
  }
}

importHistoricalData();