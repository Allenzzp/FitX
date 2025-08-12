const { MongoClient } = require('mongodb');

let cachedClient = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  try {
    const client = new MongoClient(process.env.MONGODB_URI);
    
    await client.connect();
    cachedClient = client;
    console.log('Connected to MongoDB Atlas');
    return client;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

module.exports = { connectToDatabase };