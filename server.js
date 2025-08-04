/**
 * SERVER.JS - Main Backend Server
 * 
 * DEVELOPMENT TIMELINE:
 * Week 1-2: Basic Express setup with CORS
 * Week 3-4: Added authentication routes and middleware
 * Week 5-6: Added user and task management routes  
 * Week 7-8: Added dashboard data endpoints
 * Week 9-10: Added issues/reporting system
 * Current: All routes working, ready for production
 * 
 * SERVER ARCHITECTURE:
 * - Express.js framework
 * - MySQL database with connection pooling
 * - JWT-based authentication
 * - Role-based access control
 * - Input validation middleware
 * - Error handling middleware
 * 
 * ROUTES STRUCTURE:
 * /api/auth - login, change password, session management
 * /api/users - user CRUD operations (admin only)
 * /api/tasks - task management (CRUD + assignments)
 * /api/dashboard - statistics and overview data
 * /api/issues - issue reporting and tracking
 * /api/health - server health check
 * 
 * TODO IMPROVEMENTS:
 * - Add rate limiting middleware
 * - Implement request logging
 * - Add API documentation (Swagger?)
 * - Better error responses
 * - Add request validation
 * - Implement caching for dashboard data
 * 
 * PERFORMANCE NOTES:
 * - Using connection pooling (max 10 connections)
 * - Should add Redis for session storage
 * - Database queries could be optimized
 * - No CDN setup yet for static files
 */

// main server file - this is where everything starts
const express = require("express");
const cors = require("cors");
require("dotenv").config(); // loads environment variables from .env file

const app = express();

// middleware setup (runs before routes)
app.use(cors()); // allows cross-origin requests (frontend can talk to backend)
app.use(express.json()); // parses json request bodies
app.use(express.urlencoded({ extended: true })); // parses form data

// import all the route files
const authRoutes = require("./src/routes/authroutes"); // login/register stuff
const userRoutes = require("./src/routes/userroutes"); // user management
const taskRoutes = require("./src/routes/taskroutes"); // task crud operations
const dashboardRoutes = require("./src/routes/dashboardRoutes"); // dashboard data
const issuesRoutes = require("./src/routes/issuesRoutes"); // issue reporting

// debug logs (TODO: remove these before production!)
console.log("Task routes type:", typeof taskRoutes); // making sure routes load properly
console.log("Task routes:", taskRoutes); // debug info

// mount all the route handlers
app.use("/api/auth", authRoutes); // authentication endpoints
app.use("/api/users", userRoutes); // user management endpoints
console.log("Mounting task routes at /api/tasks"); // debug log
app.use("/api/tasks", taskRoutes); // task management endpoints
app.use("/api/dashboard", dashboardRoutes); // dashboard data endpoints
app.use("/api/issues", issuesRoutes); // issue reporting endpoints

// simple health check - just returns ok if server is running
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
});

// error handling middleware - catches any unhandled errors
app.use((err, req, res, next) => {
  console.error(err.stack); // log the full error for debugging
  res.status(500).json({
    message: "Something went wrong!", // generic message for user
    error: process.env.NODE_ENV === "development" ? err.message : undefined, // only show details in dev
  });
});

// 404 handler - catches requests to non-existent routes
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// get port from environment or default to 5000
const PORT = process.env.PORT || 5000;

// start the server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`); // rocket emoji because why not
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
});
