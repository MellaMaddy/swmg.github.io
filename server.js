require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const sessionMiddleware = session({
  secret: "yourSecretKey",
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);
app.use(express.static("public"));

// Auth middleware
function authMiddleware(req, res, next) {
  if (req.session.userId) next();
  else res.redirect("/login.html");
}

// Share sessions with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Registration
app.post("/register", async (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password.trim();

  try {
    const existing = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (existing.rows.length > 0) return res.send("Username already taken");

    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      [username, password]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = username;
    res.redirect("/chat.html");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering user");
  }
});

// Login
app.post("/login", async (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password.trim();

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (result.rows.length === 0) return res.send("User not found");

    const user = result.rows[0];
    if (password !== user.password) return res.send("Incorrect password");

    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect("/chat.html");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging in");
  }
});

// Chat (protected)
app.get("/chat.html", authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// ------------------------
// REAL-TIME CHAT SYSTEM
// ------------------------

const users = {};  // socket.id → username

io.on("connection", (socket) => {
  const req = socket.request;
  const username = req.session?.username;

  if (!username) {
    return socket.disconnect(true);
  }

  console.log(`User connected: ${username}`);

  //-------------------------
  // USER JOINS THE CHAT
  //-------------------------
  socket.on("set username", () => {
    users[socket.id] = username;
    io.emit("user list", Object.values(users));
  });

  //-------------------------
  // PUBLIC MESSAGE
  //-------------------------
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);   // msg = { user, text }
  });

  //-------------------------
  // PRIVATE MESSAGE
  //-------------------------
  socket.on("private message", ({ to, message, from }) => {
    let targetId = Object.keys(users).find(id => users[id] === to);

    if (targetId) {
      io.to(targetId).emit("private message", { from, message });
      socket.emit("private message", { from, message }); // sender sees their own message
    }
  });

  //-------------------------
  // DISCONNECT
  //-------------------------
  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    console.log(`User disconnected: ${username}`);
  });
});

// API for current user
app.get("/api/current-user", authMiddleware, (req, res) => {
  res.json({ 
    userId: req.session.userId, 
    username: req.session.username 
  });
});

// Send encrypted message (can message yourself for testing)
app.post("/api/send-message", authMiddleware, async (req, res) => {
  const { message, encryptionKey } = req.body;
  
  try {
    const encryptedMessage = encrypt(message, encryptionKey);
    
    await pool.query(
      "INSERT INTO messages (sender_id, receiver_id, encrypted_message) VALUES ($1, $2, $3)",
      [req.session.userId, req.session.userId, encryptedMessage]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

// Get all messages for current user (sent to themselves)
app.get("/api/my-messages", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE sender_id = $1 AND receiver_id = $1 ORDER BY sent_at ASC",
      [req.session.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

// Decrypt a message
app.post("/api/decrypt-message", authMiddleware, (req, res) => {
  const { encryptedMessage, encryptionKey } = req.body;
  
  try {
    const decrypted = decrypt(encryptedMessage, encryptionKey);
    res.json({ success: true, message: decrypted });
  } catch (err) {
    res.json({ success: false, error: "Wrong encryption key" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
