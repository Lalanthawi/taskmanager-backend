const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const { authenticateToken } = require("../middleware/auth");

// All routes require authentication
router.use(authenticateToken);

// Get dashboard statistics
router.get("/stats", dashboardController.getDashboardStats);

// Get recent activities
router.get("/activities", dashboardController.getRecentActivities);

// Get notifications
router.get("/notifications", dashboardController.getNotifications);

// Mark notification as read
router.patch(
  "/notifications/:id/read",
  dashboardController.markNotificationRead
);

// Generate report
router.post("/reports", dashboardController.generateReport);

module.exports = router;
