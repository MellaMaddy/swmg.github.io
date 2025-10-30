<?php
session_start();

// Only allow logged-in users
if (!isset($_SESSION['user_id'])) {
    header("Location: login.php");
    exit();
}

// Use the existing database connection
$conn = $DATABASE_URL; // assuming $DATABASE_URL is already connected

// Handle new message submission
if (isset($_POST['message']) && trim($_POST['message']) !== '') {
    $message = trim($_POST['message']);
    $stmt = $conn->prepare("INSERT INTO messages (user_id, message) VALUES (?, ?)");
    $stmt->bind_param("is", $_SESSION['user_id'], $message);
    $stmt->execute();
    $stmt->close();

    // Refresh to show the new message
    header("Location: chat.php");
    exit();
}

// Fetch all messages
$sql = "SELECT users.username, messages.message, messages.created_at
        FROM messages
        JOIN users ON messages.user_id = users.id
        ORDER BY messages.created_at ASC";
$result = $conn->query($sql);
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
    <div id="chat-box">
        <?php
        if ($result->num_rows > 0) {
            while ($row = $result->fetch_assoc()) {
                echo '<div class="message">';
                echo '<strong>' . htmlspecialchars($row['username']) . ':</strong> ';
                echo htmlspecialchars($row['message']) . ' ';
                echo '<span class="timestamp">(' . $row['created_at'] . ')</span>';
                echo '</div>';
            }
        } else {
            echo "<p>No messages yet.</p>";
        }
        ?>
    </div>

    <form id="chat-form" method="POST">
        <input type="text" name="message" placeholder="Type your message..." required>
        <button type="submit">Send</button>
    </form>
</body>
</html>
