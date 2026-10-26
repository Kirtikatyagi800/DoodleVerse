const crypto = require("crypto");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Welcome to DoodleVerse Server!");
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const rooms = new Map();
const WORD_CATEGORIES = {
  Animals: ["Tiger", "Elephant", "Rabbit", "Monkey", "Giraffe"],
  Food: ["Pizza", "Mango", "Burger", "Cake", "Sandwich"],
  Objects: ["Phone", "Chair", "Book", "Umbrella", "Clock"],
  Nature: ["Mountain", "Rainbow", "River", "Forest", "Waterfall"],
};
const drawingHistory = new Map();
const roundTimers = new Map();
const hintTimers = new Map();
const nextTurnTimers = new Map();

const WORDS = [
  "APPLE", "ELEPHANT", "RAINBOW", "PIZZA", "GUITAR",
  "BUTTERFLY", "CASTLE", "ROCKET", "SUNFLOWER", "TURTLE",
  "MOUNTAIN", "ICE CREAM", "AIRPLANE", "LION", "UMBRELLA",
];

function normalizeSettings(input = {}) {
  const clamp = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n)
      ? Math.max(min, Math.min(max, Math.floor(n)))
      : fallback;
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

function clearTimer(map, roomCode) {
  const timer = map.get(roomCode);
  if (timer) clearTimeout(timer);
  map.delete(roomCode);
}

function clearAllRoomTimers(roomCode) {
  clearTimer(roundTimers, roomCode);
  clearTimer(nextTurnTimers, roomCode);

  const timers = hintTimers.get(roomCode) || [];
  timers.forEach(clearTimeout);
  hintTimers.delete(roomCode);
}

function getRoom(socket) {
  const roomCode = socket.data.roomCode;
  return roomCode ? rooms.get(roomCode) : null;
}

function sendRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit("room:state", {
    code: roomCode,
    hostId: room.hostId,
    players: room.players.map(({ id, name }) => ({ id, name })),
    settings: { ...room.settings },
    isPrivate: room.isPrivate,
  });
}

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;

  do {
    code = Array.from(
      { length: 5 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  } while (rooms.has(code));

  return code;
}

function chooseWords(room) {

  const category = room.selectedCategory || "Animals";
  const words = [...(WORD_CATEGORIES[category] || WORD_CATEGORIES.Animals)];

  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }

  return words.slice(
    0,
    Math.min(room.settings.wordCount, words.length)
  );
}

function emitScores(roomCode, room) {
  io.to(roomCode).emit("scores:update", { ...room.scores });
}

function getScoreboard(room) {
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    score: room.scores[player.id] || 0,
  })).sort((a, b) => b.score - a.score);
}

function finishGame(roomCode, room) {
  clearAllRoomTimers(roomCode);

  room.gameStarted = false;
  room.roundEnded = true;
  room.secretWord = null;

  const scores = getScoreboard(room);
  const highestScore = scores.length
    ? Math.max(...scores.map((p) => p.score))
    : 0;

  const winners = scores.filter((p) => p.score === highestScore);

  io.to(roomCode).emit("game:over", {
    message:
      winners.length > 1
        ? "The game ended in a tie!"
        : winners.length === 1
          ? `${winners[0].name} is the winner!`
          : "The game has ended.",
    winners,
    scores,
  });

  sendRoomState(roomCode);
}

function startRoundTimer(roomCode, room) {
  clearTimer(roundTimers, roomCode);

  const duration = room.settings.drawTime;

  roundTimers.set(roomCode, setTimeout(() => {
    const current = rooms.get(roomCode);
    if (
      !current ||
      !current.gameStarted ||
      current.roundEnded ||
      !current.secretWord
    ) return;

    endRound(roomCode, current, "Time is up! Moving to the next player's turn.");
  }, duration * 1000));
}

function scheduleHints(roomCode, room) {
  const timers = [];
  const hintCount = room.settings.hints;

  if (hintCount <= 0) {
    hintTimers.delete(roomCode);
    return;
  }

  const word = room.secretWord;
  const letterIndexes = [...word]
    .map((letter, index) => letter !== " " ? index : -1)
    .filter((index) => index >= 0);

  // Reveal letters gradually without exposing the whole word too early.
  const revealed = new Set();
  const hidden = [...letterIndexes];

  for (let n = 1; n <= Math.min(hintCount, hidden.length); n++) {
    const delay = Math.floor(
      (room.settings.drawTime * n) / (hintCount + 1)
    );

    const timer = setTimeout(() => {
      const current = rooms.get(roomCode);

      if (
        !current ||
        !current.gameStarted ||
        current.roundEnded ||
        !current.secretWord ||
        current.secretWord !== word
      ) return;

      const candidates = letterIndexes.filter((i) => !revealed.has(i));
      if (!candidates.length) return;

      const index = candidates[Math.floor(Math.random() * candidates.length)];
      revealed.add(index);

      const pattern = [...word]
        .map((letter, i) => {
          if (letter === " ") return "/";
          return revealed.has(i) ? letter : "_";
        })
        .join(" ");

      current.players.forEach((player) => {
        if (player.id !== current.currentDrawerId) {
          io.to(player.id).emit("word:hint", { pattern });
        }
      });
    }, Math.max(1000, delay));
    timers.push(timer);
  }

  hintTimers.set(roomCode, timers);
}

function endRound(roomCode, room, message) {
  if (!room.gameStarted || room.roundEnded) return;

  const answer = room.secretWord;

  room.roundEnded = true;
  room.secretWord = null;

  clearTimer(roundTimers, roomCode);

  const hints = hintTimers.get(roomCode) || [];
  hints.forEach(clearTimeout);
  hintTimers.delete(roomCode);

  io.to(roomCode).emit("round:ended", {
    message,
    answer,
    currentRound: room.currentRound,
    totalRounds: room.settings.totalRounds,
  });

  clearTimer(nextTurnTimers, roomCode);

  nextTurnTimers.set(
    roomCode,
    setTimeout(() => {
      const current = rooms.get(roomCode);

      if (!current || !current.gameStarted) return;

      startNextTurn(roomCode, current);
    }, 3000)
  );
}

function startNextTurn(roomCode, room) {
  if (!room || !room.gameStarted) return;

  clearAllRoomTimers(roomCode);

  if (room.players.length < 2) {
    room.gameStarted = false;
    room.roundEnded = true;
    room.secretWord = null;

    io.to(roomCode).emit("round:ended", {
      message: "Not enough players to continue the game.",
    });

    sendRoomState(roomCode);
    return;
  }

  const currentIndex = room.players.findIndex(
    (player) => player.id === room.currentDrawerId
  );

  const nextIndex =
    currentIndex < 0
      ? 0
      : (currentIndex + 1) % room.players.length;

  // A new round begins after every player has had a turn.
  if (nextIndex === 0) {
    if (room.currentRound >= room.settings.totalRounds) {
      finishGame(roomCode, room);
      return;
    }

    room.currentRound += 1;
  }

  const nextPlayer = room.players[nextIndex];

  room.currentDrawerId = nextPlayer.id;
  room.secretWord = null;
  room.roundEnded = false;

  drawingHistory.set(roomCode, []);

  io.to(roomCode).emit("draw:clear");

  io.to(roomCode).emit("game:started", {
    drawerId: nextPlayer.id,
    drawerName: nextPlayer.name,
    currentRound: room.currentRound,
    totalRounds: room.settings.totalRounds,
    drawTime: room.settings.drawTime,
  });

  io.to(nextPlayer.id).emit("word:choices", chooseWords(room));
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("room:create", (payload = {}, callback) => {
    const name = typeof payload.name === "string"
      ? payload.name.trim().slice(0, 20)
      : "";

    if (!name) {
      callback?.({ error: "Please enter your nickname." });
      return;
    }

    const code = makeRoomCode();
    const isPrivate = payload.isPrivate === true;
    const inviteToken = isPrivate
        ? crypto.randomBytes(24).toString("hex")
        : null;

    rooms.set(code, {
      hostId: socket.id,
      isPrivate,
      inviteToken,
      bannedNames: [],
      players: [{ id: socket.id, name }],
      gameStarted: false,
      currentDrawerId: null,
      secretWord: null,
      roundEnded: false,
      scores: {},
      settings: normalizeSettings(payload.settings),
      currentRound: 1,
    });

    drawingHistory.set(code, []);
    socket.join(code);
    socket.data.roomCode = code;

    callback?.({
  success: true,
  code,
  isPrivate,
  inviteToken,
});
    sendRoomState(code);
    console.log(`${name} created room ${code}`);
  });

  socket.on("room:join", (payload = {}, callback) => {
    const name = typeof payload.name === "string"
      ? payload.name.trim().slice(0, 20)
      : "";
    const code = typeof payload.code === "string"
      ? payload.code.trim().toUpperCase()
      : "";

    if (!name || !code) {
      callback?.({ error: "Enter your nickname and room code." });
      return;
    }

    const room = rooms.get(code);
    if (!room) {
  callback?.({ error: "Room not found. Check the code." });
  return;
}

if (room.isPrivate && payload.inviteToken !== room.inviteToken) {
  callback?.({
    error: "This is a private room. Use its valid invite link.",
  });
  return;
}
    if (room?.bannedNames?.includes(name.toLowerCase())) {
        callback?.({ error: "You are banned from this room." });
        return;
    }
    if (room.gameStarted) {
      callback?.({ error: "This game has already started." });
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      callback?.({ error: "This room is full." });
      return;
    }

    room.players.push({ id: socket.id, name });
    room.scores[socket.id] = 0;

    socket.join(code);
    socket.data.roomCode = code;

    callback?.({ success: true, code });
    sendRoomState(code);
    console.log(`${name} joined room ${code}`);
  });

  // Allows the host to change settings before starting.
  // Existing frontend can continue passing settings during room:create.
  socket.on("room:update-settings", (input = {}, callback) => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }
    if (room.hostId !== socket.id) {
      callback?.({ error: "Only the host can change room settings." });
      return;
    }
    if (room.gameStarted) {
      callback?.({ error: "Settings cannot be changed during a game." });
      return;
    }

    room.settings = normalizeSettings({ ...room.settings, ...input });
    sendRoomState(roomCode);
    callback?.({ success: true, settings: room.settings });
  });

  
  socket.on("game:start", (selectedCategory = "Animals") => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || room.hostId !== socket.id) return;
    if (room.gameStarted || room.players.length < 2) return;

    clearAllRoomTimers(roomCode);

    room.gameStarted = true;
    room.selectedCategory = WORD_CATEGORIES[selectedCategory]
      ? selectedCategory
      : "Animals";
    room.currentRound = 1;
    room.currentDrawerId = room.hostId;
    room.secretWord = null;
    room.roundEnded = false;

    room.scores = Object.fromEntries(
      room.players.map((player) => [player.id, 0])
    );

    drawingHistory.set(roomCode, []);
    io.to(roomCode).emit("draw:clear");
    emitScores(roomCode, room);

    const drawer = room.players.find(
      (player) => player.id === room.currentDrawerId
    );

    io.to(roomCode).emit("game:started", {
      drawerId: room.currentDrawerId,
      drawerName: drawer?.name,
      currentRound: room.currentRound,
      totalRounds: room.settings.totalRounds,
      drawTime: room.settings.drawTime,
    });

    io.to(room.currentDrawerId).emit("word:choices", chooseWords(room));
  });

  socket.on("game:play-again", (callback) => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room) {
      callback?.({ error: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      callback?.({ error: "Only the host can restart the game." });
      return;
    }

    if (room.gameStarted) {
      callback?.({ error: "The game is already running." });
      return;
    }

    if (room.players.length < 2) {
      callback?.({ error: "At least 2 players are required." });
      return;
    }

    clearAllRoomTimers(roomCode);

    room.gameStarted = true;
    room.currentRound = 1;
    room.currentDrawerId = room.hostId;
    room.secretWord = null;
    room.roundEnded = false;

    room.scores = Object.fromEntries(
      room.players.map((player) => [player.id, 0])
    );

    drawingHistory.set(roomCode, []);
    io.to(roomCode).emit("draw:clear");
    emitScores(roomCode, room);

    const drawer = room.players.find(
      (player) => player.id === room.currentDrawerId
    );

    io.to(roomCode).emit("game:started", {
      drawerId: room.currentDrawerId,
      drawerName: drawer?.name,
      currentRound: room.currentRound,
      totalRounds: room.settings.totalRounds,
      drawTime: room.settings.drawTime,
    });

    io.to(room.currentDrawerId).emit("word:choices", chooseWords(room));

    callback?.({ success: true });
  });

  socket.on("word:choose", (input) => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || !room.gameStarted || room.roundEnded) return;
    if (room.currentDrawerId !== socket.id || room.secretWord) return;
    if (typeof input !== "string") return;

    const categoryWords =
  WORD_CATEGORIES[room.selectedCategory] || WORD_CATEGORIES.Animals;

const word = categoryWords.find(
  (item) => item.toUpperCase() === input.trim().toUpperCase()
);
    if (!word) return;

    room.secretWord = word;
    room.roundEnded = false;

    io.to(roomCode).emit("word:selected", {
      drawerId: room.currentDrawerId,
      wordLength: word.length,
    });
    io.to(room.currentDrawerId).emit("word:secret", word);

    startRoundTimer(roomCode, room);
    scheduleHints(roomCode, room);
  });

  socket.on("draw:stroke", (stroke) => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || !room.gameStarted || room.roundEnded) return;
    if (room.currentDrawerId !== socket.id || !room.secretWord) return;
    if (!stroke || typeof stroke !== "object") return;

    const history = drawingHistory.get(roomCode) || [];
    history.push(stroke);
    drawingHistory.set(roomCode, history);

    socket.to(roomCode).emit("draw:stroke", stroke);
  });

  socket.on("draw:clear", () => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || !room.gameStarted || room.roundEnded) return;
    if (room.currentDrawerId !== socket.id || !room.secretWord) return;

    drawingHistory.set(roomCode, []);
    io.to(roomCode).emit("draw:clear");
  });

  socket.on("draw:undo", () => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || !room.gameStarted || room.roundEnded) return;
    if (room.currentDrawerId !== socket.id || !room.secretWord) return;

    const history = drawingHistory.get(roomCode) || [];
    if (!history.length) return;

    const lastStrokeId = history[history.length - 1].strokeId;
    if (!lastStrokeId) return;

    const updated = history.filter(
      (stroke) => stroke.strokeId !== lastStrokeId
    );

    drawingHistory.set(roomCode, updated);
    io.to(roomCode).emit("draw:undo", updated);
  });

  socket.on("chat:message", (input) => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || typeof input !== "string") return;

    const message = input.trim().slice(0, 200);
    if (!message) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (
  room.gameStarted &&
  room.secretWord &&
  !room.roundEnded &&
  socket.id !== room.currentDrawerId &&
  message.toUpperCase() === room.secretWord.toUpperCase()
) {
  const points = 100;
  room.scores[socket.id] =
    (room.scores[socket.id] || 0) + points;

  emitScores(roomCode, room);

  io.to(roomCode).emit("guess:correct", {
    playerId: socket.id,
    playerName: player.name,
    points,
    totalScore: room.scores[socket.id],
  });

  endRound(
    roomCode,
    room,
    `${player.name} guessed correctly! Moving to the next player's turn.`
  );

  return;
}

    if (
      room.gameStarted &&
      room.secretWord &&
      !room.roundEnded &&
      socket.id !== room.currentDrawerId
    ) {
      socket.emit("guess:wrong", { text: message });
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
  socket.on("host:remove-player", ({ targetId, ban } = {}, callback) => {
  const roomCode = socket.data.roomCode;
  const room = getRoom(socket);

  if (!room) {
    callback?.({ error: "Room not found." });
    return;
  }

  if (room.hostId !== socket.id) {
    callback?.({ error: "Only the host can kick or ban players." });
    return;
  }

  if (!targetId || targetId === socket.id) {
    callback?.({ error: "You cannot remove yourself." });
    return;
  }

  const target = room.players.find((p) => p.id === targetId);

  if (!target) {
    callback?.({ error: "Player not found in this room." });
    return;
  }

  if (ban) {
    if (!room.bannedNames) room.bannedNames = [];

    const normalizedName = target.name.trim().toLowerCase();

    if (!room.bannedNames.includes(normalizedName)) {
      room.bannedNames.push(normalizedName);
    }
  }

  const targetSocket = io.sockets.sockets.get(targetId);

  if (targetSocket) {
    targetSocket.emit("host:removed", {
      message: ban
        ? "You have been banned from this room."
        : "The host removed you from this room.",
    });

    targetSocket.disconnect(true);
  }

  callback?.({
    success: true,
    message: ban
      ? `${target.name} has been banned.`
      : `${target.name} has been kicked.`,
  });
});

  // Compatibility with the existing client-side timer.
  // The server timer also ends the round; endRound prevents double transitions.
  
socket.on("vote:kick", ({ targetId }, callback) => {
  const roomCode = socket.data.roomCode;
const room = roomCode ? rooms.get(roomCode) : null;

  if (!room) {
    callback?.({ error: "Room not found." });
    return;
  }

  if (!room.players.some((player) => player.id === targetId)) {
    callback?.({ error: "Player not found." });
    return;
  }

  if (targetId === socket.id) {
    callback?.({ error: "You cannot vote to kick yourself." });
    return;
  }

  if (!room.votes) {
    room.votes = {};
  }

  if (!room.votes[targetId]) {
    room.votes[targetId] = [];
  }

  if (room.votes[targetId].includes(socket.id)) {
    callback?.({ error: "You already voted for this player." });
    return;
  }

  room.votes[targetId].push(socket.id);

  const eligibleVoters = room.players.filter(
    (player) => player.id !== targetId
  ).length;

  const voteCount = room.votes[targetId].length;

  io.to(roomCode).emit("vote:updated", {
    targetId,
    voteCount,
    eligibleVoters,
  });

  if (voteCount > eligibleVoters / 2) {
  const target = room.players.find(
    (player) => player.id === targetId
  );

  if (!target) {
    callback?.({ error: "Player not found." });
    return;
  }

  io.to(roomCode).emit("vote:passed", {
    targetId,
    message: `${target.name} was removed by vote.`,
  });

  const targetSocket = io.sockets.sockets.get(targetId);

  if (targetSocket) {
    targetSocket.emit("host:removed", {
      message: "You were removed by a successful vote.",
    });

    targetSocket.disconnect(true);
  }

  room.votes = {};
  callback?.({
    success: true,
    message: `${target.name} was removed by vote.`,
  });
  return;
}

  callback?.({
    success: true,
    message: `Vote recorded (${voteCount}/${eligibleVoters}).`,
  });
});

  socket.on("round:timeup", () => {
    const roomCode = socket.data.roomCode;
    const room = getRoom(socket);

    if (!room || !room.gameStarted || room.roundEnded) return;
    if (room.currentDrawerId !== socket.id || !room.secretWord) return;

    endRound(
      roomCode,
      room,
      "Time is up! Moving to the next player's turn."
    );
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode;
    const room = roomCode ? rooms.get(roomCode) : null;
    if (!room) return;

    const wasDrawer = room.currentDrawerId === socket.id;
    room.players = room.players.filter((p) => p.id !== socket.id);
    delete room.scores[socket.id];

    if (!room.players.length) {
      clearAllRoomTimers(roomCode);
      rooms.delete(roomCode);
      drawingHistory.delete(roomCode);
      console.log("Room deleted:", roomCode);
      return;
    }

    if (room.hostId === socket.id) {
      room.hostId = room.players[0].id;
    }

    if (room.gameStarted && room.players.length < 2) {
      clearAllRoomTimers(roomCode);
      room.gameStarted = false;
      room.roundEnded = true;
      room.secretWord = null;

      io.to(roomCode).emit("round:ended", {
        message: "Not enough players remain. The game has stopped.",
      });
    } else if (room.gameStarted && wasDrawer) {
      clearAllRoomTimers(roomCode);
      room.roundEnded = true;
      room.secretWord = null;

      io.to(roomCode).emit("round:ended", {
        message: "The drawer disconnected. Moving to the next turn.",
      });

      nextTurnTimers.set(roomCode, setTimeout(() => {
        const current = rooms.get(roomCode);
        if (current?.gameStarted) startNextTurn(roomCode, current);
      }, 1500));
    }

    sendRoomState(roomCode);
    console.log("Player disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`DoodleVerse server running on port ${PORT}`);
});
