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

// -------------------
// PostgreSQL connection
// -------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// -------------------
// Middleware
// -------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const sessionMiddleware = session({
  secret: "yourSecretKey",
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

// Auth middleware
function authMiddleware(req, res, next) {
  if (req.session.userId) next();
  else res.redirect("/login.html");
}

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// -------------------
// Routes
// -------------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// Login endpoint
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
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

// Register endpoint
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const existing = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (existing.rows.length > 0) return res.send("Username taken");

    const result = await pool.query(
      "INSERT INTO users (username, password) VALUES ($1,$2) RETURNING id",
      [username, password]
    );

    req.session.userId = result.rows[0].id;
    req.session.username = username;
    res.redirect("/chat.html");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering");
  }
});

// API: current user
app.get("/api/current-user", authMiddleware, (req, res) => {
  res.json({ userId: req.session.userId, username: req.session.username });
});

// -------------------
// Socket.IO logic
// -------------------
const users = {}; // socket.id -> username

io.on("connection", (socket) => {
  const req = socket.request;

  // User sets username
  socket.on("set username", (uname) => {
    users[socket.id] = uname;
    io.emit("user list", Object.values(users));
    console.log("User connected:", uname);
  });

  // Public message
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  // Private message
  socket.on("private message", ({ to, message, from }) => {
    const targetId = Object.keys(users).find(id => users[id] === to);
    if (targetId) {
      io.to(targetId).emit("private message", { from, message });
      socket.emit("private message", { from, message }); // show to sender
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    const uname = users[socket.id];
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    console.log("User disconnected:", uname);
  });
});

// -------------------
// Start server
// -------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

