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
import cron from 'node-cron'

import { authRoutes } from './api/auth/auth.routes.js'
import { boardService } from './services/board.service.js'
import { setupSocketAPI } from './services/socket.service.js'
import { userService } from './api/user/user.service.js'
import { setupAsyncLocalStorage } from './middlewares/setupAls.middleware.js'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

const app = express()
const server = http.createServer(app)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const isProduction = process.env.NODE_ENV === 'production'

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
      callbackURL: isProduction
        ? 'https://tasklo.onrender.com/auth/google/callback'
        : 'http://localhost:3031/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log(
          '✅ Google OAuth profile:',
          JSON.stringify(profile, null, 2)
        )
        console.log('🔑 Access Token:', accessToken)

        const user = await userService.getOrCreateGoogleUser(profile)

        console.log('✅ User found/created:', user)
        return done(null, user)
      } catch (err) {
        console.error('❌ Error in Google OAuth callback:', err)
        return done(err)
      }
    }
  )
)

passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

//Wake-up
app.get('/wake-up', (req, res) => {
  res.send('Service is awake and working')
})

// Wake-up task to keep the service active
cron.schedule('*/13 * * * *', async () => {
  try {
    console.log('Wake-up task running')
    await axios.get(`https://YourRenderUrlHere.com/wake-up`)
  } catch (error) {
    console.error('Error during wake-up task:', error)
  }
})

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
    const { description, timeline, user } = req.body
    const currentTimestamp = Date.now()

    let userPrompt = ''
    if (user && user._id) {
      userPrompt = `
- The board's "createdBy" field MUST be set to this user:
  {
    "_id": "${user._id}",
    "username": "${user.username}",
    "fullname": "${user.fullname}",
    "imgUrl": "${user.imgUrl}"
  }
- The "members" array MUST contain only this user.
- DO NOT generate any random members, comments, or activities except for a single board creation activity by this user.
- Only generate tasks (to-do list items, project steps, etc.) relevant to the project description.
- All tasks should be assigned to this user.
- All comments arrays should be empty.
- All activities arrays should contain at most one activity: board creation by this user.
`;
    } else {
      userPrompt = `
- The board's "createdBy" field MUST be null.
- The "members" array should contain a few realistic random members.
- Generate realistic comments, activities, and assignments as before.
`;
    }

    const combinedPrompt = `
You are a helpful assistant that creates project boards like Trello.
${userPrompt}
Your main goal is to generate a project board that precisely matches the provided JSON structure.
You MUST adhere to this structure strictly and DO NOT invent new keys, object types, or deviate from the specified formats.
**IMPORTANT:** Your entire response MUST be valid JSON, and nothing else. Do not include any preambles, explanations, or additional text outside the JSON object.

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
    - If you choose an image, Use a Picsum Photos URL with a seed based on the board title or ID, in the following format:
  https://picsum.photos/seed/<board-title-or-id>/800/600
  Example: for a board with title "project-x", the image URL should be:
  https://picsum.photos/seed/project-x/800/600
  This ensures the board background is consistent for each board.


For 'style.color':
- If 'style.background' is an image URL, 'style.color' MUST be null.
- If 'style.background' is a hex color, 'style.color' may be a hex string or null.

- **IMPORTANT IMAGE RULE:** All imgUrl (for members) and attachments.url MUST be valid public placeholder image URLs. Examples:
    - https://i.pravatar.cc/150?img=1 (for random user images, you can increment the number for different images)
    - https://picsum.photos/400/300 (for general placeholder images, you can vary dimensions)
    - **DO NOT use complex Unsplash URLs for these fields.**
- Reuse 'members' objects and their IDs where needed across tasks and activities to simulate real user interactions.
- DO NOT invent any new keys or object types that are not explicitly defined in the 'Structure reference'.
- Ensure all arrays (labels, members, groups, tasks, comments, memberIds, labelIds, attachments, checklists, todos, activities) are populated with realistic data relevant to the project description.
- Provide a diverse set of example data where applicable (e.g., different statuses, due dates, label combinations).
- **NEW RULE:** All 'tasks' must have a 'status' of "in-progress". No tasks should be "done".
- **IMPORTANT RULE:** All 'dueDate' values for tasks MUST be timestamps representing a date in the future (relative to the current time, ${currentTimestamp}), or 'null'. Do not generate past due dates. Calculate these dates carefully to be truly in the future.
- **IMPORTANT RULE:** The 'activities' array should contain at most one activity. If an activity is present, it MUST be a single activity describing the creation of the board by the 'createdBy' member (e.g., "Board created by [fullname]"). Do not include any other historical activities.
- **ENHANCEMENT RULE:** Generate highly detailed and actionable 'tasks' and 'descriptions'. For example, if the project is a "trip to Japan", include specific attractions, booking steps, and packing lists. If it's "app development", include specific features, modules, and testing phases.
- **ENHANCEMENT RULE:** For tasks that naturally break down into smaller steps, include comprehensive 'checklists' with multiple 'todos'. Ensure 'isDone' is either true or false for checklist items.

Project Description: ${description}
Timeline: ${timeline || 'No specific deadline'}
Current Timestamp (ms): ${currentTimestamp}
Return a complete JSON board object as per the above structure, fulfilling all rules.
`


    console.log(
      'DEBUG: Combined prompt being sent to Gemini API:\n',
      combinedPrompt
    )


    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })


    const result = await model.generateContent(combinedPrompt)

    let text = await result.response.text() 

    try {
 
      text = text.replace(/```json\s*/g, '').replace(/\s*```/g, '')


      const startIndex = text.indexOf('{')
      const endIndex = text.lastIndexOf('}')

      if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
        text = text.substring(startIndex, endIndex + 1)
      } else {
    
        console.warn(
          '⚠️ Could not find clear JSON block. Attempting to parse raw text as is.'
        )
      }

      const board = JSON.parse(text)
      // Enforce createdBy is null for guests
      if (!user || !user._id) board.createdBy = null;
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
