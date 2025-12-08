require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const session = require("express-session");
const { Pool } = require("pg");
const path = require("path");


//basic server setup
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// DATABASE connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// MIDDLEWARE -----------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const sessionMiddleware = session({
    secret: "yourSecretKey",
    resave: false,
    saveUninitialized: true,
});

app.use(sessionMiddleware);

// Share sessions with socket.io
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// AUTH MIDDLEWARE
function auth(req, res, next) {
    if (req.session.userId) return next();
    res.redirect("/login.html");
}

// ROUTES ---------------------------------------------
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

// REGISTER
app.post("/register", async (req, res) => {
    const username = req.body.username.trim();
    const password = req.body.password.trim();

    try {
        const exists = await pool.query("SELECT id FROM users WHERE username=$1", [username]);

        if (exists.rows.length > 0) {
            return res.send("Username already taken");
        }

        const result = await pool.query(
            "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id",
            [username, password]
        );

        req.session.userId = result.rows[0].id;
        req.session.username = username;

        res.redirect("/chat.html");
    } catch (e) {
        console.error(e);
        res.send("Registration error");
    }
});

// LOGIN
app.post("/login", async (req, res) => {
    const username = req.body.username.trim();
    const password = req.body.password.trim();

    try {
        const result = await pool.query("SELECT * FROM users WHERE username=$1", [username]);

        if (result.rows.length === 0) return res.send("User not found");
        if (result.rows[0].password !== password) return res.send("Incorrect password");

        req.session.userId = result.rows[0].id;
        req.session.username = username;

        res.redirect("/chat.html");
    } catch (e) {
        console.error(e);
        res.send("Login error");
    }
});

// Only logged in users can get to chat.html
app.get("/chat.html", auth, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "chat.html"));
});

// API: GET CURRENT USER (used by chat.html to get the username)
app.get("/api/current-user", auth, (req, res) => {
    res.json({
        userId: req.session.userId,
        username: req.session.username,
    });
});

// API: LOAD PRIVATE MESSAGES BETWEEN TWO USERS
app.get("/api/private-history", auth, async (req, res) => {
    const other = req.query.user;
    const me = req.session.username;

    try {
        const result = await pool.query(
            `SELECT sender, receiver, encrypted_message, sent_at 
             FROM private_messages 
             WHERE (sender=$1 AND receiver=$2) 
                OR (sender=$2 AND receiver=$1) 
             ORDER BY sent_at ASC`,
            [me, other]
        );

        res.json(result.rows);
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

// SOCKET.IO -------------------------------------------
const users = {}; // socket.id → username

io.on("connection", async (socket) => {
    const username = socket.request.session.username;

    if (!username) return socket.disconnect(true);

    console.log("User connected:", username);

    // Add user to active list
    users[socket.id] = username;
    io.emit("user list", Object.values(users));

    // PUBLIC MESSAGE
    socket.on("chat message", ({ text }) => {
        io.emit("chat message", { user: username, text });
    });

    // PRIVATE MESSAGE
    socket.on("private message", async ({ to, message }) => {
        // Save encrypted message in database
        await pool.query(
            "INSERT INTO private_messages (sender, receiver, encrypted_message) VALUES ($1, $2, $3)",
            [username, to, message]
        );

        // Find receiver socket
        const target = Object.keys(users).find(id => users[id] === to);

        if (target) {
            io.to(target).emit("private message", {
                from: username,
                message
            });
        }

        // Echo back to sender so it appears in their history instantly
        socket.emit("private message", {
            from: username,
            message
        });
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("user list", Object.values(users));
        console.log("User disconnected:", username);
    });
});

// START SERVER -----------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));

