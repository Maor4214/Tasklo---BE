import { logger } from './logger.service.js'
import { Server } from 'socket.io'
import { asyncLocalStorage } from '../services/als.service.js'
import { boardService } from '../services/board.service.js'
import { socketAuth, socketLogger } from '../middlewares/socket.middleware.js'
import { makeId } from '../services/util.service.js'

var gIo = null

export function setupSocketAPI(http) {
    gIo = new Server(http, {
        cors: {
            origin: '*',
        }
    })
    gIo.use(socketLogger)
    gIo.use(socketAuth)

    gIo.on('connection', socket => {
        logger.info(`New authenticated socket connected [id: ${socket.id}, user: ${socket.loggedinUser.fullname}]`)
        socket.join(`user:${socket.userId}`)

        socket.on('disconnect', (reason) => {
            logger.info(`Socket disconnected [id: ${socket.id}, user: ${socket.loggedinUser.fullname}, reason: ${reason}]`)
        })

        const withContext = (handler) => {
            return (...args) => {
                asyncLocalStorage.run({ loggedinUser: socket.loggedinUser }, () => {
                    handler(...args)
                })
            }
        }

        socket.on('chat-set-topic', topic => {
            if (socket.myTopic === topic) return
            if (socket.myTopic) {
                socket.leave(socket.myTopic)
                logger.info(`Socket is leaving topic ${socket.myTopic} [id: ${socket.id}]`)
            }
            socket.join(topic)
            socket.myTopic = topic
        })
        socket.on('chat-send-msg', msg => {
            logger.info(`New chat msg from socket [id: ${socket.id}], emitting to topic ${socket.myTopic}`)
            // emits to all sockets:
            // gIo.emit('chat addMsg', msg)
            // emits only to sockets in the same room
            gIo.to(socket.myTopic).emit('chat-add-msg', msg)
        })

        socket.on('user-watch', userId => {
            logger.info(`user-watch from socket [id: ${socket.id}], on user ${userId}`)
            socket.join('watching:' + userId)
        })


        socket.on('set-user-socket', userId => {
            logger.info(`Setting socket.userId = ${userId} for socket [id: ${socket.id}]`)
            socket.userId = userId
        })
        socket.on('unset-user-socket', () => {
            logger.info(`Removing socket.userId for socket [id: ${socket.id}]`)
            delete socket.userId
        })

        // Board watching
        socket.on('board-watch', (boardId) => {
            logger.info(`Socket ${socket.id} watching board: ${boardId}`)
            socket.join(`board:${boardId}`)
        })

        socket.on('board-unwatch', (boardId) => {
            logger.info(`Socket ${socket.id} unwatching board: ${boardId}`)
            socket.leave(`board:${boardId}`)
        })

        // Board events
        socket.on('board-updated', withContext((data) => {
            logger.info('Board updated via socket:', data)
            socket.to(`board:${data.boardId}`).emit('board-updated', data)
        }))

        // Group events
        socket.on('group-add', withContext(async (data) => {
            try {
                logger.info('Adding group via socket:', data)
                const { boardId, ...groupData } = data

                const updatedBoard = await boardService.addGroup(boardId, groupData)
                const addedGroup = updatedBoard.groups[updatedBoard.groups.length - 1]

                socket.to(`board:${boardId}`).emit('group-added', {
                    boardId,
                    ...addedGroup
                })

                logger.info(`Group added successfully: ${addedGroup.id}`)
            } catch (err) {
                logger.error('Error adding group via socket:', err)
                socket.emit('error', { message: 'Failed to add group' })
            }
        }))

        socket.on('group-update', withContext(async (data) => {
            try {
                logger.info('Updating group via socket:', data)
                const { boardId, groupId, ...updates } = data

                const board = await boardService.getById(boardId)
                const groupIndex = board.groups.findIndex(g => g.id === groupId)

                if (groupIndex === -1) {
                    throw new Error('Group not found')
                }

                board.groups[groupIndex] = { ...board.groups[groupIndex], ...updates }
                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('group-updated', {
                    boardId,
                    ...board.groups[groupIndex]
                })

                logger.info(`Group updated successfully: ${groupId}`)
            } catch (err) {
                logger.error('Error updating group via socket:', err)
                socket.emit('error', { message: 'Failed to update group' })
            }
        }))

        socket.on('group-delete', withContext(async (data) => {
            try {
                logger.info('Deleting group via socket:', data)
                const { boardId, groupId } = data

                const board = await boardService.getById(boardId)
                board.groups = board.groups.filter(g => g.id !== groupId)
                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('group-deleted', {
                    boardId,
                    groupId
                })

                logger.info(`Group deleted successfully: ${groupId}`)
            } catch (err) {
                logger.error('Error deleting group via socket:', err)
                socket.emit('error', { message: 'Failed to delete group' })
            }
        }))

        socket.on('group-move', withContext(async (data) => {
            try {
                logger.info('Moving group via socket:', data)
                const { boardId, groupId, sourceIndex, targetIndex } = data

                const board = await boardService.getById(boardId)

                const [movedGroup] = board.groups.splice(sourceIndex, 1)
                board.groups.splice(targetIndex, 0, movedGroup)

                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('group-moved', {
                    boardId,
                    groupId,
                    sourceIndex,
                    targetIndex
                })

                logger.info(`Group moved successfully: ${groupId}`)
            } catch (err) {
                logger.error('Error moving group via socket:', err)
                socket.emit('error', { message: 'Failed to move group' })
            }
        }))

        // Task events
        socket.on('task-add', withContext(async (data) => {
            try {
                logger.info('Adding task via socket:', data)
                const { boardId, groupId, ...taskData } = data

                const updatedBoard = await boardService.addTask(boardId, groupId, taskData)
                const group = updatedBoard.groups.find(g => g.id === groupId)
                const addedTask = group.tasks[group.tasks.length - 1]

                socket.to(`board:${boardId}`).emit('task-added', {
                    boardId,
                    groupId,
                    ...addedTask
                })

                logger.info(`Task added successfully: ${addedTask.id}`)
            } catch (err) {
                logger.error('Error adding task via socket:', err)
                socket.emit('error', { message: 'Failed to add task' })
            }
        }))

        socket.on('task-update', withContext(async (data) => {
            try {
                logger.info('Updating task via socket:', data)
                const { boardId, taskId, ...updates } = data

                const board = await boardService.getById(boardId)
                let taskFound = false

                board.groups.forEach(group => {
                    const taskIndex = group.tasks.findIndex(t => t.id === taskId)
                    if (taskIndex !== -1) {
                        group.tasks[taskIndex] = { ...group.tasks[taskIndex], ...updates }
                        taskFound = true
                    }
                })

                if (!taskFound) {
                    throw new Error('Task not found')
                }

                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('task-updated', {
                    boardId,
                    taskId,
                    ...updates
                })

                logger.info(`Task updated successfully: ${taskId}`)
            } catch (err) {
                logger.error('Error updating task via socket:', err)
                socket.emit('error', { message: 'Failed to update task' })
            }
        }))

        socket.on('task-delete', withContext(async (data) => {
            try {
                logger.info('Deleting task via socket:', data)
                const { boardId, taskId, groupId } = data

                const board = await boardService.getById(boardId)
                const group = board.groups.find(g => g.id === groupId)

                if (!group) {
                    throw new Error('Group not found')
                }

                group.tasks = group.tasks.filter(t => t.id !== taskId)
                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('task-deleted', {
                    boardId,
                    taskId,
                    groupId
                })

                logger.info(`Task deleted successfully: ${taskId}`)
            } catch (err) {
                logger.error('Error deleting task via socket:', err)
                socket.emit('error', { message: 'Failed to delete task' })
            }
        }))

        socket.on('task-move', withContext(async (data) => {
            try {
                logger.info('Moving task via socket:', data)
                const { boardId, taskId, sourceGroupId, targetGroupId } = data

                await boardService.moveTask(boardId, sourceGroupId, taskId, targetGroupId)

                socket.to(`board:${boardId}`).emit('task-moved', {
                    boardId,
                    taskId,
                    sourceGroupId,
                    targetGroupId
                })

                logger.info(`Task moved successfully: ${taskId}`)
            } catch (err) {
                logger.error('Error moving task via socket:', err)
                socket.emit('error', { message: 'Failed to move task' })
            }
        }))

        // Activity events
        socket.on('activity-add', withContext(async (data) => {
            try {
                logger.info('Adding activity via socket:', data)
                const { boardId, activity } = data

                const board = await boardService.getById(boardId)
                const newActivity = {
                    id: makeId(),
                    ...activity,
                    createdAt: new Date(),
                    byMember: socket.loggedinUser
                }

                if (!board.activities) {
                    board.activities = []
                }
                board.activities.push(newActivity)
                await boardService.save(board)

                socket.to(`board:${boardId}`).emit('activity-added', {
                    boardId,
                    activity: newActivity
                })

                logger.info(`Activity added successfully: ${newActivity.id}`)
            } catch (err) {
                logger.error('Error adding activity via socket:', err)
                socket.emit('error', { message: 'Failed to add activity' })
            }
        }))
    })
}

function emitTo({ type, data, label }) {
    if (label) gIo.to('watching:' + label.toString()).emit(type, data)
    else gIo.emit(type, data)
}

async function emitToUser({ type, data, userId }) {
    userId = userId.toString()
    const socket = await _getUserSocket(userId)

    if (socket) {
        logger.info(`Emiting event: ${type} to user: ${userId} socket [id: ${socket.id}]`)
        socket.emit(type, data)
    } else {
        logger.info(`No active socket for user: ${userId}`)
        // _printSockets()
    }
}

// If possible, send to all sockets BUT not the current socket 
// Optionally, broadcast to a room / to all
async function broadcast({ type, data, room = null, userId }) {
    userId = userId.toString()

    logger.info(`Broadcasting event: ${type}`)
    const excludedSocket = await _getUserSocket(userId)
    if (room && excludedSocket) {
        logger.info(`Broadcast to room ${room} excluding user: ${userId}`)
        excludedSocket.broadcast.to(room).emit(type, data)
    } else if (excludedSocket) {
        logger.info(`Broadcast to all excluding user: ${userId}`)
        excludedSocket.broadcast.emit(type, data)
    } else if (room) {
        logger.info(`Emit to room: ${room}`)
        gIo.to(room).emit(type, data)
    } else {
        logger.info(`Emit to all`)
        gIo.emit(type, data)
    }
}

async function _getUserSocket(userId) {
    const sockets = await _getAllSockets()
    const socket = sockets.find(s => s.userId === userId)
    return socket
}
async function _getAllSockets() {
    // return all Socket instances
    const sockets = await gIo.fetchSockets()
    return sockets
}

async function _printSockets() {
    const sockets = await _getAllSockets()
    console.log(`Sockets: (count: ${sockets.length}):`)
    sockets.forEach(_printSocket)
}
function _printSocket(socket) {
    console.log(`Socket - socketId: ${socket.id} userId: ${socket.userId}`)
}

export const socketService = {
    // set up the sockets service and define the API
    setupSocketAPI,
    // emit to everyone / everyone in a specific room (label)
    emitTo,
    // emit to a specific user (if currently active in system)
    emitToUser,
    // Send to all sockets BUT not the current socket - if found
    // (otherwise broadcast to a room / to all)
    broadcast,
}
