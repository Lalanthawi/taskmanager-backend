const bcrypt = require("bcrypt");
const db = require("../config/database");

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const { role, status } = req.query;

    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.phone, 
             u.role, u.employee_code, u.status, u.created_at, u.last_login,
             ed.rating, ed.total_tasks_completed
      FROM users u
      LEFT JOIN electrician_details ed ON u.id = ed.electrician_id
      WHERE 1=1
    `;

    const params = [];

    if (role) {
      query += " AND u.role = ?";
      params.push(role);
    }

    if (status) {
      query += " AND u.status = ?";
      params.push(status);
    }

    query += " ORDER BY u.created_at DESC";

    const [users] = await db.query(query, params);

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.phone, 
              u.role, u.employee_code, u.status, u.created_at, u.last_login,
              ed.skills, ed.certifications, ed.rating, ed.total_tasks_completed, ed.join_date
       FROM users u
       LEFT JOIN electrician_details ed ON u.id = ed.electrician_id
       WHERE u.id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      success: true,
      data: users[0],
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Create new user
const createUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      username,
      email,
      password,
      full_name,
      phone,
      role,
      employee_code,
      skills,
      certifications,
    } = req.body;

    // Check if email or username already exists
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Email or username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS || 10)
    );

    // Insert user
    const [userResult] = await connection.query(
      `INSERT INTO users (username, email, password, full_name, phone, role, employee_code) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, full_name, phone, role, employee_code]
    );

    const userId = userResult.insertId;

    // If electrician, add details
    if (role === "Electrician" && employee_code) {
      await connection.query(
        `INSERT INTO electrician_details 
         (electrician_id, employee_code, skills, certifications, join_date) 
         VALUES (?, ?, ?, ?, CURDATE())`,
        [userId, employee_code, skills, certifications]
      );
    }

    // Log activity
    await connection.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "Create User", `Created new ${role}: ${full_name}`]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "User created successfully",
      userId,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create user error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// Update user
const updateUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { full_name, phone, status, skills, certifications } = req.body;

    // Clean phone number
    const cleanPhone = phone ? phone.replace(/[\s-]/g, "") : "";

    // Update user basic info
    await connection.query(
      "UPDATE users SET full_name = ?, phone = ?, status = ? WHERE id = ?",
      [full_name, cleanPhone, status, id]
    );

    // Check if user is an electrician and update electrician details
    const [userRole] = await connection.query(
      "SELECT role FROM users WHERE id = ?",
      [id]
    );

    if (userRole[0].role === "Electrician") {
      // Check if electrician details exist
      const [existingDetails] = await connection.query(
        "SELECT electrician_id FROM electrician_details WHERE electrician_id = ?",
        [id]
      );

      if (existingDetails.length > 0) {
        // Update existing electrician details
        await connection.query(
          "UPDATE electrician_details SET skills = ?, certifications = ? WHERE electrician_id = ?",
          [skills || "", certifications || "", id]
        );
      } else {
        // Insert new electrician details if they don't exist
        await connection.query(
          "INSERT INTO electrician_details (electrician_id, skills, certifications, join_date) VALUES (?, ?, ?, CURDATE())",
          [id, skills || "", certifications || ""]
        );
      }
    }

    // Log activity
    await connection.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "Update User", `Updated user: ${full_name}`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// Delete user
const deleteUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if user exists
    const [user] = await connection.query(
      "SELECT full_name, role FROM users WHERE id = ?",
      [id]
    );

    if (user.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Don't allow deleting the last admin
    if (user[0].role === "Admin") {
      const [[adminCount]] = await connection.query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'Admin' AND status = 'Active'"
      );

      if (adminCount.count <= 1) {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "Cannot delete the last admin user" });
      }
    }

    // Don't allow deleting yourself
    if (parseInt(id) === req.user.id) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Cannot delete your own account" });
    }

    // Delete related records first
    try {
      // Delete from electrician_details if user is an electrician
      if (user[0].role === "Electrician") {
        await connection.query(
          "DELETE FROM electrician_details WHERE electrician_id = ?",
          [id]
        );
      }

      // Delete notifications
      await connection.query("DELETE FROM notifications WHERE user_id = ?", [
        id,
      ]);

      // Delete task completions and ratings for tasks assigned to this user
      await connection.query(
        "DELETE tc FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE t.assigned_to = ?",
        [id]
      );

      await connection.query(
        "DELETE tr FROM task_ratings tr JOIN tasks t ON tr.task_id = t.id WHERE t.assigned_to = ?",
        [id]
      );

      // Update tasks - set assigned_to to NULL instead of deleting
      await connection.query(
        "UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?",
        [id]
      );

      // Update tasks created by this user to system user or admin
      const [[firstAdmin]] = await connection.query(
        "SELECT id FROM users WHERE role = 'Admin' AND id != ? LIMIT 1",
        [id]
      );

      if (firstAdmin) {
        await connection.query(
          "UPDATE tasks SET created_by = ? WHERE created_by = ?",
          [firstAdmin.id, id]
        );
      }

      // Delete activity logs for this user
      await connection.query("DELETE FROM activity_logs WHERE user_id = ?", [
        id,
      ]);

      // Finally, delete the user
      await connection.query("DELETE FROM users WHERE id = ?", [id]);

      // Log activity
      await connection.query(
        "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
        [req.user.id, "Delete User", `Deleted user: ${user[0].full_name}`]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    } catch (deleteError) {
      console.error("Error during deletion:", deleteError);
      throw deleteError;
    }
  } catch (error) {
    await connection.rollback();
    console.error("Delete user error:", error);

    // Check for foreign key constraint error
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      res.status(400).json({
        message:
          "Cannot delete user. User has associated records in the system.",
      });
    } else {
      res.status(500).json({
        message: "Server error while deleting user. Please try again.",
      });
    }
  } finally {
    connection.release();
  }
};

// Toggle user status
const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await db.query("SELECT status FROM users WHERE id = ?", [
      id,
    ]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const newStatus = users[0].status === "Active" ? "Inactive" : "Active";

    await db.query("UPDATE users SET status = ? WHERE id = ?", [newStatus, id]);

    // Log activity
    await db.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [
        req.user.id,
        "User Status Update",
        `User ${newStatus === "Active" ? "activated" : "deactivated"}`,
      ]
    );

    res.json({
      success: true,
      message: `User ${
        newStatus === "Active" ? "activated" : "deactivated"
      } successfully`,
    });
  } catch (error) {
    console.error("Toggle status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get electricians
const getElectricians = async (req, res) => {
  try {
    const [electricians] = await db.query(
      `SELECT u.id, u.full_name, u.phone, u.employee_code, u.status,
              ed.skills, ed.rating, ed.total_tasks_completed,
              (SELECT COUNT(*) FROM tasks WHERE assigned_to = u.id AND status = 'In Progress') as current_tasks
       FROM users u
       JOIN electrician_details ed ON u.id = ed.electrician_id
       WHERE u.role = 'Electrician' AND u.status = 'Active'
       ORDER BY ed.rating DESC`
    );

    res.json({
      success: true,
      data: electricians,
    });
  } catch (error) {
    console.error("Get electricians error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get current user profile
const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await db.query(
      `SELECT u.id, u.username, u.email, u.full_name, u.phone, 
              u.role, u.employee_code, u.status, u.created_at, u.last_login,
              ed.skills, ed.certifications, 
              ed.rating, ed.total_tasks_completed, ed.join_date
       FROM users u
       LEFT JOIN electrician_details ed ON u.id = ed.electrician_id
       WHERE u.id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove sensitive data
    const { password, ...userData } = users[0];

    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Reset user password
const resetPassword = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { newPassword } = req.body;
    
    // Validate new password
    if (!newPassword || newPassword.length < 6) {
      await connection.rollback();
      return res.status(400).json({ 
        message: "New password must be at least 6 characters long" 
      });
    }
    
    // Check if user exists
    const [user] = await connection.query(
      "SELECT full_name, email FROM users WHERE id = ?",
      [id]
    );
    
    if (user.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "User not found" });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.SALT_ROUNDS || 10)
    );
    
    // Update the user's password
    await connection.query(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, id]
    );
    
    // Log activity
    await connection.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "Password Reset", `Reset password for user: ${user[0].full_name}`]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getElectricians,
  getMyProfile,
  resetPassword,
};
