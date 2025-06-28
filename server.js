import http from 'http'
import path from 'path'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'

// import { authRoutes } from './api/auth/auth.routes.js'
// import { userRoutes } from './api/user/user.routes.js'
// import { reviewRoutes } from './api/review/review.routes.js'
// import { carRoutes } from './api/car/car.routes.js'
import { boardService } from './services/board.service.js'
import { setupSocketAPI } from './services/socket.service.js'

import { setupAsyncLocalStorage } from './middlewares/setupAls.middleware.js'

const app = express()
const server = http.createServer(app)

// Express App Config
app.use(cookieParser())
app.use(express.json())

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('public')))
} else {
  const corsOptions = {
    origin: [
      'http://127.0.0.1:3000',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:5174',
      'http://localhost:5174'
    ],
    credentials: true,
  }
  app.use(cors(corsOptions))
}

app.all('/*all', setupAsyncLocalStorage)

app.get('/api', (req, res) => {
  res.send('Welcome to Tasklo API!')
})

// Get all boards
app.get('/api/board', async (req, res) => {
  try {
    const boards = await boardService.query()
    res.send(boards)
  } catch (err) {
    res.status(500).send('Failed to get boards')
  }
})

app.get('/api/board/:boardId', async (req, res) => {
  try {
    const board = await boardService.getById(req.params.boardId)
    res.send(board)
  } catch (err) {
    res.status(404).send('Board not found')
  }
})

app.post('/api/board', async (req, res) => {
  try {
    const newBoard = await boardService.save(req.body)
    res.status(201).send(newBoard)
  } catch (err) {
    res.status(400).send('Failed to create board')
  }
})

app.put('/api/board/:boardId', async (req, res) => {
  try {
    const updatedBoard = await boardService.save({
      ...req.body,
      _id: req.params.boardId,
    })
    res.send(updatedBoard)
  } catch (err) {
    res.status(400).send('Failed to update board')
  }
})

app.delete('/api/board/:boardId', async (req, res) => {
  try {
    await boardService.remove(req.params.boardId)
    res.send('Board removed')
  } catch (err) {
    res.status(400).send('Failed to delete board')
  }
})

app.post('/api/board/:boardId/group', async (req, res) => {
  try {
    const board = await boardService.addGroup(req.params.boardId, req.body)
    res.send(board)
  } catch (err) {
    res.status(400).send('Failed to add group')
  }
})

app.post('/api/board/:boardId/group/:groupId/task', async (req, res) => {
  try {
    const board = await boardService.addTask(
      req.params.boardId,
      req.params.groupId,
      req.body
    )
    res.send(board)
  } catch (err) {
    res.status(400).send('Failed to add task')
  }
})

app.put('/api/board/:boardId/task/move', async (req, res) => {
  const { groupId, taskId, newGroupId } = req.body
  try {
    const board = await boardService.moveTask(
      req.params.boardId,
      groupId,
      taskId,
      newGroupId
    )
    res.send(board)
  } catch (err) {
    res.status(400).send('Failed to move task')
  }
})

setupSocketAPI(server)

app.get('/secret', (req, res) => {
  if (process.env.SECRET_STR) {
    res.send(process.env.SECRET_STR)
  } else {
    res.send('No secret string attached')
  }
})

// Make every unhandled server-side-route match index.html
// so when requesting http://localhost:3030/unhandled-route...
// it will still serve the index.html file
// and allow vue/react-router to take it from there

app.get('/*all', (req, res) => {
  res.sendFile(path.resolve('public/index.html'))
})

import { logger } from './services/logger.service.js'
const port = process.env.PORT || 3031

server.listen(port, () => {
  logger.info('Server is running on: ' + `http://localhost:${port}/`)
})
