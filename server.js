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

// Share session with Socket.io
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

// Chat page (protected)
app.get("/chat.html", authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// Socket.io for real-time chat
io.on("connection", async (socket) => {
  const req = socket.request;
  const userId = req.session?.userId;
  const username = req.session?.username;

  if (!userId) return socket.disconnect(true);
  socket.join(`user_${userId}`);

  console.log(`User ${username} connected`);

  // Send previous messages to user
  try {
    const messages = await pool.query(
      "SELECT message, created_at FROM messages WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );
    messages.rows.forEach((row) => {
      socket.emit("chat message", row.message);
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
  }

  // Handle incoming messages
  socket.on("chat message", async (msg) => {
    if (!msg || msg.trim() === "") return;

    try {
      await pool.query(
        "INSERT INTO messages (user_id, message) VALUES ($1, $2)",
        [userId, msg.trim()]
      );
      io.to(`user_${userId}`).emit("chat message", msg.trim());
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User ${username} disconnected`);
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));



const users = {}; // socket.id -> username

io.on("connection", (socket) => {
    console.log("User connected");

    // When a user joins with a username
    socket.on("set username", (username) => {
        users[socket.id] = username;
        io.emit("user list", Object.values(users));
    });

    // Public chat
    socket.on("chat message", (msg) => {
        io.emit("chat message", msg);
    });

    // Private messaging
    socket.on("private message", ({ to, message, from }) => {
        // find socket id by username
        let targetId = Object.keys(users).find(
            id => users[id] === to
        );
        if (targetId) {
            io.to(targetId).emit("private message", { from, message });
            socket.emit("private message", { from, message }); // show sender copy
        }
    });

    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("user list", Object.values(users));
    });
});

