// auth routes - handles login and password stuff
const express = require("express");
const router = express.Router();
const { body } = require("express-validator"); // for input validation
const authController = require("../controllers/authController");
const { authenticateToken } = require("../middleware/auth"); // auth middleware
const { validate } = require("../middleware/validation"); // validation middleware

// POST /api/auth/login - user login with validation
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail(), // make sure its a valid email
    body("password").notEmpty(), // password cant be empty
    validate, // run the validation middleware
  ],
  authController.login // actual login function
);

// POST /api/auth/change-password - change user password (requires auth)
router.post(
  "/change-password",
  authenticateToken, // user must be logged in
  [
    body("currentPassword").notEmpty(), // need current password
    body("newPassword").isLength({ min: 6 }), // new password min 6 chars
    validate, // validate the inputs
  ],
  authController.changePassword // controller function
);

module.exports = router;
