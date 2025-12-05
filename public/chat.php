<?php
session_start();

// User must be logged in
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// ------------------------------
// CONNECT TO DATABASE
// ------------------------------
$dsn = "pgsql:host=dpg-d4oth9emcj7s7383up4g-a.oregon-postgres.render.com;port=5432;dbname=chatdb2";
$db_user = "chatdb2_user";
$db_pass = "S12vb463kNHbW9nPFux8V4J4rCHQuQWL";

try {
    $conn = new PDO($dsn, $db_user, $db_pass);
    $conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (Exception $e) {
    die("Database connection failed: " . $e->getMessage());
}

// ------------------------------
// FETCH USERNAME
// ------------------------------
$user_id = $_SESSION['user_id'];

$stmt = $conn->prepare("SELECT username FROM users WHERE id = :id LIMIT 1");
$stmt->bindParam(':id', $user_id, PDO::PARAM_INT);
$stmt->execute();

$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    die("User not found.");
}

$username = $user['username'];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Chat Room</title>
    <link rel="stylesheet" href="login.css">
</head>
<body>

    <div id="chat-layout" style="display:flex;">

        <div id="user-list-panel">
            <h3>Users</h3>
            <ul id="user-list"></ul>
        </div>

        <div class="chat-container">
            <h2>Chat Room</h2>

            <ul id="messages"></ul>

            <form id="chat-form">
                <input type="text" id="msg" placeholder="Type your message..." autocomplete="off" required>
                <button type="submit">Send</button>
            </form>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>

    <script>
        // 100% CORRECT username injection
        const username = "<?php echo htmlspecialchars($username, ENT_QUOTES, 'UTF-8'); ?>";

        const socket = io();
        const messagesList = document.getElementById("messages");

        // Send username to server
        socket.emit("set username", username);

        // Update online users
        socket.on("user list", (users) => {
            const list = document.getElementById("user-list");
            list.innerHTML = "";

            users.forEach(user => {
                if (user !== username) {
                    const li = document.createElement("li");
                    li.textContent = user;
                    li.onclick = () => openPrivateMessage(user);
                    list.appendChild(li);
                }
            });
        });

        // Private message
        function openPrivateMessage(targetUser) {
            const msg = prompt(`Send private message to ${targetUser}:`);
            if (!msg) return;

            socket.emit("private message", {
                to: targetUser,
                message: msg,
                from: username
            });
        }

        socket.on("private message", ({ from, message }) => {
            const li = document.createElement("li");
            li.className = "message private";
            li.innerHTML = `<strong>(Private) ${from}:</strong> ${message}`;
            messagesList.appendChild(li);
        });

        // Send public message
        document.getElementById("chat-form").onsubmit = (e) => {
            e.preventDefault();
            const input = document.getElementById("msg");
            const text = input.value.trim();
            if (!text) return;

            socket.emit("chat message", { user: username, text });
            input.value = "";
        };

        // Receive public message
        socket.on("chat message", (msg) => {
            const li = document.createElement("li");
            li.className = "message";
            li.innerHTML = `<strong>${msg.user}:</strong> ${msg.text}`;
            messagesList.appendChild(li);
            messagesList.scrollTop = messagesList.scrollHeight;
        });
    </script>

</body>
</html>


