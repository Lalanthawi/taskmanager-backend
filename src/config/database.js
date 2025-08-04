// database connection setup - using mysql2 with connection pooling
const mysql = require("mysql2");

// create connection pool (better than single connections)
const pool = mysql.createPool({
  host: process.env.DB_HOST, // database host from .env
  user: process.env.DB_USER, // database username
  password: process.env.DB_PASSWORD, // database password (dont commit this!)
  database: process.env.DB_NAME, // database name
  port: process.env.DB_PORT || 3306, // mysql default port
  waitForConnections: true, // wait if no connections available
  connectionLimit: 10, // max 10 concurrent connections (should be enough)
  queueLimit: 0, // no limit on queued requests
});

// convert to promise-based (easier to use with async/await)
const promisePool = pool.promise();

// test if database connection works on startup
async function testConnection() {
  try {
    const [rows] = await promisePool.query("SELECT 1"); // simple test query
    console.log("✅ Database connected successfully"); // success message
  } catch (error) {
    console.error("❌ Database connection failed:", error.message); // error message
    process.exit(1); // exit if cant connect to db
  }
}

testConnection(); // run the test

module.exports = promisePool; // export the pool for other files to use
