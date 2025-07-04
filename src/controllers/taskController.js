const db = require("../config/database");

// Get all tasks
const getAllTasks = async (req, res) => {
  try {
    const { status, date, electrician_id } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;

    let query = `
      SELECT t.*, 
             c.name as customer_name, c.phone as customer_phone, c.address as customer_address,
             u.full_name as assigned_electrician,
             cr.full_name as created_by_name,
             tc.completion_notes, tc.additional_charges,
             tr.rating, tr.feedback
      FROM tasks t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN users cr ON t.created_by = cr.id
      LEFT JOIN task_completions tc ON t.id = tc.task_id
      LEFT JOIN task_ratings tr ON t.id = tr.task_id
      WHERE 1=1
    `;

    const params = [];

    // Role-based filtering
    if (userRole === "Electrician") {
      query += " AND t.assigned_to = ?";
      params.push(userId);
    }

    // Additional filters
    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    if (date) {
      query += " AND DATE(t.scheduled_date) = ?";
      params.push(date);
    }

    if (electrician_id && userRole !== "Electrician") {
      query += " AND t.assigned_to = ?";
      params.push(electrician_id);
    }

    query += " ORDER BY t.scheduled_date DESC, t.priority DESC";

    const [tasks] = await db.query(query, params);

    res.json({
      success: true,
      data: tasks,
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get task by ID
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const [tasks] = await db.query(
      `SELECT t.*, 
              c.name as customer_name, c.phone as customer_phone, 
              c.address as customer_address, c.email as customer_email,
              u.full_name as assigned_electrician, u.phone as electrician_phone
       FROM tasks t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.assigned_to = u.id
       WHERE t.id = ?`,
      [id]
    );

    if (tasks.length === 0) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Get materials
    const [materials] = await db.query(
      "SELECT * FROM task_materials WHERE task_id = ?",
      [id]
    );

    res.json({
      success: true,
      data: {
        ...tasks[0],
        materials,
      },
    });
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Create new task
const createTask = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      title,
      description,
      customer_name,
      customer_phone,
      customer_address,
      priority,
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end,
      estimated_hours,
      materials,
    } = req.body;

    // Create or find customer
    let customerId;
    const [existingCustomers] = await connection.query(
      "SELECT id FROM customers WHERE phone = ?",
      [customer_phone]
    );

    if (existingCustomers.length > 0) {
      customerId = existingCustomers[0].id;
    } else {
      const [customerResult] = await connection.query(
        "INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)",
        [customer_name, customer_phone, customer_address]
      );
      customerId = customerResult.insertId;
    }

    // Generate task code
    const taskCode = "T" + String(Date.now()).slice(-6);

    // Create task
    const [taskResult] = await connection.query(
      `INSERT INTO tasks 
       (task_code, title, description, customer_id, priority, created_by,
        scheduled_date, scheduled_time_start, scheduled_time_end, estimated_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        taskCode,
        title,
        description,
        customerId,
        priority,
        req.user.id,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end,
        estimated_hours,
      ]
    );

    const taskId = taskResult.insertId;

    // Add materials if provided
    if (materials && materials.length > 0) {
      const materialValues = materials.map((m) => [
        taskId,
        m.name,
        m.quantity || 1,
      ]);
      await connection.query(
        "INSERT INTO task_materials (task_id, material_name, quantity) VALUES ?",
        [materialValues]
      );
    }

    // Create notification for managers
    await connection.query(
      `INSERT INTO notifications (user_id, type, title, message)
       SELECT id, 'task', 'New Task Created', ?
       FROM users WHERE role = 'Manager' AND status = 'Active'`,
      [`New task "${title}" has been created and needs assignment`]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      taskId,
      taskCode,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Create task error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// Assign task to electrician
const assignTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { electrician_id } = req.body;

    // Check if electrician is available
    const [electrician] = await db.query(
      'SELECT full_name FROM users WHERE id = ? AND role = "Electrician" AND status = "Active"',
      [electrician_id]
    );

    if (electrician.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or inactive electrician" });
    }

    // Update task
    await db.query(
      'UPDATE tasks SET assigned_to = ?, status = "Assigned" WHERE id = ?',
      [electrician_id, id]
    );

    // Create notification for electrician
    await db.query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
      [
        electrician_id,
        "task",
        "New Task Assigned",
        `You have been assigned a new task #${id}`,
      ]
    );

    res.json({
      success: true,
      message: "Task assigned successfully",
    });
  } catch (error) {
    console.error("Assign task error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update task status
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    let updateQuery = "UPDATE tasks SET status = ?";
    const params = [status];

    if (status === "In Progress") {
      updateQuery += ", actual_start_time = NOW()";
    } else if (status === "Completed") {
      updateQuery += ", actual_end_time = NOW()";
    }

    updateQuery += " WHERE id = ?";
    params.push(id);

    await db.query(updateQuery, params);

    // Log activity
    await db.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [
        req.user.id,
        "Task Status Update",
        `Updated task ${id} status to ${status}`,
      ]
    );

    res.json({
      success: true,
      message: "Task status updated successfully",
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Complete task
const completeTask = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { completion_notes, materials_used, additional_charges } = req.body;

    // Update task status
    await connection.query(
      'UPDATE tasks SET status = "Completed", actual_end_time = NOW() WHERE id = ?',
      [id]
    );

    // Add completion details
    await connection.query(
      `INSERT INTO task_completions 
       (task_id, completion_notes, materials_used, additional_charges)
       VALUES (?, ?, ?, ?)`,
      [id, completion_notes, materials_used, additional_charges || 0]
    );

    // Update electrician's completed tasks count
    await connection.query(
      `UPDATE electrician_details ed
       JOIN tasks t ON t.assigned_to = ed.electrician_id
       SET ed.total_tasks_completed = ed.total_tasks_completed + 1
       WHERE t.id = ?`,
      [id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Task completed successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Complete task error:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    connection.release();
  }
};

// Add task rating
const addTaskRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    // Add rating
    await db.query(
      "INSERT INTO task_ratings (task_id, rating, feedback) VALUES (?, ?, ?)",
      [id, rating, feedback]
    );

    // Update electrician's average rating
    await db.query(
      `UPDATE electrician_details ed
       JOIN tasks t ON t.assigned_to = ed.electrician_id
       SET ed.rating = (
         SELECT AVG(tr.rating)
         FROM task_ratings tr
         JOIN tasks t2 ON tr.task_id = t2.id
         WHERE t2.assigned_to = ed.electrician_id
       )
       WHERE t.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: "Rating added successfully",
    });
  } catch (error) {
    console.error("Add rating error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  assignTask,
  updateTaskStatus,
  completeTask,
  addTaskRating,
};
