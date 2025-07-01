import { MongoClient } from 'mongodb'
import { config } from '../config/index.js'

export const dbService = {
  getCollection,
}

let dbConn = null
// Debug: Show what URL we're actually trying to connect to
console.log('🔍 DEBUG: Attempting to connect to MongoDB...')
console.log('🔍 DEBUG: config.dbURL =', config.dbURL)
console.log('🔍 DEBUG: config.dbName =', config.dbName)

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
