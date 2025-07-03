import dotenv from 'dotenv'
dotenv.config()

import http from 'http'
import path from 'path'
import cors from 'cors'
import express from 'express'
import cookieParser from 'cookie-parser'
import session from 'express-session'
import { GoogleGenerativeAI } from '@google/generative-ai'
import passport from 'passport'

import { authRoutes } from './api/auth/auth.routes.js'
import { boardService } from './services/board.service.js'
import { setupSocketAPI } from './services/socket.service.js'
import { setupAsyncLocalStorage } from './middlewares/setupAls.middleware.js'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

const app = express()
const server = http.createServer(app)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

app.use(cookieParser())
app.use(express.json())

app.use(
  session({
    secret: 'tasklo-is-the-best',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
)
app.use(passport.initialize())
app.use(passport.session())

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
      'http://localhost:5174',
    ],
    credentials: true,
  }
  app.use(cors(corsOptions))
}

app.all('/*all', setupAsyncLocalStorage)

app.use('/api/auth', authRoutes)
app.get('/api', (req, res) => {
  res.send('Welcome to Tasklo API!')
})

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
    },
    (accessToken, refreshToken, profile, done) => {
      console.log('✅ Google Profile:', profile)
      return done(null, profile)
    }
  )
)

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

//google login routes

app.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    res.redirect('https://tasklo.onrender.com/board')
  }
)

app.get('/auth/profile', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).send('Not logged in')
  res.send(req.user)
})

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/')
  })
})

// ====== Board Routes ======

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

app.put('/api/board/:boardId/task/:taskId', async (req, res) => {
  try {
    const board = await boardService.saveTask(
      req.params.boardId,
      req.body.groupId,
      req.body.task,
      req.body.activity
    )
    res.send(board)
  } catch (err) {
    res.status(400).send('Failed to save task')
  }
})

app.post('/api/board/:boardId/activity', async (req, res) => {
  try {
    const board = await boardService.addActivity(req.params.boardId, req.body)
    res.send(board)
  } catch (err) {
    res.status(400).send('Failed to add activity')
  }
})

app.put('/api/board/:boardId/move-task', async (req, res) => {
  const { fromGroupId, toGroupId, taskId } = req.body
  try {
    const board = await boardService.moveTask(
      req.params.boardId,
      fromGroupId,
      taskId,
      toGroupId
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

app.get('/test-board', async (req, res) => {
  try {
    res.json({
      boardServiceExists: !!boardService,
      boardServiceType: typeof boardService,
      hasQueryMethod: typeof boardService?.query,
      nodeEnv: process.env.NODE_ENV,
      message: 'Debug test successful',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ai/board', async (req, res) => {
  try {
    const { description, timeline } = req.body

    const combinedPrompt = `
You are a helpful assistant that creates project boards like Trello.
Your main goal is to generate a project board that precisely matches the provided JSON structure.
You MUST adhere to this structure strictly and DO NOT invent new keys, object types, or deviate from the specified formats.

Structure reference:
{
  "title": string,
  "createdAt": number (timestamp), // Generate a realistic timestamp for creation.
  "labels": [
    {
      "id": string, // Unique ID for the label.
      "title": string,
      "color": string (hex) // Use standard hex colors like "#RRGGBB".
    }
  ],
  "createdBy": {
    "_id": string,
    "username": string,
    "fullname": string,
    "imgUrl": string (URL) // Use placeholder images or generate realistic ones.
  },
  "style": {
    "background": string (Unsplash URL OR hex color), // IMPORTANT: If background is an image, it MUST be an Unsplash URL (https://images.unsplash.com/...). If it's a color, it must be a hex code.
    "color": string OR null // IMPORTANT: If 'background' is a URL (image), 'color' MUST be null. If 'background' is a hex color, 'color' can be a hex string or null.
  },
  "members": [ // Array of member objects, same structure as 'createdBy'. Reuse members where logical.
    {
      "_id": string,
      "username": string,
      "fullname": string,
      "imgUrl": string (URL)
    }
  ],
  "groups": [ // Represents lists/columns on the board.
    {
      "id": string, // Unique ID for the group.
      "title": string,
      "style": object, // Can be an empty object {}.
      "tasks": [ // Array of task objects (cards).
        {
          "id": string, // Unique ID for the task.
          "title": string,
          "status": string ("in-progress"), // IMPORTANT: Tasks MUST be "in-progress" for a new board.
          "description": string,
          "comments": [
            {
              "id": string,
              "txt": string,
              "createdAt": number,
              "byMember": {
                "fullname": string,
                "imgUrl": string
              }
            }
          ],
          "memberIds": [string], // Array of member IDs assigned to the task.
          "labelIds": [string], // Array of label IDs applied to the task.
          "createdAt": number,
          "dueDate": number OR null, // IMPORTANT: Due date MUST be in the future or null.
          "byMember": { // Member who created/is responsible for the task.
                "fullname": string,
                "imgUrl": string
              },
          "style": {
            "background": string (hex) // Optional: hex color for card background.
          },
          "groupId": string, // ID of the group this task belongs to.
          "attachments": [
            {
              "id": string,
              "url": string,
              "title": string,
              "createdAt": number
            }
          ],
          "checklists": [
            {
              "id": string,
              "title": string,
              "todos": [
                {
                  "id": string,
                  "title": string,
                  "isDone": boolean // Can be true or false within a checklist
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  "activities": [ // Recent activities on the board.
    {
      "id": string,
      "txt": string, // Description of the activity.
      "createdAt": number,
      "byMember": { // Member who performed the activity.
                "fullname": string,
                "imgUrl": string
              }
    }
  ],
  "isStarred": boolean // Whether the board is starred.
}

Rules to follow strictly:
- Generate realistic board content (titles, tasks, descriptions, comments, members) based on the user's project description.
- All IDs (_id, id) MUST be simple unique strings (e.g., short alphanumeric strings like "abc123"). Do not use UUID format unless explicitly requested.
- Timestamps (createdAt, dueDate) MUST be numerical Unix timestamps (milliseconds since epoch).
- For 'style.background':
    - If you choose an image, it MUST be a valid Unsplash URL (e.g., https://images.unsplash.com/photo-...).
    - If you choose a hex color (e.g., "#FF5733"), 'color' MUST be a valid hex string or null.
    - If 'style.background' is an Unsplash URL (image), 'style.color' MUST be null.
    - If 'style.background' is a hex color, 'style.color' can be a hex string (for text color) or null.
- All image URLs (imgUrl, attachments.url) MUST be valid public image URLs. For member images, you can use placeholder images or generate realistic-looking URLs.
- Reuse 'members' objects and their IDs where needed across tasks and activities to simulate real user interactions.
- DO NOT invent any new keys or object types that are not explicitly defined in the 'Structure reference'.
- Ensure all arrays (labels, members, groups, tasks, comments, memberIds, labelIds, attachments, checklists, todos, activities) are populated with realistic data relevant to the project description.
- Provide a diverse set of example data where applicable (e.g., different statuses, due dates, label combinations).
- **NEW RULE:** All 'tasks' must have a 'status' of "in-progress". No tasks should be "done".
- **NEW RULE:** All 'dueDate' values for tasks MUST be timestamps representing a date in the future (relative to the current time when the prompt is generated), or 'null'. Do not generate past due dates.
- **NEW RULE:** The 'activities' array should contain at most one activity. If an activity is present, it MUST be a single activity describing the creation of the board by the 'createdBy' member (e.g., "Board created by [fullname]"). Do not include any other historical activities.

Project Description: ${description}
Timeline: ${timeline || 'No specific deadline'}
Return a complete JSON board object as per the above structure, fulfilling all rules.
`

    // --- הדפסה לניפוי באגים: הפרומפט המאוחד שנשלח למודל ---
    console.log(
      'DEBUG: Combined prompt being sent to Gemini API:\n',
      combinedPrompt
    )

    // הסרה של קטעי קוד לניפוי באגים של גרסת הספרייה כדי למנוע שגיאות 'require is not defined'
    // וודא שאתה עדיין עם גרסה עדכנית של הספרייה (@google/generative-ai) באמצעות npm install @google/generative-ai@latest

    // שימוש במודל gemini-2.0-flash (מודל מהיר יותר וזמין יותר)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // קריאת generateContent עם הפרומפט המאוחד (מחרוזת יחידה)
    const result = await model.generateContent(combinedPrompt)

    let text = await result.response.text() // השתמש ב-let כי אנחנו הולכים לשנות את text

    try {
      // שלב הניקוי הקריטי: הסרת בלוקי קוד של Markdown
      text = text.replace(/```json\s*/g, '').replace(/\s*```/g, '')

      const board = JSON.parse(text)
      res.json(board)
    } catch (err) {
      console.error('❌ Failed to parse AI JSON. Raw text received:', text)
      res.status(500).send('AI response could not be parsed')
    }
  } catch (err) {
    console.error('❌ Failed to generate board:', err)
    res.status(500).send('Failed to generate board')
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
