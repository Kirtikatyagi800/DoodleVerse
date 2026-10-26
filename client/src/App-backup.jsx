
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:3000", {
  autoConnect: false,
});

const COLORS = [
  "#222222",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
];

export default function App() {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);

  const [playerName, setPlayerName] = useState("");
  const [roomSettings, setRoomSettings] = useState({
    maxPlayers: 8,
    totalRounds: 3,
    drawTime: 60,
    wordCount: 3,
  });
  const [roomCode, setRoomCode] = useState("");
  const [currentRoom, setCurrentRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState("");
  const [message, setMessage] = useState("");
  
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [gameNotice, setGameNotice] = useState("");
  const [scores, setScores] = useState({});
  const [winnerData, setWinnerData] = useState(null);

  const [color, setColor] = useState("#222222");
  const [brushSize, setBrushSize] = useState(5);
  const [eraser, setEraser] = useState(false);
  
  const [gameStarted, setGameStarted] = useState(false);
  const [drawerId, setDrawerId] = useState(null);
  const canDraw = !gameStarted || socket.id === drawerId;
  const [wordChoices, setWordChoices] = useState([]);
  const [secretWord, setSecretWord] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [wordLength, setWordLength] = useState(0);
  const [drawingHistory, setDrawingHistory] = useState([]);

  
useEffect(() => {
  if (!gameStarted || wordLength === 0 || timeLeft <= 0) {
    return;
  }

  const timerId = setTimeout(() => {
    setTimeLeft((previous) => previous - 1);
  }, 1000);

  return () => clearTimeout(timerId);
}, [gameStarted, wordLength, timeLeft]);

useEffect(() => {
  if (!gameStarted || wordLength === 0 || timeLeft !== 0) {
    return;
  }

  if (socket.id !== drawerId) return;

  socket.emit("round:timeup");
}, [gameStarted, wordLength, timeLeft, drawerId]);

  function drawSegment(stroke) {
    const canvas = canvasRef.current;
    if (!canvas || !stroke) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(
      stroke.fromX * canvas.width,
      stroke.fromY * canvas.height
    );
    ctx.lineTo(
      stroke.toX * canvas.width,
      stroke.toY * canvas.height
    );
    ctx.strokeStyle = stroke.erase ? "#ffffff" : stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
function redrawCanvas(strokes) {
  clearCanvas();

  strokes.forEach((stroke) => {
    drawSegment(stroke);
  });
}

  useEffect(() => {
    function handleRoomState(data) {
      setCurrentRoom(data);
      setPlayers(data.players);
      setHostId(data.hostId);
      setRoomCode(data.code);
    }
function handleRemoteStroke(stroke) {
  drawSegment(stroke);
  setDrawingHistory((previous) => [...previous, stroke]);
}

    function handleRemoteClear() {
      clearCanvas();
      setDrawingHistory([]);
    }
    
function handleRemoteUndo(strokes) {
  if (!Array.isArray(strokes)) return;

  setDrawingHistory(strokes);
  redrawCanvas(strokes);
}

    socket.on("room:state", handleRoomState);
    socket.on("draw:stroke", handleRemoteStroke);
    socket.on("draw:clear", handleRemoteClear);
    socket.on("draw:undo", handleRemoteUndo);
    
function handleChatMessage(data) {
  console.log("Chat message received:", data);
  setChatMessages((previous) => [...previous, data].slice(-100));
}
function handleWrongGuess() {
  console.log("WRONG GUESS EVENT RECEIVED");
  setGameNotice("Wrong guess! Try again.");
}

socket.on("chat:message", handleChatMessage);
socket.on("guess:wrong", handleWrongGuess);

function handleCorrectGuess(data) {
  console.log("CORRECT GUESS EVENT RECEIVED:", data);
  setGameNotice(`${data.playerName} guessed correctly! +${data.points} points`);

  setScores((previous) => ({
    ...previous,
    [data.playerId]: data.totalScore,
  }));
}

socket.on("guess:correct", handleCorrectGuess);


function handleGameStarted(data) {
  setGameStarted(true);
  setGameNotice("");
  clearCanvas();
  setDrawingHistory([]);
  setTimeLeft(data.drawTime || 60);
  setDrawerId(data.drawerId);
  setWordChoices([]);
  setSecretWord("");
  setWordLength(0);
}

function handleWordChoices(words) {
  setWordChoices(words);
}

function handleWordSelected(data) {
  setDrawerId(data.drawerId);
  setWordLength(data.wordLength);
}

function handleSecretWord(word) {
  setSecretWord(word);
}

socket.on("game:started", handleGameStarted);
socket.on("word:choices", handleWordChoices);
socket.on("word:selected", handleWordSelected);
socket.on("word:secret", handleSecretWord);

function handleRoundEnded(data) {
  setGameNotice(data.message);
  setWordChoices([]);
  setSecretWord("");
  setWordLength(0);
  setTimeLeft(0);
}
function handleGameOver(data) {
  setGameStarted(false);
  setWinnerData(data);
  setGameNotice(data.message);
  setWordChoices([]);
  setSecretWord("");
  setWordLength(0);
  setTimeLeft(0);

  const finalScores = {};
  data.scores.forEach((item) => {
    finalScores[item.id] = item.score;
  });
  setScores(finalScores);

}
socket.on("round:ended", handleRoundEnded);
socket.on("game:over", handleGameOver);

    return () => {
      socket.off("room:state", handleRoomState);
      socket.off("draw:stroke", handleRemoteStroke);
      socket.off("draw:clear", handleRemoteClear);
      socket.off("chat:message", handleChatMessage);
      socket.off("guess:correct", handleCorrectGuess);
      
socket.off("game:started", handleGameStarted);
socket.off("word:choices", handleWordChoices);
socket.off("word:selected", handleWordSelected);
socket.off("word:secret", handleSecretWord);
socket.off("round:ended", handleRoundEnded);
socket.off("game:over", handleGameOver);
socket.off("draw:undo", handleRemoteUndo);
    };
  }, []);

  function connectSocket(eventName, data) {
    setMessage("Connecting...");

    function performAction() {
      socket.emit(eventName, data, (response) => {
        if (response?.error) {
          setMessage(response.error);
          return;
        }

        if (response?.success) {
          setRoomCode(response.code);
          setMessage("Connected! Share the room code with friends.");
        }
      });
    }

    if (socket.connected) {
      performAction();
      return;
    }

    socket.once("connect", performAction);
    socket.once("connect_error", handleConnectionError);
    socket.connect();
  }

  function handleConnectionError() {
    setMessage("Server se connect nahi ho pa raha. Backend terminal check karo.");
  }

  function createRoom() {
    if (!playerName.trim()) {
      setMessage("Please enter your nickname first.");
      return;
    }

   connectSocket("room:create", {
  name: playerName.trim(),
  settings: roomSettings,
});
  }

  function joinRoom() {
    if (!playerName.trim() || !roomCode.trim()) {
      setMessage("Nickname aur room code dono enter karo.");
      return;
    }

    connectSocket("room:join", {
      name: playerName.trim(),
      code: roomCode.trim().toUpperCase(),
    });
  }

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  
function startDrawing(event) {
  if (!currentRoom || !gameStarted || !canDraw || !secretWord) {
    return;
  }

  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);

  drawingRef.current = true;
  lastPointRef.current = getPoint(event);

  const point = lastPointRef.current;

  const stroke = {
    fromX: point.x,
    fromY: point.y,
    toX: point.x + 0.0001,
    toY: point.y + 0.0001,
    color,
    size: brushSize,
    erase: eraser,
  };

  drawSegment(stroke);

  setDrawingHistory((previousHistory) => [
    ...previousHistory,
    stroke,
  ]);

  socket.emit("draw:stroke", stroke);
}

  
function continueDrawing(event) {
  if (
    !canDraw ||
    !secretWord ||
    !drawingRef.current ||
    !lastPointRef.current
  ) {
    return;
  }

  event.preventDefault();

  const point = getPoint(event);
  const previous = lastPointRef.current;

  const stroke = {
    fromX: previous.x,
    fromY: previous.y,
    toX: point.x,
    toY: point.y,
    color,
    size: brushSize,
    erase: eraser,
  };

  drawSegment(stroke);

  // Save the local stroke for Undo
  setDrawingHistory((previousHistory) => [
    ...previousHistory,
    stroke,
  ]);

  socket.emit("draw:stroke", stroke);
  lastPointRef.current = point;
}


  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearRoomCanvas() {
    socket.emit("draw:clear");
  }
  
function undoLastStroke() {
  if (
    !gameStarted ||
    socket.id !== drawerId ||
    !secretWord
  ) {
    return;
  }

  socket.emit("draw:undo");
}

  
function sendChatMessage(event) {

  event.preventDefault();

  const text = chatInput.trim();
  if (!text || !socket.connected) return;

  socket.emit("chat:message", text);
  setChatInput("");
}

function startGame() {
  socket.emit("game:start");
}

function chooseWord(word) {
  socket.emit("word:choose", word);
  setWordChoices([]);
}


  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setMessage("Room code copied!");
    } catch {
      setMessage(`Room code: ${roomCode}`);
    }
  }

  return (
    <main className="app-container">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">✏️</span>
          <span>DoodleVerse</span>
        </div>
        <span className="online-label">● Multiplayer drawing</span>
      </header>

      {!currentRoom ? (
        <section className="game-card">
          <div className="hero-icon">🎨</div>
          <p className="eyebrow">DRAW • GUESS • HAVE FUN</p>
          <h1>Your imagination,<br />your playground.</h1>
          <p className="subtitle">
            Create a room, invite your friends, and draw together in real time.
          </p>

          <div className="form-group">
            <label htmlFor="playerName">Your nickname</label>
            <input
              id="playerName"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your nickname"
              maxLength={20}
            />
          </div>
          <div className="room-settings">
  <h3>⚙️ Room Settings</h3>

  <label htmlFor="maxPlayers">Maximum Players</label>
  <select
    id="maxPlayers"
    value={roomSettings.maxPlayers}
    onChange={(e) =>
      setRoomSettings((prev) => ({
        ...prev,
        maxPlayers: Number(e.target.value),
      }))
    }
  >
    {[2, 4, 6, 8, 10, 12, 16, 20].map((n) => (
      <option key={n} value={n}>{n} Players</option>
    ))}
  </select>

  <label htmlFor="totalRounds">Total Rounds</label>
  <select
    id="totalRounds"
    value={roomSettings.totalRounds}
    onChange={(e) =>
      setRoomSettings((prev) => ({
        ...prev,
        totalRounds: Number(e.target.value),
      }))
    }
  >
    {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
      <option key={n} value={n}>{n} Rounds</option>
    ))}
  </select>

  <label htmlFor="drawTime">Drawing Time</label>
  <select
    id="drawTime"
    value={roomSettings.drawTime}
    onChange={(e) =>
      setRoomSettings((prev) => ({
        ...prev,
        drawTime: Number(e.target.value),
      }))
    }
  >
    {[15, 30, 60, 90, 120, 180, 240].map((n) => (
      <option key={n} value={n}>{n} Seconds</option>
    ))}
  </select>

  <label htmlFor="wordCount">Word Choices</label>
  <select
    id="wordCount"
    value={roomSettings.wordCount}
    onChange={(e) =>
      setRoomSettings((prev) => ({
        ...prev,
        wordCount: Number(e.target.value),
      }))
    }
  >
    {[1, 2, 3, 4, 5].map((n) => (
      <option key={n} value={n}>{n} Words</option>
    ))}
  </select>
</div>
          <button className="primary-button" onClick={createRoom}>
            ✨ Create a room
          </button>

          <div className="separator"><span>OR JOIN FRIENDS</span></div>

          <div className="join-row">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={5}
            />
            <button className="secondary-button" onClick={joinRoom}>
              Join room
            </button>
          </div>

          {message && <p className="status-message">{message}</p>}
        </section>
      ) : (
        <section className="game-card room-card">
          <div className="room-heading">
            <div>
              <p className="eyebrow">YOUR GAME ROOM</p>
              <h2>Let's doodle!</h2>
            </div>
            <button className="secondary-button" onClick={copyRoomCode}>
              Code: {roomCode} · Copy
            </button>
          </div>

          <p className="subtitle">
            Room share karo aur friends ke saath drawing shuru karo.
          </p>
 
{gameNotice && (
  <div className="game-notice">
    🎉 {gameNotice}
  </div>
)}

{winnerData && (
  <div className="game-notice">
    <h2>🏆 Game Over!</h2>

    <h3>{winnerData.message}</h3>

    <h4>Final Leaderboard</h4>

    {[...winnerData.scores]
      .sort((a, b) => b.score - a.score)
      .map((player) => (
        <p key={player.id}>
          {player.name}: {player.score} points
          {winnerData.winners.some(
            (winner) => winner.id === player.id
          ) && " 🏆"}
        </p>
      ))}
  </div>
)}
       
<div className="game-status">
  
{gameStarted && wordLength > 0 && (
  <div className="timer-display">
    ⏱️ Time left: {timeLeft}s
  </div>
)}

{gameStarted && wordLength > 0 && timeLeft === 0 && (
  <p className="status-message">
    ⏰ Time is up! Round finished.
  </p>
)}


  {!gameStarted ? (
    <>
      <h3>🎮 Ready to play?</h3>
      {socket.id === hostId ? (
        <button
          className="primary-button"
          onClick={startGame}
          disabled={players.length < 2}
        >
          Start Game
        </button>
      ) : (
        
        <p>Waiting for the host to start the game.</p>

      )}
      {players.length < 2 && (
        <p>At least 2 players are required to start the game.</p>
      )}
    </>
  ) : (
    <>
      <h3>🎨 Game in progress!</h3>
      {socket.id === drawerId ? (
        wordChoices.length > 0 ? (
          <div className="word-choices">
            <p>Choose a word to draw:</p>
            {wordChoices.map((word) => (
              <button
                key={word}
                className="secondary-button"
                onClick={() => chooseWord(word)}
              >
                {word}
              </button>
            ))}
          </div>
              ) : secretWord ? (
          <p>Your secret word: <strong>{secretWord}</strong></p>
        ) : (
          <p>Selecting a word...</p>
        )
      ) : (
        <p>
          {players.find((player) => player.id === drawerId)?.name || "Drawer"} is drawing.
          {wordLength > 0 && (
            <> Word has {wordLength} letters.</>
          )}
        </p>
      )}
    </>
  )}
</div>

          <div className="drawing-toolbar">
            <div className="tool-section">
              <span className="tool-label">Colors</span>
              <div className="color-palette">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    className={`color-swatch ${color === item && !eraser ? "selected" : ""}`}
                    style={{ backgroundColor: item }}
                    aria-label={`Choose ${item}`}
                    onClick={() => {
                      setColor(item);
                      setEraser(false);
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="tool-section">
              <label className="tool-label" htmlFor="brushSize">
                Brush size: {brushSize}
              </label>
              <input
                id="brushSize"
                type="range"
                min="2"
                max="30"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </div>

            <div className="tool-buttons">
              
              <button
                className="secondary-button"
                onClick={undoLastStroke}
                disabled={
                  !gameStarted ||
                  socket.id !== drawerId ||
                  !secretWord
                }
              >
                ↩️ Undo
              </button>

              <button
                className={`secondary-button ${eraser ? "tool-active" : ""}`}
                onClick={() => setEraser(!eraser)}
              >
                🧽 Eraser
              </button>
              
              <button
                className="clear-button"
                onClick={clearRoomCanvas}
                disabled={
                  !gameStarted ||
                  socket.id !== drawerId ||
                  !secretWord
                }
              >
                🗑️ Clear board
              </button>

            </div>
          </div>

          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={900}
              height={450}
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={stopDrawing}
              onPointerCancel={stopDrawing}
              onPointerLeave={stopDrawing}
              aria-label="Shared drawing canvas"
            />
          </div>
<p className="canvas-tip">
  {gameStarted
    ? canDraw
      ? "🎨 Your turn! Draw the selected word on the canvas."
      : "👀 Guess the word! Only the drawer can draw."
    : "✨ Canvas par mouse ya finger se draw karo. Drawing room ke sabhi players ko dikhegi."}
</p>

          
<div className="scoreboard">
  <h3>🏆 Scoreboard</h3>

  {players.map((player) => (
    <div className="score-row" key={player.id}>
      <span>{player.name}</span>
      <strong>{scores[player.id] || 0} pts</strong>
    </div>
  ))}
</div>

          <div className="players-section">
            <h3>Players ({players.length}/20)</h3>
            <ul className="player-list">
              {players.map((player) => (
                <li key={player.id}>
                  <span>🎨 {player.name}</span>
                  {player.id === hostId && <strong>HOST</strong>}
                </li>
              ))}
            </ul>
          </div>
          
<div className="chat-section">
  <h3>💬 Live Chat</h3>

  <div className="chat-messages">
    {chatMessages.length === 0 ? (
      <p className="chat-empty">Say hello to your friends!</p>
    ) : (
      chatMessages.map((item, index) => (
        <div className="chat-message" key={`${item.time}-${index}`}>
          <div>
            <strong>{item.playerName}</strong>
            <span>{item.text}</span>
          </div>
          <small>{item.time}</small>
        </div>
      ))
    )}
  </div>

  <form className="chat-form" onSubmit={sendChatMessage}>
    <input
      value={chatInput}
      onChange={(event) => setChatInput(event.target.value)}
      placeholder="Type a message or guess..."
      maxLength={200}
    />
    <button type="submit" className="primary-button">
      Send
    </button>
  </form>
</div>
          {message && <p className="status-message">{message}</p>}

          <p className="waiting-message">
            Draw, guess, and compete with your friends in real time!
          </p>
        </section>
      )}
    </main>
  );
}
