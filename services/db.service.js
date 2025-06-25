import { MongoClient } from 'mongodb'

export const dbService = {
  getCollection,
}

const config = {
  dbURL: 'mongodb://127.0.0.1:27017',
  dbName: 'tasklo_db',
}

let dbConn = null

async function getCollection(collectionName) {
  try {
    const db = await connect()
    return db.collection(collectionName)
  } catch (err) {
    console.error('❌ Failed to get collection:', err)
    throw err
  }
}

async function connect() {
  if (dbConn) return dbConn
  try {
    const client = await MongoClient.connect(config.dbURL)
    const db = client.db(config.dbName)
    dbConn = db
    console.log('🟢 Connected to MongoDB')
    return db
  } catch (err) {
    console.error('❌ Cannot connect to MongoDB', err)
    throw err
  }
}
