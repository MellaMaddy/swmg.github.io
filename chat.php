<?php
session_start();

if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

$conn = $DATABASE_URL; // your existing DB connection
?>

<!DOCTYPE html>
<html>
<head>
    <title>Chat Room</title>
    <style>
        body { font-family: Arial, sans-serif; }
        #chat-box { 
            border: 1px solid #ccc; 
            padding: 10px; 
            width: 500px; 
            height: 400px; 
            overflow-y: scroll; 
            margin-bottom: 10px;
        }
        #chat-form { display: flex; }
        #chat-form input[type="text"] { flex: 1; padding: 5px; }
        #chat-form button { padding: 5px 10px; }
        .message { margin-bottom: 8px; }
        .message strong { color: #333; }
        .timestamp { font-size: 0.8em; color: #999; }
    </style>
</head>
<body>
<h2>Welcome, <?php echo htmlspecialchars($_SESSION['username']); ?>!</h2>

<div id="chat-box"></div>

<form id="chat-form">
    <input type="text" id="message" placeholder="Type your message..." required>
    <button type="submit">Send</button>
</form>

<script>
// Function to fetch messages
function fetchMessages() {
    fetch('fetch_messages.php')
        .then(response => response.text())
        .then(data => {
            document.getElementById('chat-box').innerHTML = data;
            // Scroll to bottom
            document.getElementById('chat-box').scrollTop = document.getElementById('chat-box').scrollHeight;
        });
}

// Initial fetch
fetchMessages();

// Poll every 2 seconds
setInterval(fetchMessages, 2000);

// Handle sending messages
document.getElementById('chat-form').addEventListener('submit', function(e) {
    e.preventDefault();
    let messageInput = document.getElementById('message');
    let message = messageInput.value.trim();
    if (message === '') return;

    fetch('send_message.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: 'message=' + encodeURIComponent(message)
    }).then(() => {
        messageInput.value = '';
        fetchMessages();
    });
});
</script>
</body>
</html>

