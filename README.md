# 🎨 DoodleVerse — Real-Time Multiplayer Drawing & Guessing Game

**Draw it. Guess it. Score it. Play together.**

DoodleVerse is a real-time multiplayer web application inspired by interactive drawing and guessing games. Players can create private rooms, invite friends using a room code, draw selected words on a shared canvas, and compete to earn points by guessing correctly.

Built with React, Node.js, Express, and Socket.IO, DoodleVerse focuses on real-time communication, interactive gameplay, and a smooth multiplayer experience.

## 🚀 Live Demo

**Play Now:** [DoodleVerse Live](https://doodle-verse-p4tphtshi-doodle-verse.vercel.app/)

**Source Code:** [GitHub Repository](https://github.com/Kirtikatyagi800/DoodleVerse)

---

## ✨ Key Features

- **🎮 Multiplayer Rooms:** Create a room and invite other players using a room code.
- **🎨 Real-Time Drawing:** See drawing updates synchronized between players.
- **🧠 Word Guessing Gameplay:** Select words and challenge other players to guess them.
- **💬 Live Chat:** Communicate and submit guesses through the chat interface.
- **🧹 Drawing Tools:** Use the eraser and undo functionality while drawing.
- **🏆 Score Tracking:** Earn points for correct guesses and compete with other players.
- **🔄 Live Game Updates:** Keep players informed about game progress and turns.
- **📱 Interactive Interface:** Enjoy a clean, browser-based gaming experience.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Building the interactive user interface |
| Vite | Frontend development and build tooling |
| JavaScript | Application logic and interactions |
| CSS | Styling and responsive layout |
| Node.js | Backend JavaScript runtime |
| Express.js | Backend HTTP server |
| Socket.IO | Real-time multiplayer communication |
| Vercel | Frontend deployment |
| Render | Backend deployment |

## 🏗️ Project Architecture

DoodleVerse uses a client-server architecture.

- **Frontend (`client/`):** Handles the user interface, room interactions, drawing tools, chat, and gameplay controls.
- **Backend (`server/`):** Manages rooms, player connections, game state, word selection, and scoring.
- **Real-Time Communication:** Socket.IO events synchronize relevant game updates between connected players.

## 📂 Project Structure

```text
DoodleVerse/
├── client/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── server.js
│   └── package.json
├── .gitignore
└── README.md
```

## 🎯 How to Play

1. Open the [DoodleVerse website](https://doodle-verse-p4tphtshi-doodle-verse.vercel.app/).
2. Enter your nickname and create a room.
3. Share the room code with friends.
4. Join the same room from another browser or device.
5. Start the game and follow the word-selection prompt.
6. Draw the selected word while other players try to guess it.
7. Use the chat to submit guesses and earn points for correct answers.

## 💻 Run Locally

### Prerequisites

- [Node.js](https://nodejs.org/)
- npm

### 1. Clone the repository

```bash
git clone https://github.com/Kirtikatyagi800/DoodleVerse.git
cd DoodleVerse
```

### 2. Start the backend

```bash
cd server
npm install
npm start
```

Use the start command configured in `server/package.json` if it differs from `npm start`.

### 3. Start the frontend

Open a second terminal from the project root:

```bash
cd client
npm install
npm run dev
```

Open the local URL provided by Vite in your browser. Ensure the frontend's Socket.IO connection points to your local backend when testing locally.

## 🌱 Future Improvements

- Add player avatars and customizable profiles.
- Improve matchmaking and room discovery.
- Add additional drawing tools and game settings.
- Enhance mobile gameplay and accessibility.
- Introduce persistent leaderboards and player statistics.

## 👩‍💻 Author

**Kirtika Tyagi**

[GitHub Profile](https://github.com/Kirtikatyagi800)

---

*DoodleVerse — Bringing creativity and friendly competition together through real-time web technology.*
