/**
 * AUTHENTICATION CONTROLLER - Login and Password Management
 * 
 * DEVELOPMENT TIMELINE:
 * Week 2: Basic login functionality with email/password
 * Week 3: Added password hashing with bcrypt (security!)
 * Week 4: Added JWT tokens for session management
 * Week 5: Added activity logging and last_login tracking
 * Week 6: Added password change functionality
 * Week 7: Fixed security issues (same error message for invalid user/pass)
 * Current: Production ready with proper error handling
 * 
 * SECURITY FEATURES:
 * ✅ Password hashing with bcrypt
 * ✅ JWT tokens with expiration
 * ✅ Activity logging for audit trail
 * ✅ Same error message for user enum attacks
 * ✅ Only active users can login
 * 
 * TODO/IMPROVEMENTS:
 * - Add rate limiting per IP address (currently handled in frontend)
 * - Add password reset functionality via email
 * - Implement refresh tokens for better security
 * - Add 2FA support
 * - Better error messages for debugging (dev only)
 * - Add session invalidation on password change
 * 
 * BUGS FIXED:
 * - Fixed user enumeration issue (week 7)
 * - Fixed token expiration not being validated properly
 * - Fixed activity logs not capturing IP correctly
 */

// auth controller - handles login and register stuff
const bcrypt = require("bcrypt"); // for password hashing
const jwt = require("jsonwebtoken"); // for creating auth tokens
const db = require("../config/database"); // database connection

// handles user login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // TODO: add input validation middleware instead of doing it here
    // console.log('Login attempt for:', email); // debug - remove before production

    // find user by email (only active users can login)
    const [users] = await db.query(
      'SELECT * FROM users WHERE email = ? AND status = "Active"',
      [email]
    );

    // no user found with that email
    if (users.length === 0) {
      // SECURITY: use same message as invalid password to prevent user enumeration
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = users[0];

    // check if password matches (bcrypt handles the hashing comparison)
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      // same message for security - dont let attackers know if email exists
      return res.status(401).json({ message: "Invalid email or password" }); 
    }

    // update when they last logged in (for tracking)
    await db.query("UPDATE users SET last_login = NOW() WHERE id = ?", [
      user.id,
    ]);

    // Log activity
    await db.query(
      "INSERT INTO activity_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)",
      [user.id, "Login", "User logged in", req.ip]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.full_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );

    // Send response
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get current user
    const [users] = await db.query("SELECT password FROM users WHERE id = ?", [
      userId,
    ]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      users[0].password
    );
    if (!isValidPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.SALT_ROUNDS)
    );

    // Update password
    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword,
      userId,
    ]);

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  login,
  changePassword,
};
