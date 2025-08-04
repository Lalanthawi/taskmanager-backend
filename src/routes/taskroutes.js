/**
 * TASK ROUTES - Task Management API Endpoints
 * 
 * DEVELOPMENT TIMELINE:
 * Week 5: Basic CRUD operations (create, read, update, delete)
 * Week 6: Added role-based permissions and middleware
 * Week 7: Added task assignment and status updates
 * Week 8: Added task completion workflow for electricians
 * Week 9: Added validation middleware and error handling
 * Week 10: Added rating system and audit trail
 * Current: Full task lifecycle management
 * 
 * ROUTE PERMISSIONS:
 * - GET /tasks - All authenticated users
 * - POST /tasks - Manager, Admin only
 * - PUT /tasks/:id - Manager, Admin only
 * - PATCH /tasks/:id/assign - Manager, Admin only
 * - PATCH /tasks/:id/status - All users (with business logic)
 * - POST /tasks/:id/complete - Electrician only
 * - POST /tasks/:id/rating - All users
 * - DELETE /tasks/:id - Manager, Admin only
 * 
 * TODO IMPROVEMENTS:
 * - Add bulk operations (assign multiple tasks)
 * - Add task templates for common work
 * - Implement task dependencies
 * - Add file upload for task attachments
 * - Better validation for task data
 * - Add task scheduling/calendar integration
 * 
 * BUGS FIXED:
 * - Fixed authorization middleware not working properly
 * - Fixed task status validation
 * - Fixed task assignment to non-existent users
 */

const express = require("express");
const router = express.Router();
console.log("=== Task Routes Loading ==="); // debug log
const taskController = require("../controllers/taskController");
const { authenticateToken, authorizeRoles } = require("../middleware/auth");
const { taskValidationRules, validate } = require("../middleware/validation");

// All routes require authentication (this runs before every route)
router.use(authenticateToken);

// Get all tasks (filtered by user's role and permissions)
router.get("/", taskController.getAllTasks);

// Get task by ID (with permission checks)
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
