const bcrypt = require("bcrypt");
const db = require("../config/database");

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const { role, status } = req.query;

    let query = `
      SELECT u.id, u.username, u.email, u.full_name, u.phone, 
             u.role, u.status, u.created_at, u.last_login,
             ed.employee_code, ed.rating, ed.total_tasks_completed
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
      `SELECT u.*, ed.* 
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
      parseInt(process.env.SALT_ROUNDS)
    );

    // Insert user
    const [userResult] = await connection.query(
      `INSERT INTO users (username, email, password, full_name, phone, role) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, full_name, phone, role]
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
  try {
    const { id } = req.params;
    const { full_name, phone, status } = req.body;

    await db.query(
      "UPDATE users SET full_name = ?, phone = ?, status = ? WHERE id = ?",
      [full_name, phone, status, id]
    );

    res.json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
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
      `SELECT u.id, u.full_name, u.phone, u.status,
              ed.employee_code, ed.skills, ed.rating, ed.total_tasks_completed,
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

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  getElectricians,
};
