const express = require("express");
const router = express.Router();
console.log("=== Task Routes Loading ===");
const taskController = require("../controllers/taskController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { taskValidationRules, validate } = require("../middleware/validation");

// All routes require authentication
router.use(authenticateToken);

// Get all tasks
router.get("/", taskController.getAllTasks);

// Get task by ID
router.get("/:id", taskController.getTaskById);

// Create new task (Manager and Admin only)
router.post(
  "/",
  authorizeRoles("Manager", "Admin"),
  taskValidationRules(),
  validate,
  taskController.createTask
);

router.put(
  "/:id",
  authorizeRoles("Manager", "Admin"),
  taskValidationRules(),
  validate,
  taskController.updateTask
);

// Assign task to electrician (Manager only)
router.patch(
  "/:id/assign",
  authorizeRoles("Manager", "Admin"),
  taskController.assignTask
);

// Update task status
router.patch("/:id/status", taskController.updateTaskStatus);

// Complete task (Electrician only)
router.post(
  "/:id/complete",
  authorizeRoles("Electrician"),
  taskController.completeTask
);

// Add rating to task
router.post("/:id/rating", taskController.addTaskRating);

// Delete task (Manager and Admin only)
router.delete(
  "/:id",
  authorizeRoles("Manager", "Admin"),
  taskController.deleteTask
);

console.log("Total routes registered:", router.stack.length);
console.log("=========================");

module.exports = router;
