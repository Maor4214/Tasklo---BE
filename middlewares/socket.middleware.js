import { logger } from '../services/logger.service.js'
import { authService } from '../api/auth/auth.service.js'

export function socketAuth(socket, next) {
    try {
        const loginToken = socket.handshake.auth.loginToken ||
            socket.handshake.headers.cookie?.split('loginToken=')[1]?.split(';')[0]

        if (!loginToken) {
            return next(new Error('Authentication error: No loginToken provided'))
        }

        const loggedinUser = authService.validateToken(loginToken)

        if (!loggedinUser) {
            return next(new Error('Authentication error: Invalid loginToken'))
        }

        socket.loggedinUser = loggedinUser
        socket.userId = loggedinUser._id

        logger.info(`Socket authenticated for user: ${loggedinUser.fullname} [socket: ${socket.id}]`)
        next()
    } catch (err) {
        logger.error(`Socket authentication failed: ${err.message}`)
        next(new Error('Authentication error: Invalid loginToken'))
    }
}

export function socketLogger(socket, next) {
    logger.info(`New socket connection attempt [id: ${socket.id}]`)
    next()
}
