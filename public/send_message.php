<?php
session_start();
if (!isset($_SESSION['user_id'])) {
    exit("Not logged in.");
}

$conn = $DATABASE_URL;

if (isset($_POST['message']) && trim($_POST['message']) !== '') {
    $message = trim($_POST['message']);
    $stmt = $conn->prepare("INSERT INTO messages (user_id, message) VALUES (?, ?)");
    $stmt->bind_param("is", $_SESSION['user_id'], $message);
    $stmt->execute();
    $stmt->close();
}
?>
