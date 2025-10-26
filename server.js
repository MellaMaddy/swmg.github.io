const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
require("dotenv").config();

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

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

