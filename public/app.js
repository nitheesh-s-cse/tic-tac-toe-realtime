const socket = io();

const joinView = document.getElementById("joinView");
const gameView = document.getElementById("gameView");

const playerNameInput = document.getElementById("playerName");
const roomIdInput = document.getElementById("roomId");
const joinBtn = document.getElementById("joinBtn");
const generateRoomBtn = document.getElementById("generateRoomBtn");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const statusText = document.getElementById("statusText");
const playersList = document.getElementById("playersList");
const scoreX = document.getElementById("scoreX");
const scoreO = document.getElementById("scoreO");
const scoreDraw = document.getElementById("scoreDraw");
const leaveBtn = document.getElementById("leaveBtn");
const boardEl = document.getElementById("board");
const messageText = document.getElementById("messageText");
const timerText = document.getElementById("timerText");
const winnerModal = document.getElementById("winnerModal");
const winnerName = document.getElementById("winnerName");
const modalRestartBtn = document.getElementById("modalRestartBtn");

let state = {
  roomId: "",
  symbol: "",
  board: Array(9).fill(""),
  currentTurn: "X",
  players: [],
  scores: { X: 0, O: 0, draw: 0 },
  gameOver: false,
  winnerCombo: [],
  timerInterval: null,
  timerValue: 10
};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function startTimer() {
  stopTimer();
  state.timerValue = 10;
  timerText.textContent = state.timerValue;
  state.timerInterval = setInterval(() => {
    state.timerValue--;
    timerText.textContent = state.timerValue;
    if (state.timerValue <= 0) {
      stopTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function renderBoard() {
  boardEl.innerHTML = "";

  state.board.forEach((cell, index) => {
    const btn = document.createElement("button");
    btn.className = `cell ${cell ? cell.toLowerCase() : ""} ${
      state.winnerCombo.includes(index) ? "win" : ""
    }`;
    btn.textContent = cell;
    btn.disabled =
      !!cell ||
      state.gameOver ||
      state.players.length < 2 ||
      state.currentTurn !== state.symbol;

    btn.addEventListener("click", () => {
      socket.emit("makeMove", { index });
    });

    boardEl.appendChild(btn);
  });
}

function renderPlayers() {
  playersList.innerHTML = "";

  if (state.players.length === 0) {
    playersList.innerHTML = `<p class="message-text">No players yet.</p>`;
    return;
  }

  state.players.forEach((player) => {
    const isYou = player.symbol === state.symbol;
    const isTurn = state.currentTurn === player.symbol && !state.gameOver && state.players.length === 2;

    const card = document.createElement("div");
    card.className = "player-card";
    card.innerHTML = `
      <div class="player-left">
        <div class="player-symbol">${player.symbol}</div>
        <div class="player-meta">
          <strong>${player.name} ${isYou ? "(You)" : ""}</strong><br />
          <small>${isTurn ? "Current turn" : "Waiting"}</small>
        </div>
      </div>
      <span>${player.symbol}</span>
    `;
    playersList.appendChild(card);
  });
}

function renderScores() {
  scoreX.textContent = state.scores.X ?? 0;
  scoreO.textContent = state.scores.O ?? 0;
  scoreDraw.textContent = state.scores.draw ?? 0;
}

function renderStatus(customMessage = "") {
  if (customMessage) {
    messageText.textContent = customMessage;
  }

  if (state.players.length < 2) {
    statusText.textContent = "Waiting for Player 2";
    if (!customMessage) messageText.textContent = "Share the room ID with your friend to join.";
    return;
  }

  if (state.gameOver) {
    const winningSymbol = state.winnerCombo.length ? state.board[state.winnerCombo[0]] : "";
    if (winningSymbol) {
      statusText.textContent = `${winningSymbol} Wins!`;
      if (!customMessage) messageText.textContent = `Player ${winningSymbol} won this round.`;
    } else {
      statusText.textContent = "It's a Draw";
      if (!customMessage) messageText.textContent = "Nobody won this round.";
    }
    return;
  }

  statusText.textContent = state.currentTurn === state.symbol ? "Your Turn" : "Opponent's Turn";
  if (!customMessage) {
    messageText.textContent =
      state.currentTurn === state.symbol
        ? `You're playing as ${state.symbol}. Make your move.`
        : `You're playing as ${state.symbol}. Wait for opponent's move.`;
  }
}

function updateUI(customMessage = "") {
  roomCodeDisplay.textContent = state.roomId || "-";
  renderBoard();
  renderPlayers();
  renderScores();
  renderStatus(customMessage);

  // Start timer if it's player's turn and game is active
  if (state.players.length === 2 && !state.gameOver && state.currentTurn === state.symbol) {
    startTimer();
  } else {
    stopTimer();
    timerText.textContent = "10";
  }
}

generateRoomBtn.addEventListener("click", () => {
  roomIdInput.value = generateRoomCode();
});

joinBtn.addEventListener("click", () => {
  const playerName = playerNameInput.value.trim() || "Player";
  const roomId = roomIdInput.value.trim().toUpperCase();

  if (!roomId) {
    alert("Please enter or generate a Room ID.");
    return;
  }

  socket.emit("createOrJoinRoom", { roomId, playerName });
});

copyRoomBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.roomId);
    copyRoomBtn.textContent = "Copied!";
    setTimeout(() => {
      copyRoomBtn.textContent = "Copy Room ID";
    }, 1200);
  } catch {
    alert("Could not copy room ID.");
  }
});

leaveBtn.addEventListener("click", () => {
  stopTimer();
  winnerModal.classList.add("hidden");
  window.location.reload();
});

modalRestartBtn.addEventListener("click", () => {
  socket.emit("restartGame");
  winnerModal.classList.add("hidden");
});

socket.on("joinedRoom", (data) => {
  state = {
    ...state,
    roomId: data.roomId,
    symbol: data.symbol,
    board: data.board,
    currentTurn: data.currentTurn,
    players: data.players,
    scores: data.scores,
    gameOver: data.gameOver,
    winnerCombo: data.winnerCombo || []
  };

  joinView.classList.add("hidden");
  gameView.classList.remove("hidden");
  updateUI(`Joined room ${data.roomId} as ${data.symbol}.`);
});

socket.on("roomUpdate", (data) => {
  state = {
    ...state,
    roomId: data.roomId || state.roomId,
    board: data.board,
    currentTurn: data.currentTurn,
    players: data.players,
    scores: data.scores,
    gameOver: data.gameOver,
    winnerCombo: data.winnerCombo || []
  };

  updateUI(data.message || "");
});

socket.on("gameUpdate", (data) => {
  state = {
    ...state,
    board: data.board,
    currentTurn: data.currentTurn,
    players: data.players,
    scores: data.scores,
    gameOver: data.gameOver,
    winnerCombo: data.winnerCombo || []
  };

  if (data.result) {
    if (data.result.winner === "draw") {
      // Swap symbol on draw
      state.symbol = state.symbol === "X" ? "O" : "X";
      updateUI("It's a draw! Symbols swapped. Starting new round...");
    } else {
      // Show winner modal
      const winnerPlayer = data.players.find(p => p.symbol === data.result.winner);
      winnerName.textContent = winnerPlayer ? winnerPlayer.name : data.result.winner;
      winnerModal.classList.remove("hidden");
      updateUI(`${data.result.winner} wins!`);
    }
  } else {
    updateUI();
  }
});

socket.on("gameReset", (data) => {
  state = {
    ...state,
    board: data.board,
    currentTurn: data.currentTurn,
    players: data.players,
    scores: data.scores,
    gameOver: data.gameOver,
    winnerCombo: data.winnerCombo || []
  };

  winnerModal.classList.add("hidden");
  updateUI("New round started.");
});

socket.on("roomFull", () => {
  alert("This room is full. Please use a different Room ID.");
});