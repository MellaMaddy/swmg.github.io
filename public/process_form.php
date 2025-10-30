<?php
session_start(); // Start session at the top

// Get form data
$username = $_POST["username"] ?? '';
$password = $_POST["password"] ?? '';

// Database connection
$servername = "localhost";
$dbusername = "root";  // adjust as needed
$dbpassword = "";      // adjust as needed
$dbname = "chat_app";  // adjust as needed

$conn = new mysqli($servername, $dbusername, $dbpassword, $dbname);
if ($conn->connect_error) {
    die("Connection failed: " . $conn->connect_error);
}

// Prepare and execute query to find user
$stmt = $conn->prepare("SELECT id, username, password FROM users WHERE username = ?");
$stmt->bind_param("s", $username);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 1) {
    $user = $result->fetch_assoc();
    // Compare plain text passwords
    if ($password === $user['password']) {
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
$conn->close();
?>
