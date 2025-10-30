<?php
session_start(); // Start session at the top

// Get form data
$username = $_POST['username'] ?? '';
$password = $_POST['password'] ?? '';

if (!$username || !$password) {
    die("Please enter both username and password.");
}

// Use the existing database connection
$conn = $DATABASE_URL; // Assuming $DATABASE_URL is already defined and connected

// Prepare and execute query
$stmt = $conn->prepare("SELECT id, username, password FROM users WHERE username = ?");
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 1) {
    $user = $result->fetch_assoc();
    if ($password === $user['password']) {  // plain-text comparison
        // Set session variables
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];

        // Redirect to chat page
        header("Location: chat.php");
        exit();
    } else {
        echo "Incorrect password.";
    }
} else {
    echo "User not found.";
}

$stmt->close();
?>
