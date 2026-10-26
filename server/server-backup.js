
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();
const drawingHistory = new Map();

const WORDS = [
  "APPLE",
  "ELEPHANT",
  "RAINBOW",
  "PIZZA",
  "GUITAR",
  "BUTTERFLY",
  "CASTLE",
  "ROCKET",
  "SUNFLOWER",
  "TURTLE",
  "MOUNTAIN",
  "ICE CREAM",
  "AIRPLANE",
  "LION",
  "UMBRELLA",
];
const hintTimers = new Map();

function clearHintTimer(roomCode) {
  const timers = hintTimers.get(roomCode);

  if (timers) {
    const timerList = Array.isArray(timers) ? timers : [timers];

    timerList.forEach((timer) => clearTimeout(timer));
    hintTimers.delete(roomCode);
  }
}

function startNextTurn(roomCode, room) {
  if (!room || !room.gameStarted) return;
  clearHintTimer(roomCode);

  const players = room.players;

  if (!Array.isArray(players) || players.length < 2) return;

  const currentIndex = players.findIndex(
    (player) => player.id === room.currentDrawerId
  );

  const nextIndex = (currentIndex + 1) % players.length;

  // A new round begins when the turn returns to the first player
  if (nextIndex === 0) {
    if (room.currentRound >= room.settings.totalRounds) {
      room.gameStarted = false;
      room.secretWord = null;
      room.roundEnded = true;

      const finalScores = players.map((player) => ({
        id: player.id,
        name: player.name,
        score: room.scores[player.id] || 0,
      }));

      const highestScore = Math.max(
        ...finalScores.map((player) => player.score)
      );

      const winners = finalScores.filter(
        (player) => player.score === highestScore
      );

      io.to(roomCode).emit("game:over", {
        message:
          winners.length > 1
            ? "The game ended in a tie!"
            : `${winners[0].name} is the winner!`,
        winners,
        scores: finalScores,
      });

      sendRoomState(roomCode);
      return;
    }

    room.currentRound += 1;
  }
  drawingHistory.set(roomCode, []);
  io.to(roomCode).emit("draw:clear");

  const nextPlayer = players[nextIndex];

  room.currentDrawerId = nextPlayer.id;
  room.secretWord = null;
  room.roundEnded = false;

  io.to(roomCode).emit("game:started", {
    drawerId: nextPlayer.id,
    drawerName: nextPlayer.name,
    currentRound: room.currentRound,
    totalRounds: room.settings.totalRounds,
    drawTime: room.settings.drawTime,
  });

  const choices = [...WORDS]
    .sort(() => Math.random() - 0.5)
    .slice(0, room.settings.wordCount);

  io.to(nextPlayer.id).emit("word:choices", choices);
}


function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = "";
    for (let i = 0; i < 5; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

function sendRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:state", {
    code: roomCode,
    hostId: room.hostId,

    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
    })),
    settings: room.settings,
  });
}
function normalizeSettings(input = {}) {
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);

    if (!Number.isFinite(number)) return fallback;

    return Math.max(min, Math.min(max, Math.floor(number)));
  };

  return {
    maxPlayers: clamp(input.maxPlayers, 2, 20, 8),
    totalRounds: clamp(input.totalRounds, 2, 10, 3),
    drawTime: clamp(input.drawTime, 15, 240, 60),
    wordCount: clamp(input.wordCount, 1, 5, 3),
    hints: clamp(input.hints, 0, 5, 2),
    wordMode: "normal",
  };
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("room:create", ({ name, settings: requestedSettings } = {}, callback) => {
    const playerName =
      typeof name === "string" ? name.trim().slice(0, 20) : "";

    if (!playerName) {
      return callback?.({ error: "Please enter your nickname." });
    }

    const code = makeRoomCode();

    rooms.set(code, {
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName }],
      
      gameStarted: false,
      currentDrawerId: null,
      secretWord: null,
      roundEnded: false,
      scores: {},
      settings: normalizeSettings(requestedSettings),
      currentRound: 1,

    });
    drawingHistory.set(code, []);
    socket.join(code);
    socket.data.roomCode = code;

    callback?.({ success: true, code });
    sendRoomState(code);

    console.log(`${playerName} created room ${code}`);
  });

  socket.on("room:join", ({ name, code } = {}, callback) => {
    const playerName =
      typeof name === "string" ? name.trim().slice(0, 20) : "";
    const roomCode =
      typeof code === "string" ? code.trim().toUpperCase() : "";

    if (!playerName || !roomCode) {
      return callback?.({
        error: "Enter your nickname and room code.",
      });
    }

    const room = rooms.get(roomCode);

    if (!room) {
      return callback?.({ error: "Room not found. Check the code." });
    }

    if (room.players.length >= room.settings.maxPlayers) {
      return callback?.({ error: "This room is full." });
    }

    if (room.players.some((player) => player.id === socket.id)) {
      return callback?.({ error: "You are already in this room." });
    }

    room.players.push({ id: socket.id, name: playerName });

    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    callback?.({ success: true, code: roomCode });
    sendRoomState(roomCode);

    console.log(`${playerName} joined room ${roomCode}`);
  });

socket.on("draw:stroke", (stroke) => {
  const roomCode = socket.data.roomCode;

  if (!roomCode || !rooms.has(roomCode)) return;

  const room = rooms.get(roomCode);

  if (!room.gameStarted) return;
  if (socket.id !== room.currentDrawerId) return;
  if (!room.secretWord || room.roundEnded) return;

  if (!stroke || typeof stroke !== "object") return;

  // Get this room's drawing history
  if (!drawingHistory.has(roomCode)) {
    drawingHistory.set(roomCode, []);
  }

  const history = drawingHistory.get(roomCode);

  // Save the new stroke
  history.push(stroke);

  // Send the stroke to other players
  socket.to(roomCode).emit("draw:stroke", stroke);
});


  socket.on("draw:clear", () => {
    const roomCode = socket.data.roomCode;

    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);

    // Only the current drawer can clear the canvas
    if (!room.gameStarted) return;
    if (socket.id !== room.currentDrawerId) return;
    if (!room.secretWord || room.roundEnded) return;

    drawingHistory.set(roomCode, []);
    io.to(roomCode).emit("draw:clear");
  });

socket.on("draw:undo", () => {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);

  if (!room || !room.gameStarted) return;
  if (socket.id !== room.currentDrawerId) return;
  if (!room.secretWord || room.roundEnded) return;

  const history = drawingHistory.get(roomCode) || [];
  if (history.length === 0) return;

  // Find the most recent drag group
  const lastStrokeId = history[history.length - 1].strokeId;
  if (!lastStrokeId) return;

  // Remove all segments with that drag's ID,
  // even if other segments were stored between them.
  const updatedHistory = history.filter(
    (stroke) => stroke.strokeId !== lastStrokeId
  );

  drawingHistory.set(roomCode, updatedHistory);
  io.to(roomCode).emit("draw:undo", updatedHistory);
});

socket.on("chat:message", (text) => {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);

  if (!room || typeof text !== "string") return;

  const message = text.trim().slice(0, 200);
  if (!message) return;

  const player = room.players.find(
    (item) => item.id === socket.id
  );

  if (!player) return;

  console.log("Guess check:", {
    message,
    secretWord: room.secretWord,
    roundEnded: room.roundEnded,
    drawerId: room.currentDrawerId,
    guesserId: socket.id,
  });

  if (
    room.gameStarted &&
    room.secretWord &&
    !room.roundEnded &&
    socket.id !== room.currentDrawerId &&
    message.toLowerCase() === room.secretWord.toLowerCase()
  ) {
    const points = 100;

    room.scores[socket.id] =
      (room.scores[socket.id] || 0) + points;
    
    io.to(roomCode).emit("scores:update", room.scores);

    clearHintTimer(roomCode);
    room.roundEnded = true;

    io.to(roomCode).emit("guess:correct", {
      playerId: socket.id,
      playerName: player.name,
      points,
      totalScore: room.scores[socket.id],
    });

    room.secretWord = null;

    io.to(roomCode).emit("round:ended", {
      message: `${player.name} guessed correctly! Moving to the next player's turn.`,
    });

    setTimeout(() => {
      const currentRoom = rooms.get(roomCode);

      if (!currentRoom || !currentRoom.gameStarted) return;

      startNextTurn(roomCode, currentRoom);
    }, 2000);

    return;
  }
  if (
  room.gameStarted &&
  room.secretWord &&
  !room.roundEnded &&
  socket.id !== room.currentDrawerId &&
  message.toLowerCase() !== room.secretWord.toLowerCase()
) {
  socket.emit("guess:wrong", {
    text: message,
  });
}
  io.to(roomCode).emit("chat:message", {
    playerName: player.name,
    text: message,
    time: new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
});

socket.on("game:start", () => {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);

  if (!room) return;
  if (room.hostId !== socket.id) return;
  if (room.players.length < 2) return;

    room.gameStarted = true;
    room.currentRound = 1;
    room.currentDrawerId = room.hostId;
    room.secretWord = null;
    room.roundEnded = false;
    room.scores = {};   

  
io.to(roomCode).emit("game:started", {
  drawerId: room.currentDrawerId,
  drawerName: room.players.find(
    (p) => p.id === room.currentDrawerId
  )?.name,
  currentRound: room.currentRound,
  totalRounds: room.settings.totalRounds,
  drawTime: room.settings.drawTime,
});


  const choices = [...WORDS]
  .sort(() => Math.random() - 0.5)
  .slice(0, room.settings.wordCount);

  io.to(room.currentDrawerId).emit("word:choices", choices);
});

socket.on("word:choose", (word) => {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);

  if (!room || !room.gameStarted) return;
  if (room.currentDrawerId !== socket.id) return;
  if (typeof word !== "string" || !WORDS.includes(word)) return;

  room.secretWord = word;
  room.roundEnded = false;
  clearHintTimer(roomCode);


const hintCount = room.settings.hints;

if (hintCount > 0) {
  const totalTime = room.settings.drawTime;
  const hintInterval = Math.max(
    5,
    Math.floor(totalTime / (hintCount + 1))
  );

  const timers = [];

  for (let hintNumber = 1; hintNumber <= hintCount; hintNumber++) {
    const timer = setTimeout(() => {
      const currentRoom = rooms.get(roomCode);

      if (
        !currentRoom ||
        !currentRoom.gameStarted ||
        currentRoom.roundEnded ||
        !currentRoom.secretWord
      ) {
        return;
      }

      const word = currentRoom.secretWord;
      const revealedIndexes = [];

      // Har hint mein kuch naye letters reveal karo
      for (let i = 0; i < word.length; i++) {
        if (word[i] !== " " && i % (hintNumber + 1) === 0) {
          revealedIndexes.push(i);
        }
      }

      // Agar pattern mein abhi bhi letters hide hain,
      // toh agla unrevealed letter bhi dikhao
      const hiddenIndex = [...word].findIndex(
        (letter, i) =>
          letter !== " " && !revealedIndexes.includes(i)
      );

      if (hiddenIndex !== -1) {
        revealedIndexes.push(hiddenIndex);
      }

      const pattern = [...word]
        .map((letter, i) =>
          letter === " "
            ? "/"
            : revealedIndexes.includes(i)
              ? letter
              : "_"
        )
        .join(" ");

      currentRoom.players.forEach((player) => {
        if (player.id !== currentRoom.currentDrawerId) {
          io.to(player.id).emit("word:hint", { pattern });
        }
      });
    }, hintInterval * hintNumber * 1000);

    timers.push(timer);
  }

  hintTimers.set(roomCode, timers);
}

  io.to(roomCode).emit("word:selected", {
    drawerId: room.currentDrawerId,
    wordLength: word.length,
  });

  socket.emit("word:secret", word);
});

socket.on("round:timeup", () => {
  const roomCode = socket.data.roomCode;
  const room = rooms.get(roomCode);

  if (!room || !room.gameStarted) return;
  if (room.currentDrawerId !== socket.id) return;
  if (room.roundEnded) return;

  clearHintTimer(roomCode);
  room.roundEnded = true;
  room.secretWord = null;

  io.to(roomCode).emit("round:ended", {
    message: "Time is up! Moving to the next player's turn.",
  });

  setTimeout(() => {
    const currentRoom = rooms.get(roomCode);

    if (!currentRoom || !currentRoom.gameStarted) return;

    startNextTurn(roomCode, currentRoom);
  }, 2000);
});

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = rooms.get(roomCode);

    if (room) {
      room.players = room.players.filter(
        (player) => player.id !== socket.id
      );

      if (room.players.length === 0) {
        clearHintTimer(roomCode);
        rooms.delete(roomCode);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
        }
        sendRoomState(roomCode);
      }
    }

    console.log("Player disconnected:", socket.id);
  });
});

const PORT = 3000;

server.listen(PORT, () => {
  console.log(`DoodleVerse server running on http://localhost:${PORT}`);
});

