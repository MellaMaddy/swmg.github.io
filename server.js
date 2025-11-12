const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();
const crypto = require('crypto');

// Encryption functions
function encrypt(text, key) {
  const algorithm = 'aes-256-cbc';
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText, key) {
  const algorithm = 'aes-256-cbc';
  const keyBuffer = crypto.scryptSync(key, 'salt', 32);
  const parts = encryptedText.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // for Render
  },
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: "yourSecretKey", // change to a strong random string
  resave: false,
  saveUninitialized: true
}));
app.use(express.static("public"));

// Auth middleware
function authMiddleware(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect("/login.html");
  }
}

// Routes
app.get("/", (req, res) => res.sendFile(__dirname + "/public/login.html"));

// Registration
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if user already exists
    const existing = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (existing.rows.length > 0) {
      return res.send("Username already taken");
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      [username, hashed]
    );

    // Auto-login
    req.session.userId = result.rows[0].id;
    req.session.username = username;

    res.redirect("/chat.html");
  } catch (err) {
    console.error(err);
    res.send("Error registering user");
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) return res.send("User not found");

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.send("Incorrect password");

    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect("/chat.html");
  } catch (err) {
    console.error(err);
    res.send("Error logging in");
  }
});

// Chat page (protected)
app.get("/chat.html", authMiddleware, (req, res) => {
  res.sendFile(__dirname + "/public/chat.html");
});

// Socket.io for chat
io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  socket.on("disconnect", () => console.log("user disconnected"));
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

