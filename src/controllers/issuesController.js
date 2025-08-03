const pool = require("../config/database");

// Get all issues (for managers)
const getAllIssues = async (req, res) => {
  try {
    const { status, priority, startDate, endDate } = req.query;
    const userRole = req.user.role;
    
    if (userRole !== 'Manager' && userRole !== 'Admin') {
      return res.status(403).json({ 
        message: "Access denied. Only managers and admins can view all issues." 
      });
    }

    let query = `
      SELECT 
        i.id,
        i.task_id,
        i.issue_type,
        i.description,
        i.priority,
        i.status,
        i.requested_action,
        i.created_at,
        i.resolved_at,
        t.task_code,
        t.title as task_title,
        u1.full_name as reported_by_name,
        u2.full_name as resolved_by_name
      FROM issues i
      JOIN tasks t ON i.task_id = t.id
      JOIN users u1 ON i.reported_by = u1.id
      LEFT JOIN users u2 ON i.resolved_by = u2.id
      WHERE 1=1
    `;

    const params = [];

    // Apply filters
    if (status) {
      query += " AND i.status = ?";
      params.push(status);
    }

    if (priority) {
      query += " AND i.priority = ?";
      params.push(priority);
    }

    if (startDate) {
      query += " AND DATE(i.created_at) >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND DATE(i.created_at) <= ?";
      params.push(endDate);
    }

    query += " ORDER BY i.created_at DESC";

    console.log("Executing issues query:", query);
    console.log("Query params:", params);
    
    const [issues] = await pool.query(query, params);
    
    console.log(`Found ${issues.length} issues`);
    console.log("First issue sample:", issues[0]);
    
    res.json({
      success: true,
      issues
    });
  } catch (error) {
    console.error("Error fetching issues:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch issues"
    });
  }
};

// Get specific issue details
const getIssueById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = req.user.role;
    const userId = req.user.id;

    const [issues] = await pool.query(`
      SELECT 
        i.*,
        t.task_code,
        t.title as task_title,
        t.description as task_description,
        t.priority as task_priority,
        t.status as task_status,
        u1.full_name as reported_by_name,
        u1.phone as reported_by_phone,
        u2.full_name as resolved_by_name,
        c.name as customer_name,
        c.phone as customer_phone,
        c.address as customer_address
      FROM issues i
      JOIN tasks t ON i.task_id = t.id
      JOIN users u1 ON i.reported_by = u1.id
      LEFT JOIN users u2 ON i.resolved_by = u2.id
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE i.id = ?
    `, [id]);

    if (issues.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Issue not found"
      });
    }

    const issue = issues[0];

    // Check access permissions
    if (userRole === 'Electrician' && issue.reported_by !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    res.json({
      success: true,
      issue
    });
  } catch (error) {
    console.error("Error fetching issue details:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch issue details"
    });
  }
};

// Update issue status
const updateIssueStatus = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'Manager' && userRole !== 'Admin') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "Only managers and admins can update issue status"
      });
    }

    // Check if issue exists
    const [issues] = await connection.query(
      "SELECT * FROM issues WHERE id = ?",
      [id]
    );

    if (issues.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Issue not found"
      });
    }

    const issue = issues[0];

    // Prepare update query
    let updateQuery = "UPDATE issues SET status = ?";
    let updateParams = [status];

    if (status === 'resolved') {
      updateQuery += ", resolved_at = NOW(), resolved_by = ?";
      updateParams.push(userId);
    }

    updateQuery += " WHERE id = ?";
    updateParams.push(id);

    // Update issue
    await connection.query(updateQuery, updateParams);

    // If resolving, add resolution notes as a comment or log
    if (status === 'resolved' && resolution_notes) {
      // You could add a separate issue_comments table for this
      // For now, we'll update the description to include resolution
      await connection.query(
        "UPDATE issues SET description = CONCAT(description, '\n\nRESOLUTION: ', ?) WHERE id = ?",
        [resolution_notes, id]
      );
    }

    // Create notification for the electrician who reported the issue
    if (status === 'resolved') {
      await connection.query(
        "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
        [
          issue.reported_by,
          'issue',
          'Issue Resolved',
          `Your reported issue "${issue.issue_type}" has been resolved.`
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Issue status updated successfully"
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error updating issue status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update issue status"
    });
  } finally {
    connection.release();
  }
};

// Create new issue (for electricians)
const createIssue = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      task_id,
      issue_type,
      description,
      priority,
      requested_action
    } = req.body;
    
    const reported_by = req.user.id;
    const userRole = req.user.role;

    if (userRole !== 'Electrician') {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "Only electricians can report issues"
      });
    }

    // Verify the task exists and is assigned to this electrician
    const [tasks] = await connection.query(
      "SELECT * FROM tasks WHERE id = ? AND assigned_to = ?",
      [task_id, reported_by]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Task not found or not assigned to you"
      });
    }

    const task = tasks[0];

    // Create the issue
    const [result] = await connection.query(
      `INSERT INTO issues (
        task_id, 
        reported_by, 
        issue_type, 
        description, 
        priority, 
        requested_action
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [task_id, reported_by, issue_type, description, priority || 'normal', requested_action]
    );

    // Notify the manager who created the task
    await connection.query(
      "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
      [
        task.created_by,
        'issue',
        'New Issue Reported',
        `An issue has been reported for task "${task.title}" - ${issue_type}`
      ]
    );

    // Also notify all managers
    const [managers] = await connection.query(
      "SELECT id FROM users WHERE role = 'Manager' AND status = 'Active'"
    );

    for (const manager of managers) {
      if (manager.id !== task.created_by) {
        await connection.query(
          "INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)",
          [
            manager.id,
            'issue',
            'New Issue Reported',
            `An issue has been reported for task "${task.title}" - ${issue_type}`
          ]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      success: true,
      message: "Issue reported successfully",
      issueId: result.insertId
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error creating issue:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create issue"
    });
  } finally {
    connection.release();
  }
};

// Get issue statistics for dashboard
const getIssueStats = async (req, res) => {
  try {
    const userRole = req.user.role;
    
    if (userRole !== 'Manager' && userRole !== 'Admin') {
      return res.status(403).json({ 
        message: "Access denied" 
      });
    }

    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_issues,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_issues,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_issues,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_issues,
        SUM(CASE WHEN priority = 'emergency' AND status != 'resolved' THEN 1 ELSE 0 END) as emergency_issues,
        SUM(CASE WHEN priority = 'urgent' AND status != 'resolved' THEN 1 ELSE 0 END) as urgent_issues
      FROM issues
    `);

    res.json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error("Error fetching issue stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch issue statistics"
    });
  }
};

module.exports = {
  getAllIssues,
  getIssueById,
  updateIssueStatus,
  createIssue,
  getIssueStats
};