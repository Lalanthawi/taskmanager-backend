const db = require("../config/database");

// Get all tasks with date filter support
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
             tc.completion_notes, tc.materials_used, tc.additional_charges, tc.completed_at,
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
    res.status(500).json({
      success: false,
      message: "Server error fetching tasks",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
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
              u.full_name as assigned_electrician, u.phone as electrician_phone,
              tc.completion_notes, tc.materials_used, tc.additional_charges, tc.completed_at,
              tr.rating, tr.feedback
       FROM tasks t
       LEFT JOIN customers c ON t.customer_id = c.id
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN task_completions tc ON t.id = tc.task_id
       LEFT JOIN task_ratings tr ON t.id = tr.task_id
       WHERE t.id = ?`,
      [id]
    );

    if (tasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
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
    res.status(500).json({
      success: false,
      message: "Server error fetching task",
    });
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
    res.status(500).json({
      success: false,
      message: "Server error creating task",
    });
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
      return res.status(400).json({
        success: false,
        message: "Invalid or inactive electrician",
      });
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
    res.status(500).json({
      success: false,
      message: "Server error assigning task",
    });
  }
};

// Update task status
const updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "Pending",
      "Assigned",
      "In Progress",
      "Completed",
      "Cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    let updateQuery = "UPDATE tasks SET status = ?";
    const params = [status];

    if (status === "In Progress") {
      updateQuery += ", actual_start_time = NOW()";
    } else if (status === "Completed") {
      updateQuery += ", actual_end_time = NOW()";
    }

    updateQuery += " WHERE id = ?";
    params.push(id);

    const [result] = await db.query(updateQuery, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

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
    res.status(500).json({
      success: false,
      message: "Server error updating task status",
    });
  }
};

// Complete task with details
const completeTask = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { completion_notes, materials_used, additional_charges } = req.body;

    // Check if task exists and belongs to the user (if electrician)
    const [taskCheck] = await connection.query(
      "SELECT assigned_to, status FROM tasks WHERE id = ?",
      [id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // If electrician, verify they're assigned to this task
    if (
      req.user.role === "Electrician" &&
      taskCheck[0].assigned_to !== req.user.id
    ) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this task",
      });
    }

    // Update task status
    await connection.query(
      'UPDATE tasks SET status = "Completed", actual_end_time = NOW() WHERE id = ?',
      [id]
    );

    // Check if completion record already exists
    const [existingCompletion] = await connection.query(
      "SELECT id FROM task_completions WHERE task_id = ?",
      [id]
    );

    if (existingCompletion.length > 0) {
      // Update existing completion record
      await connection.query(
        `UPDATE task_completions 
         SET completion_notes = ?, materials_used = ?, additional_charges = ?, completed_at = NOW()
         WHERE task_id = ?`,
        [completion_notes, materials_used, additional_charges || 0, id]
      );
    } else {
      // Add new completion details
      await connection.query(
        `INSERT INTO task_completions 
         (task_id, completion_notes, materials_used, additional_charges)
         VALUES (?, ?, ?, ?)`,
        [id, completion_notes, materials_used, additional_charges || 0]
      );
    }

    // Update electrician's completed tasks count
    if (req.user.role === "Electrician") {
      await connection.query(
        `UPDATE electrician_details 
         SET total_tasks_completed = total_tasks_completed + 1
         WHERE electrician_id = ?`,
        [req.user.id]
      );
    }

    // Log activity
    await connection.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "Task Completed", `Completed task ${id}`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Task completed successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Complete task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error completing task",
    });
  } finally {
    connection.release();
  }
};

// Add task rating
const addTaskRating = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if rating already exists
    const [existingRating] = await db.query(
      "SELECT id FROM task_ratings WHERE task_id = ?",
      [id]
    );

    if (existingRating.length > 0) {
      // Update existing rating
      await db.query(
        "UPDATE task_ratings SET rating = ?, feedback = ?, rated_at = NOW() WHERE task_id = ?",
        [rating, feedback, id]
      );
    } else {
      // Add new rating
      await db.query(
        "INSERT INTO task_ratings (task_id, rating, feedback) VALUES (?, ?, ?)",
        [id, rating, feedback]
      );
    }

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
    res.status(500).json({
      success: false,
      message: "Server error adding rating",
    });
  }
};

const updateTask = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
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
      status,
    } = req.body;

    // Check if task exists
    const [taskCheck] = await connection.query(
      "SELECT customer_id, status, assigned_to FROM tasks WHERE id = ?",
      [id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Don't allow updating completed or cancelled tasks
    if (["Completed", "Cancelled"].includes(taskCheck[0].status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot update ${taskCheck[0].status.toLowerCase()} tasks`,
      });
    }

    // Update customer information
    if (customer_name || customer_phone || customer_address) {
      await connection.query(
        `UPDATE customers 
         SET name = COALESCE(?, name), 
             phone = COALESCE(?, phone), 
             address = COALESCE(?, address)
         WHERE id = ?`,
        [
          customer_name,
          customer_phone,
          customer_address,
          taskCheck[0].customer_id,
        ]
      );
    }

    // Handle status changes and assignment logic
    let updateQuery = `UPDATE tasks 
                       SET title = ?, 
                           description = ?, 
                           priority = ?, 
                           scheduled_date = ?, 
                           scheduled_time_start = ?, 
                           scheduled_time_end = ?, 
                           estimated_hours = ?`;
    
    let queryParams = [
      title,
      description,
      priority,
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end,
      estimated_hours,
    ];

    // Handle status changes
    if (status && status !== taskCheck[0].status) {
      updateQuery += `, status = ?`;
      queryParams.push(status);

      // If changing to Pending, unassign the electrician
      if (status === "Pending" && taskCheck[0].assigned_to) {
        updateQuery += `, assigned_to = NULL`;
        
        // Create notification for the previously assigned electrician
        await connection.query(
          "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
          [
            taskCheck[0].assigned_to,
            "task",
            "Task Reassignment",
            `Task #${id} has been unassigned and is now pending reassignment`,
          ]
        );
      }

      // Set start/end times based on status
      if (status === "In Progress") {
        updateQuery += `, actual_start_time = NOW()`;
      } else if (status === "Completed") {
        updateQuery += `, actual_end_time = NOW()`;
      }
    }

    updateQuery += ` WHERE id = ?`;
    queryParams.push(id);

    // Update task
    await connection.query(updateQuery, queryParams);

    // Update materials if provided
    if (materials && Array.isArray(materials)) {
      // Delete existing materials
      await connection.query("DELETE FROM task_materials WHERE task_id = ?", [
        id,
      ]);

      // Add new materials
      if (materials.length > 0) {
        const materialValues = materials.map((m) => [
          id,
          m.name || m.material_name,
          m.quantity || 1,
        ]);
        await connection.query(
          "INSERT INTO task_materials (task_id, material_name, quantity) VALUES ?",
          [materialValues]
        );
      }
    }

    // Log activity
    await connection.query(
      "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
      [req.user.id, "Task Update", `Updated task #${id}`]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "Task updated successfully",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Update task error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating task",
    });
  } finally {
    connection.release();
  }
};

// Delete task
const deleteTask = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;

    // Only managers and admins can delete tasks
    if (userRole !== "Manager" && userRole !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to delete tasks",
      });
    }

    // Check if task exists
    const [task] = await db.query("SELECT * FROM tasks WHERE id = ?", [id]);
    
    if (task.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    // Don't allow deletion of completed tasks
    if (task[0].status === "Completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete completed tasks",
      });
    }

    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Delete related records first (to maintain referential integrity)
      await connection.query("DELETE FROM task_ratings WHERE task_id = ?", [id]);
      await connection.query("DELETE FROM task_completions WHERE task_id = ?", [id]);
      await connection.query("DELETE FROM task_materials WHERE task_id = ?", [id]);
      await connection.query("DELETE FROM issues WHERE task_id = ?", [id]);
      
      // Delete the task
      const [result] = await connection.query("DELETE FROM tasks WHERE id = ?", [id]);

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Log activity
      await connection.query(
        "INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)",
        [
          req.user.id,
          "Task Deletion",
          `Deleted task ${task[0].task_code} - ${task[0].title}`,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Task deleted successfully",
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Delete task error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      sqlState: error.sqlState,
      errno: error.errno
    });
    
    res.status(500).json({
      success: false,
      message: "Server error deleting task",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Export all controller methods
module.exports = {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  assignTask,
  updateTaskStatus,
  completeTask,
  addTaskRating,
  deleteTask,
};

console.log("=== Task Controller Export Check ===");
console.log("updateTask function exists:", typeof updateTask === "function");
console.log("All exported methods:", Object.keys(module.exports));
console.log("===================================");
