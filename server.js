const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {};

function createEmptyBoard() {
  return Array(9).fill("");
}

function checkWinner(board) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return {
        winner: board[a],
        combo: [a, b, c]
      };
    }
  }

  if (board.every((cell) => cell !== "")) {
    return { winner: "draw", combo: [] };
  }

  return null;
}

function getRoomState(roomId) {
  return rooms[roomId];
}

function startTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.timerTimeout) clearTimeout(room.timerTimeout);

  room.timerTimeout = setTimeout(() => {
    // Forfeit for current player
    const currentPlayer = room.players.find(p => p.symbol === room.currentTurn);
    const opponent = room.players.find(p => p.symbol !== room.currentTurn);
    if (opponent) {
      room.scores[opponent.symbol] += 1;
    }

    // Reset board
    room.board = createEmptyBoard();
    room.currentTurn = opponent ? opponent.symbol : "X";
    room.gameOver = false;
    room.winnerCombo = [];

    io.to(roomId).emit("gameReset", {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      scores: room.scores,
      gameOver: room.gameOver,
      winnerCombo: room.winnerCombo,
      message: `${currentPlayer ? currentPlayer.name : 'Player'} ran out of time. ${opponent ? opponent.name : 'Opponent'} wins!`
    });

    // Start timer for new turn
    startTimer(roomId);
  }, 10000);
}

function ensureRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      board: createEmptyBoard(),
      players: [],
      currentTurn: "X",
      gameOver: false,
      winnerCombo: [],
      scores: { X: 0, O: 0, draw: 0 },
      timerTimeout: null
    };
  }
  return rooms[roomId];
}

io.on("connection", (socket) => {
  socket.on("createOrJoinRoom", ({ roomId, playerName }) => {
    const room = ensureRoom(roomId);

    if (room.players.length >= 2) {
      socket.emit("roomFull");
      return;
    }

    const symbol = room.players.length === 0 ? "X" : "O";

    room.players.push({
      id: socket.id,
      name: playerName || `Player ${symbol}`,
      symbol
    });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.symbol = symbol;

    const playerData = room.players.find((p) => p.id === socket.id);

    socket.emit("joinedRoom", {
      roomId,
      symbol,
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      scores: room.scores,
      gameOver: room.gameOver,
      winnerCombo: room.winnerCombo
    });

    io.to(roomId).emit("roomUpdate", {
      roomId,
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      scores: room.scores,
      gameOver: room.gameOver,
      winnerCombo: room.winnerCombo,
      message:
        room.players.length === 2
          ? "Both players connected. Game starts now!"
          : `${playerData.name} joined as ${symbol}. Waiting for another player...`
    });

    // Start timer when both players are connected
    if (room.players.length === 2) {
      startTimer(roomId);
    }
  });

  socket.on("makeMove", ({ index }) => {
    const roomId = socket.data.roomId;
    const symbol = socket.data.symbol;
    if (!roomId || !symbol) return;

    const room = getRoomState(roomId);
    if (!room || room.gameOver) return;

    if (room.currentTurn !== symbol) return;
    if (room.board[index] !== "") return;
    if (room.players.length < 2) return;

    room.board[index] = symbol;

    const result = checkWinner(room.board);

    if (result) {
      room.gameOver = true;
      room.winnerCombo = result.combo || [];

      if (result.winner === "draw") {
        room.scores.draw += 1;
        // Swap symbols for draw
        if (room.players.length === 2) {
          room.players[0].symbol = room.players[0].symbol === "X" ? "O" : "X";
          room.players[1].symbol = room.players[1].symbol === "X" ? "O" : "X";
          // Update socket data
          const socket0 = io.sockets.sockets.get(room.players[0].id);
          const socket1 = io.sockets.sockets.get(room.players[1].id);
          if (socket0) socket0.data.symbol = room.players[0].symbol;
          if (socket1) socket1.data.symbol = room.players[1].symbol;
        }
        room.currentTurn = "X";
      } else {
        room.scores[result.winner] += 1;
      }

      io.to(roomId).emit("gameUpdate", {
        board: room.board,
        currentTurn: room.currentTurn,
        players: room.players,
        scores: room.scores,
        gameOver: room.gameOver,
        result,
        winnerCombo: room.winnerCombo
      });

      // Clear timer on game over
      if (room.timerTimeout) {
        clearTimeout(room.timerTimeout);
        room.timerTimeout = null;
      }

      // Auto-restart on draw or win/loss
      if (result.winner === "draw" || result.winner) {
        setTimeout(() => {
          room.board = createEmptyBoard();
          room.gameOver = false;
          room.winnerCombo = [];

          io.to(roomId).emit("gameReset", {
            board: room.board,
            currentTurn: room.currentTurn,
            players: room.players,
            scores: room.scores,
            gameOver: room.gameOver,
            winnerCombo: room.winnerCombo,
            message: result.winner === "draw" ? "Draw! Starting new round..." : "Starting new round..."
          });

          // Start timer for new round
          startTimer(roomId);
        }, 2000); // 2 second delay
      }

      return;
    }

    room.currentTurn = room.currentTurn === "X" ? "O" : "X";

    io.to(roomId).emit("gameUpdate", {
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      scores: room.scores,
      gameOver: room.gameOver,
      result: null,
      winnerCombo: []
    });

    // Start timer for next turn
    startTimer(roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];

    // Clear timer
    if (room.timerTimeout) {
      clearTimeout(room.timerTimeout);
      room.timerTimeout = null;
    }

    // Count as win for opponent
    const opponent = room.players.find(p => p.id !== socket.id);
    if (opponent) {
      room.scores[opponent.symbol] += 1;
    }

    room.players = room.players.filter((p) => p.id !== socket.id);

    io.to(roomId).emit("roomUpdate", {
      roomId,
      board: room.board,
      currentTurn: room.currentTurn,
      players: room.players,
      scores: room.scores,
      gameOver: room.gameOver,
      winnerCombo: room.winnerCombo,
      message: "A player disconnected. Waiting for player to rejoin."
    });

    if (room.players.length === 0) {
      delete rooms[roomId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});