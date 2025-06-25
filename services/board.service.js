import { dbService } from './db.service.js'
import { ObjectId } from 'mongodb'

export const boardService = {
  query,
  getById,
  save,
  remove,
  addGroup,
  addTask,
  moveTask,
}

async function query(filterBy = {}) {
  const criteria = {}
  if (filterBy.txt) {
    criteria.title = { $regex: filterBy.txt, $options: 'i' }
  }
  const collection = await dbService.getCollection('board')
  return await collection.find(criteria).toArray()
}

async function getById(boardId) {
  const collection = await dbService.getCollection('board')
  return await collection.findOne({ _id: new ObjectId(boardId) })
}

async function save(board) {
  const collection = await dbService.getCollection('board')
  if (board._id) {
    const id = new ObjectId(board._id)
    delete board._id
    await collection.updateOne({ _id: id }, { $set: board })
    board._id = id
    return board
  } else {
    board.createdAt = Date.now()
    board.activities = []
    board.members = [board.createdBy]
    const res = await collection.insertOne(board)
    board._id = res.insertedId
    return board
  }
}

async function remove(boardId) {
  const collection = await dbService.getCollection('board')
  await collection.deleteOne({ _id: new ObjectId(boardId) })
}

async function addGroup(boardId, group) {
  const board = await getById(boardId)
  group.id = _makeId()
  group.tasks = []
  board.groups.push(group)
  return await save(board)
}

async function addTask(boardId, groupId, task) {
  const board = await getById(boardId)
  const group = board.groups.find((g) => g.id === groupId)
  task.id = _makeId()
  group.tasks.push(task)
  return await save(board)
}

async function moveTask(boardId, groupId, taskId, newGroupId) {
  const board = await getById(boardId)
  const fromGroup = board.groups.find((g) => g.id === groupId)
  const task = fromGroup.tasks.find((t) => t.id === taskId)
  fromGroup.tasks = fromGroup.tasks.filter((t) => t.id !== taskId)
  const toGroup = board.groups.find((g) => g.id === newGroupId)
  toGroup.tasks.push(task)
  return await save(board)
}
