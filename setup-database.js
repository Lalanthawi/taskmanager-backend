// setup-database.js
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  multipleStatements: true,
});

const schemaPath = path.join(__dirname, "database_schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    process.exit(1);
  }

  console.log("Connected to MySQL");
  console.log("Creating database schema...");

  connection.query(schema, (err) => {
    if (err) {
      console.error("Error creating schema:", err);
    } else {
      console.log("✅ Database schema created successfully!");
      console.log("\nDefault login credentials:");
      console.log("Admin: admin@kandyelectricians.com / admin123");
      console.log("Manager: manager@kandyelectricians.com / admin123");
      console.log("Electrician: john@kandyelectricians.com / admin123");
    }
    connection.end();
  });
});
