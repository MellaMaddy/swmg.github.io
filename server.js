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
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

// -------------------
// Auth middleware
// -------------------
function authMiddleware(req, res, next) {
  if (req.session.userId) next();
  else res.redirect("/login.html");
}

// -------------------
// Routes
// -------------------

// Serve login page
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));

// Login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
    if (result.rows.length === 0) return res.send("User not found");

    const user = result.rows[0];
    if (password !== user.password) return res.send("Incorrect password");

    req.session.userId = user.id;
    req.session.username = user.username;
    res.redirect("/chat");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error logging in");
  }
});

// Register
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
    res.redirect("/chat");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error registering");
  }
});

// Serve chat page with username embedded
app.get("/chat", authMiddleware, (req, res) => {
  const username = req.session.username;
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Chat Room</title>
<style>
#chat-layout { display:flex; gap:1rem; padding:1rem; }
#user-list-panel { width:180px; border-right:1px solid #ddd; }
.chat-container { flex:1; }
ul#messages { list-style:none; padding:0; max-height:400px; overflow-y:auto; }
li.message { margin:8px 0; padding:6px; border-radius:6px; background:#f5f5f5; }
li.message.private { background:#e8f7ff; }
#user-list li { cursor:pointer; padding:4px; border-bottom:1px solid #eee; }
#user-list li:hover { background:#f0f0f0; }
</style>
</head>
<body>
<div id="chat-layout">
  <div id="user-list-panel">
    <h3>Users</h3>
    <ul id="user-list"></ul>
  </div>
  <div class="chat-container">
    <h2>Chat Room</h2>
    <ul id="messages"></ul>
    <form id="chat-form">
      <input type="text" id="msg" placeholder="Type a message..." autocomplete="off" required>
      <button type="submit">Send</button>
    </form>
  </div>
</div>

<script src="/socket.io/socket.io.js"></script>
<script>
const username = "${username}";
const socket = io();
const messagesList = document.getElementById("messages");
const userListEl = document.getElementById("user-list");

// Send username immediately on connection
socket.emit("set username", username);

// Update user list
socket.on("user list", users => {
  userListEl.innerHTML = "";
  users.forEach(u => {
    if(u !== username) {
      const li = document.createElement("li");
      li.textContent = u;
      li.onclick = () => {
        const msg = prompt("Send private message to " + u);
        if(!msg) return;
        socket.emit("private message", { to: u, message: msg, from: username });
      };
      userListEl.appendChild(li);
    }
  });
});

// Receive public message
socket.on("chat message", msg => {
  const li = document.createElement("li");
  li.className = "message";
  li.innerHTML = "<strong>" + msg.user + ":</strong> " + msg.text;
  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
});

// Receive private message
socket.on("private message", ({from, message}) => {
  const li = document.createElement("li");
  li.className = "message private";
  li.innerHTML = "<strong>(Private) " + from + ":</strong> " + message;
  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
});

// Send public message
document.getElementById("chat-form").onsubmit = e => {
  e.preventDefault();
  const text = document.getElementById("msg").value.trim();
  if(!text) return;
  socket.emit("chat message", { user: username, text });
  document.getElementById("msg").value = "";
};
</script>
</body>
</html>
`);
});

// -------------------
// Socket.IO logic
// -------------------
const users = {}; // socket.id -> username

io.on("connection", socket => {
  socket.on("set username", uname => {
    users[socket.id] = uname;
    io.emit("user list", Object.values(users));
    console.log("User connected:", uname);
  });

  socket.on("chat message", msg => io.emit("chat message", msg));

  socket.on("private message", ({to, message, from}) => {
    const targetId = Object.keys(users).find(id => users[id] === to);
    if(targetId) io.to(targetId).emit("private message", { from, message });
  });

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

