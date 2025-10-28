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
app.use(
  session({
    secret: "yourSecretKey", // Change to a strong random string
    resave: false,
    saveUninitialized: true,
  })
);
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

    if (existing.rows.length > 0) {
      return res.send("Username already taken");
    }

    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
      [username, password]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = username;

    res.redirect("/chat.html");
  } catch (err) {
    console.error("Error registering user:", err);
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

    if (result.rows.length === 0) {
      return res.send("User not found");
    }

    const user = result.rows[0];

    if (password !== user.password) {
      return res.send("Incorrect password");
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.redirect("/chat.html");
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).send("Error logging in");
  }
});

// Chat page (protected)
app.get("/chat.html", authMiddleware, async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// Socket.io for private chat
io.on("connection", (socket) => {
  // Retrieve userId from query string
  const userId = socket.handshake.query.userId;

  if (!userId) return;

  socket.join(`user_${userId}`);

  // Send previous messages to the user
  (async () => {
    const messages = await pool.query(
      "SELECT message FROM messages WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );

    messages.rows.forEach((row) => {
      socket.emit("chat message", row.message);
    });
  })();

  // Handle incoming messages
  socket.on("chat message", async (msg) => {
    // Save message to DB
    await pool.query(
      "INSERT INTO messages (user_id, message) VALUES ($1, $2)",
      [userId, msg]
    );

    // Emit message only to this user's room
    io.to(`user_${userId}`).emit("chat message", msg);
  });

  socket.on("disconnect", () => {
    console.log(`User ${userId} disconnected`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
