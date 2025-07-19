const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authenticateToken, authorizeRoles } = require("../src/middleware/auth");
const {
  userValidationRules,
  validate,
} = require("../src/middleware/validation");

// All routes require authentication
router.use(authenticateToken);

// Get all users (Admin and Manager only)
router.get("/", authorizeRoles("Admin", "Manager"), userController.getAllUsers);

// Get electricians (Manager only)
router.get(
  "/electricians",
  authorizeRoles("Manager", "Admin"),
  userController.getElectricians
);

// Get user by ID
router.get("/:id", userController.getUserById);

// Create new user (Admin only)
router.post(
  "/",
  authorizeRoles("Admin"),
  userValidationRules(),
  validate,
  userController.createUser
);

// Update user (Admin only)
router.put("/:id", authorizeRoles("Admin"), userController.updateUser);

// Toggle user status (Admin only)
router.patch(
  "/:id/toggle-status",
  authorizeRoles("Admin"),
  userController.toggleUserStatus
);

// Delete user (Admin only) - ADD THIS ROUTE
router.delete("/:id", authorizeRoles("Admin"), userController.deleteUser);

module.exports = router;
