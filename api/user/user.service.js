import { dbService } from '../../services/db.service.js'
import { logger } from '../../services/logger.service.js'
import { reviewService } from '../review/review.service.js'
import { ObjectId } from 'mongodb'

export const userService = {
  add,
  getById,
  update,
  remove,
  query,
  getByUsername,
  getByGoogleId,
  addGoogleUser,
  getOrCreateGoogleUser,
}

// ========== CRUD רגיל ==========

async function query(filterBy = {}) {
  const criteria = _buildCriteria(filterBy)
  try {
    const collection = await dbService.getCollection('users')
    let users = await collection.find(criteria).toArray()
    users = users.map((user) => {
      delete user.password
      user.createdAt = user._id.getTimestamp()
      return user
    })
    return users
  } catch (err) {
    logger.error('cannot find users', err)
    throw err
  }
}

async function getById(userId) {
  try {
    const criteria = { _id: ObjectId.createFromHexString(userId) }

    const collection = await dbService.getCollection('users')
    const user = await collection.findOne(criteria)
    if (!user) return null
    delete user.password

    user.givenReviews = await reviewService.query({ byUserId: userId })
    user.givenReviews = user.givenReviews.map((review) => {
      delete review.byUser
      return review
    })

    return user
  } catch (err) {
    logger.error(`while finding user by id: ${userId}`, err)
    throw err
  }
}

async function getByUsername(username) {
  try {
    const collection = await dbService.getCollection('users')
    return await collection.findOne({ username })
  } catch (err) {
    logger.error(`while finding user by username: ${username}`, err)
    throw err
  }
}

async function add(user) {
  try {
    const userToAdd = {
      username: user.username,
      password: user.password,
      fullname: user.fullname,
      imgUrl: user.imgUrl,
      isAdmin: user.isAdmin,
      score: 100,
    }
    const collection = await dbService.getCollection('users')
    const res = await collection.insertOne(userToAdd)
    userToAdd._id = res.insertedId
    delete userToAdd.password
    return userToAdd
  } catch (err) {
    logger.error('cannot add user', err)
    throw err
  }
}

async function update(user) {
  try {
    const userToSave = {
      _id: ObjectId.createFromHexString(user._id),
      fullname: user.fullname,
      score: user.score,
    }
    const collection = await dbService.getCollection('users')
    await collection.updateOne({ _id: userToSave._id }, { $set: userToSave })
    return userToSave
  } catch (err) {
    logger.error(`cannot update user ${user._id}`, err)
    throw err
  }
}

async function remove(userId) {
  try {
    const criteria = { _id: ObjectId.createFromHexString(userId) }
    const collection = await dbService.getCollection('users')
    await collection.deleteOne(criteria)
  } catch (err) {
    logger.error(`cannot remove user ${userId}`, err)
    throw err
  }
}

// ========== Google Login ==========

async function getByGoogleId(googleId) {
  try {
    const collection = await dbService.getCollection('users')
    return await collection.findOne({ googleId })
  } catch (err) {
    logger.error(`while finding user by googleId: ${googleId}`, err)
    throw err
  }
}

async function addGoogleUser(profile) {
  try {
    const userToAdd = {
      googleId: profile.id,
      fullname: profile.displayName,
      username: profile.emails?.[0]?.value || '',
      email: profile.emails?.[0]?.value || '',
      imgUrl: profile.photos?.[0]?.value || '',
      score: 100,
      isAdmin: false,
      createdAt: Date.now(),
    }
    const collection = await dbService.getCollection('users')
    const res = await collection.insertOne(userToAdd)
    userToAdd._id = res.insertedId
    return userToAdd
  } catch (err) {
    logger.error('cannot add Google user', err)
    throw err
  }
}

async function getOrCreateGoogleUser(profile) {
  let user = await getByGoogleId(profile.id)
  if (!user) {
    user = await addGoogleUser(profile)
  }
  return user
}

// ========== עזר ==========

function _buildCriteria(filterBy) {
  const criteria = {}
  if (filterBy.txt) {
    const txtCriteria = { $regex: filterBy.txt, $options: 'i' }
    criteria.$or = [{ username: txtCriteria }, { fullname: txtCriteria }]
  }
  if (filterBy.minBalance) {
    criteria.score = { $gte: filterBy.minBalance }
  }
  return criteria
}
