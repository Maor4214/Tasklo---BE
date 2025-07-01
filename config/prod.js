import dotenv from 'dotenv'
dotenv.config()

export default {
    dbURL: process.env.MONGO_URL || process.env.MONGODB_URI,
    dbName: process.env.DB_NAME || 'tasklo_db'
}
