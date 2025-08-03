const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const {
  getAllIssues,
  getIssueById,
  updateIssueStatus,
  createIssue,
  getIssueStats
} = require("../controllers/issuesController");

// All routes require authentication
router.use(authenticateToken);

// Get issue statistics (for dashboard)
router.get("/stats", getIssueStats);

// Get all issues (managers only)
router.get("/", getAllIssues);

// Get specific issue details
router.get("/:id", getIssueById);

// Update issue status (managers only)
router.patch("/:id/status", updateIssueStatus);

// Create new issue (electricians only)
router.post("/", createIssue);

module.exports = router;