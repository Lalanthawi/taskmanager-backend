const db = require("../config/database");

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Base stats object
    let stats = {};

    if (userRole === "Admin") {
      // Admin specific stats
      const [[userCounts]] = await db.query(
        `SELECT 
          COUNT(*) as totalUsers,
          SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as activeUsers,
          SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactiveUsers
        FROM users`
      );

      const [[roleCounts]] = await db.query(
        `SELECT 
          SUM(CASE WHEN role = 'Admin' THEN 1 ELSE 0 END) as totalAdmins,
          SUM(CASE WHEN role = 'Manager' THEN 1 ELSE 0 END) as totalManagers,
          SUM(CASE WHEN role = 'Electrician' THEN 1 ELSE 0 END) as totalElectricians
        FROM users`
      );

      const [[taskCounts]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedTasks,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingTasks
        FROM tasks`
      );

      stats = {
        ...userCounts,
        ...roleCounts,
        ...taskCounts,
      };
    } else if (userRole === "Manager") {
      // Manager specific stats
      const [[taskStats]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingTasks,
          SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assignedTasks,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgressTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedTasks
        FROM tasks
        WHERE created_by = ?`,
        [userId]
      );

      const [[electricianCount]] = await db.query(
        `SELECT COUNT(*) as availableElectricians
        FROM users
        WHERE role = 'Electrician' AND status = 'Active'`
      );

      const [[todayTaskCount]] = await db.query(
        `SELECT COUNT(*) as todayTasks
        FROM tasks
        WHERE DATE(created_at) = CURDATE() AND created_by = ?`,
        [userId]
      );

      stats = {
        ...taskStats,
        ...electricianCount,
        ...todayTaskCount,
      };
    } else if (userRole === "Electrician") {
      // Electrician specific stats
      const [[taskStats]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assignedTasks,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgressTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedTasks
        FROM tasks
        WHERE assigned_to = ?`,
        [userId]
      );

      const [[todayStats]] = await db.query(
        `SELECT 
          COUNT(*) as todayTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as todayCompleted
        FROM tasks
        WHERE assigned_to = ? AND DATE(scheduled_date) = CURDATE()`,
        [userId]
      );

      stats = {
        ...taskStats,
        ...todayStats,
      };
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get recent activities
const getRecentActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let activities;

    if (userRole === "Admin") {
      // Get all system activities
      try {
        [activities] = await db.query(
          `SELECT 
            al.id,
            al.action,
            al.description,
            al.created_at,
            u.full_name as user_name,
            u.role as user_role
          FROM activity_logs al
          JOIN users u ON al.user_id = u.id
          ORDER BY al.created_at DESC
          LIMIT 20`
        );
      } catch (queryError) {
        console.error("Admin activities query error:", queryError);
        activities = [];
      }
    } else {
      // Get user specific activities
      try {
        [activities] = await db.query(
          `SELECT 
            al.id,
            al.action,
            al.description,
            al.created_at
          FROM activity_logs al
          WHERE al.user_id = ?
          ORDER BY al.created_at DESC
          LIMIT 20`,
          [userId]
        );
      } catch (queryError) {
        console.error("User activities query error:", queryError);
        activities = [];
      }
    }

    res.json({
      success: true,
      data: activities || [],
    });
  } catch (error) {
    console.error("Get recent activities error - Full error:", error);
    res.status(500).json({ 
      message: "Server error fetching activities",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [notifications] = await db.query(
      `SELECT 
        id,
        title,
        message,
        type,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Mark notification as read
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await db.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?",
      [id, userId]
    );

    res.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark notification error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Generate report - SIMPLIFIED VERSION FOR MANAGER REPORTS ONLY
const generateReport = async (req, res) => {
  console.log('generateReport called with:', { report_type: req.body.report_type, userId: req.user.id });
  
  try {
    const { report_type, start_date, end_date } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    let reportData = {};

    switch (report_type) {
      case "user_performance":
        // User performance report for managers
        if (userRole !== "Manager" && userRole !== "Admin") {
          return res
            .status(403)
            .json({ message: "Unauthorized to generate this report" });
        }

        try {
          // Get performance data for electricians - Fixed query
          console.log('Executing user_performance query...');
          const performanceQuery =
            `SELECT 
              u.id,
              u.full_name,
              ed.employee_code,
              COUNT(t.id) as total_tasks,
              SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed_tasks,
              AVG(CASE 
                WHEN t.status = 'Completed' AND t.actual_start_time IS NOT NULL AND t.actual_end_time IS NOT NULL
                THEN TIMESTAMPDIFF(HOUR, t.actual_start_time, t.actual_end_time) 
                WHEN t.status = 'Completed' 
                THEN TIMESTAMPDIFF(HOUR, t.created_at, t.updated_at) 
                ELSE NULL 
              END) as avg_completion_time,
              AVG(tr.rating) as avg_rating,
              CASE 
                WHEN COUNT(t.id) = 0 THEN 'No Tasks'
                WHEN AVG(tr.rating) >= 4.5 THEN 'Excellent'
                WHEN AVG(tr.rating) >= 4.0 THEN 'Very Good'
                WHEN AVG(tr.rating) >= 3.5 THEN 'Good'
                WHEN AVG(tr.rating) >= 3.0 THEN 'Satisfactory'
                WHEN AVG(tr.rating) IS NOT NULL THEN 'Needs Improvement'
                ELSE 'No Ratings'
              END as performance_rating
            FROM users u
            LEFT JOIN electrician_details ed ON u.id = ed.electrician_id
            LEFT JOIN tasks t ON u.id = t.assigned_to
            LEFT JOIN task_ratings tr ON t.id = tr.task_id
            WHERE u.role = 'Electrician' AND u.status = 'Active'
            GROUP BY u.id, u.full_name, ed.employee_code
            ORDER BY u.full_name`;
            
          console.log('Performance query:', performanceQuery);
          const [performance] = await db.query(performanceQuery, []);
          console.log('Performance result count:', performance.length);

          // Get summary statistics - Fixed query
          console.log('Executing summary stats query...');
          const summaryQuery = `SELECT 
              COUNT(DISTINCT u.id) as total_electricians,
              COUNT(t.id) as total_tasks_assigned,
              SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as total_completed,
              AVG(tr.rating) as overall_avg_rating
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to
            LEFT JOIN task_ratings tr ON t.id = tr.task_id
            WHERE u.role = 'Electrician' AND u.status = 'Active'`;
            
          const [[summaryStats]] = await db.query(summaryQuery);
          console.log('Summary stats:', summaryStats);

          // Identify best performer
          console.log('Executing best performer query...');
          const bestPerformerQuery = `SELECT 
              u.full_name,
              COUNT(t.id) as task_count,
              AVG(tr.rating) as avg_rating,
              (COUNT(CASE WHEN t.status = 'Completed' THEN 1 END) * IFNULL(AVG(tr.rating), 1)) as performance_score
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to
            LEFT JOIN task_ratings tr ON t.id = tr.task_id
            WHERE u.role = 'Electrician' AND u.status = 'Active'
            GROUP BY u.id, u.full_name
            HAVING task_count > 0
            ORDER BY performance_score DESC
            LIMIT 1`;
            
          const [[bestPerformer]] = await db.query(bestPerformerQuery);
          console.log('Best performer:', bestPerformer);

          reportData = {
            performance: performance || [],
            summary: {
              ...(summaryStats || {
                total_electricians: 0,
                total_tasks_assigned: 0,
                total_completed: 0,
                overall_avg_rating: null,
              }),
              best_performer: bestPerformer?.full_name || 'N/A',
            },
            report_date: new Date().toISOString(),
          };
        } catch (err) {
          console.error("User performance query error - Full details:", err);
          console.error("Error message:", err.message);
          console.error("Error code:", err.code);
          console.error("Error stack:", err.stack);
          reportData = {
            performance: [],
            summary: {
              total_electricians: 0,
              total_tasks_assigned: 0,
              total_completed: 0,
              overall_avg_rating: null,
            },
            report_date: new Date().toISOString(),
          };
        }
        break;

      default:
        return res.status(400).json({
          message:
            "Invalid report type. Supported type: user_performance",
        });
    }

    // Log report generation
    try {
      await db.query(
        "INSERT INTO reports (report_type, generated_by, parameters) VALUES (?, ?, ?)",
        [report_type, userId, JSON.stringify({ start_date, end_date })]
      );
    } catch (err) {
      console.error("Failed to log report generation:", err);
      // Continue without logging
    }

    console.log('Sending report response:', JSON.stringify({ success: true, data: reportData }, null, 2));
    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error("Generate report error - Full details:", error);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      message: "Server error generating report",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivities,
  getNotifications,
  markNotificationRead,
  generateReport,
};
