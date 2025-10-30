<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    exit("Please log in.");
}

$conn = $DATABASE_URL;

$sql = "SELECT users.username, messages.message, messages.created_at
        FROM messages
        JOIN users ON messages.user_id = users.id
        ORDER BY messages.created_at ASC";
$result = $conn->query($sql);

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
