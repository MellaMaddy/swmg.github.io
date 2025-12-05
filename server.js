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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: "yourSecretKey",
  resave: false,
  saveUninitialized: true,
});
app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

app.use(express.static(path.join(__dirname, "public")));

function authMiddleware(req, res, next) {
  if (req.session.userId) next();
  else res.redirect("/");
}

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/chat.html", authMiddleware, (req, res) => res.sendFile(path.join(__dirname, "public", "chat.html")));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
  if (!result.rows.length) return res.send("User not found");
  const user = result.rows[0];
  if (password !== user.password) return res.send("Incorrect password");
  req.session.userId = user.id;
  req.session.username = user.username;
  res.redirect("/chat.html");
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const exists = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
  if (exists.rows.length) return res.send("Username taken");
  const result = await pool.query(
    "INSERT INTO users (username, password) VALUES ($1,$2) RETURNING id",
    [username, password]
  );
  req.session.userId = result.rows[0].id;
  req.session.username = username;
  res.redirect("/chat.html");
});

// -------------------
// SOCKET.IO
// -------------------
const users = {}; // socket.id -> username

io.on("connection", (socket) => {
  const session = socket.request.session;

  if (!session || !session.username) {
    return socket.disconnect(true);
  }

  const username = session.username;
  users[socket.id] = username;

  // Emit updated user list to all
  io.emit("user list", Object.values(users));
  console.log("User connected:", username);

  // Public messages
  socket.on("chat message", (msg) => {
    io.emit("chat message", msg);
  });

  // Private messages
  socket.on("private message", ({ to, message }) => {
    const targetId = Object.keys(users).find(id => users[id] === to);
    if (targetId) io.to(targetId).emit("private message", { from: username, message });
  });

  // Disconnect
  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user list", Object.values(users));
    console.log("User disconnected:", username);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
