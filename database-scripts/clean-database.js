require('dotenv').config();
const { MongoClient } = require('mongodb');

async function cleanDatabase() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');
    
    const db = client.db('fitx');
    
    console.log('\n=== CLEANING DATABASE ===');
    
    // Get all collections
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('✅ Database is already clean - no collections found');
      return;
    }
    
    console.log('Found collections:', collections.map(c => c.name));
    console.log('');
    
    // Drop all collections
    for (const collection of collections) {
      await db.collection(collection.name).drop();
      console.log(`🗑️  Dropped collection: ${collection.name}`);
    }
    
    console.log('\n✅ Database cleaned successfully!');
    console.log('All collections have been removed.');
    
  } catch (error) {
    console.error('❌ Failed to clean database:', error);
  } finally {
    await client.close();
    console.log('\nConnection closed.');
  }
}

cleanDatabase();