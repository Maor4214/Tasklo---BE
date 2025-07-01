import dotenv from 'dotenv'
dotenv.config()

export default {
  dbURL: process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  dbName: process.env.DB_NAME || 'tasklo_db'
}
