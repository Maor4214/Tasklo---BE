# 🛠️ Tasklo Backend – Trello-Inspired Board Manager API (Node.js + Express)

Tasklo is a robust backend for a Trello-style task management app.  
It provides a full REST API with authentication, real-time updates, AI integration, and database persistence using MongoDB.

---

## 🚀 Features

- 🔄 Full RESTful API for boards, groups, tasks, users, and reviews
- 🔐 User authentication (signup, login, JWT via cookies)
- 🛰️ Real-time collaboration using Socket.IO
- 🧠 AI-powered board generation using Google Gemini API
- 🗃️ MongoDB integration for persistent storage
- 🧱 Modular architecture with clean code separation
- 🧾 Logging and error handling middleware
- 🌍 Environment-based configuration (dev/prod)
- 🔐 CORS and session management

---

## 🧰 Tech Stack

- 🟢 **Node.js** & **Express.js** – Server and routing
- 🍃 **MongoDB** & **mongodb driver** – NoSQL database
- 📡 **Socket.IO** – Real-time communication
- 🌱 **dotenv** – Manage environment variables
- 🍪 **cookie-parser** – Handle cookies
- 🛡️ **express-session** – Session handling
- 🔐 **bcrypt** – Password hashing
- 🤖 **Google Gemini API** – AI-based board creation
- 🧩 **Custom Middleware** – Logging, auth, async context
- 🎨 **SCSS/CSS** – Static frontend assets (when served together)

---

## 📁 Project Structure

```
Tasklo---BE/
│
├── api/
│   ├── auth/         # Authentication logic (login, signup, JWT)
│   ├── user/         # User CRUD and profile
│   └── api.postman.json
│
├── config/           # Environment configs (dev/prod)
├── data/             # Sample and backup data
├── logs/             # Backend logs
├── middlewares/      # Custom Express middlewares
├── public/           # Static files (frontend build output)
├── services/         # Core business logic (DB, sockets, logger, utils)
├── .env              # Environment variables
├── package.json
├── README.md
└── server.js         # Main Express server entry point
```

---

## ⚡ Getting Started

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Set up environment variables**  
   Create a `.env` file in the root directory with your Gemini API key:

   ```
   GEMINI_API_KEY=your-google-gemini-key
   ```

3. **Run the server**

   ```sh
   npm start
   ```

   Or with auto-reload (for development):

   ```sh
   npm run dev
   ```

4. **API will be available at:**  
   [http://localhost:3030](http://localhost:3030)

---

## 📚 API Endpoints

- `POST /api/auth` – Login, signup, logout
- `GET /api/user` – Get users, user profile
- `GET /api/board` – Boards, groups, and tasks
- `GET /api/review` – Reviews system
- `POST /api/ai/board` – AI-generated board creation

---

## 📝 License

This project is licensed under the MIT License.

---

**Tasklo Backend** – Built with ❤️ using Node.js, Express, and MongoDB.
