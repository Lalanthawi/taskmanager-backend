const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
require("dotenv").config();

async function debugAuth() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "electrician_management",
  });

  console.log("🔍 Debugging Authentication...\n");

  // 1. Check if database connection works
  try {
    await connection.query("SELECT 1");
    console.log("✅ Database connection successful\n");
  } catch (error) {
    console.log("❌ Database connection failed:", error.message);
    return;
  }

  // 2. Check users in database
  const [users] = await connection.query(
    "SELECT id, email, role, status FROM users"
  );
  console.log("📋 Users in database:");
  console.table(users);

  // 3. Reset admin password
  const newPassword = "admin123";
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await connection.query("UPDATE users SET password = ? WHERE email = ?", [
    hashedPassword,
    "admin@kandyelectricians.com",
  ]);

  console.log("\n✅ Admin password reset to: admin123");
  console.log("Hash used:", hashedPassword);

  // 4. Test the password
  const [adminUser] = await connection.query(
    "SELECT password FROM users WHERE email = ?",
    ["admin@kandyelectricians.com"]
  );

  const isValid = await bcrypt.compare("admin123", adminUser[0].password);
  console.log(
    "\n🔐 Password verification:",
    isValid ? "✅ Valid" : "❌ Invalid"
  );

  await connection.end();
}

debugAuth();
