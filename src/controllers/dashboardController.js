const db = require("../config/database");

// Get dashboard stats based on user role
const getDashboardStats = async (req, res) => {
  try {
    const { role, id } = req.user;
    let stats = {};

    if (role === "Admin") {
      // Admin statistics
      const [[users]] = await db.query(
        'SELECT COUNT(*) as totalUsers FROM users WHERE status = "Active"'
      );

      const [[electricians]] = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = "Electrician" AND status = "Active"'
      );

      const [[managers]] = await db.query(
        'SELECT COUNT(*) as count FROM users WHERE role = "Manager" AND status = "Active"'
      );

      const [[tasks]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedTasks,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as activeTasks,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingTasks
         FROM tasks`
      );

      stats = {
        totalUsers: users.totalUsers,
        electricians: electricians.count,
        managers: managers.count,
        admins: users.totalUsers - electricians.count - managers.count,
        ...tasks,
      };
    } else if (role === "Manager") {
      // Manager statistics
      const [[todayTasks]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assigned
        FROM tasks 
        WHERE DATE(scheduled_date) = CURDATE()`
      );

      const [[teamStats]] = await db.query(
        `SELECT 
         COUNT(DISTINCT u.id) as teamSize,
         SUM(CASE WHEN u.status = 'Active' THEN 1 ELSE 0 END) as activeElectricians
        FROM users u
        WHERE u.role = 'Electrician'`
      );

      const [[avgTime]] = await db.query(
        `SELECT 
         AVG(TIMESTAMPDIFF(HOUR, actual_start_time, actual_end_time)) as avgCompletionTime
        FROM tasks 
        WHERE status = 'Completed' 
        AND actual_start_time IS NOT NULL 
        AND actual_end_time IS NOT NULL`
      );

      stats = {
        ...todayTasks,
        ...teamStats,
        avgCompletionTime: avgTime.avgCompletionTime || 0,
        assignedToday: todayTasks.totalTasks,
      };
    } else if (role === "Electrician") {
      // Electrician statistics
      const [[todayStats]] = await db.query(
        `SELECT 
         COUNT(*) as todayTasks,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedToday,
         SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgress
        FROM tasks 
        WHERE assigned_to = ? AND DATE(scheduled_date) = CURDATE()`,
        [id]
      );

      const [[monthStats]] = await db.query(
        `SELECT 
         COUNT(*) as thisMonth,
         SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedThisMonth
        FROM tasks 
        WHERE assigned_to = ? 
        AND MONTH(scheduled_date) = MONTH(CURRENT_DATE())
        AND YEAR(scheduled_date) = YEAR(CURRENT_DATE())`,
        [id]
      );

      const [[performanceStats]] = await db.query(
        `SELECT 
         ed.rating as avgRating,
         ed.total_tasks_completed as totalCompleted,
         ROUND((SELECT COUNT(*) FROM tasks 
                WHERE assigned_to = ? 
                AND status = 'Completed' 
                AND actual_end_time <= CONCAT(scheduled_date, ' ', scheduled_time_end)) * 100.0 / 
               NULLIF((SELECT COUNT(*) FROM tasks 
                       WHERE assigned_to = ? 
                       AND status = 'Completed'), 0), 2) as onTimeRate
        FROM electrician_details ed
        WHERE ed.electrician_id = ?`,
        [id, id, id]
      );

      stats = {
        ...todayStats,
        ...monthStats,
        ...performanceStats[0],
        pendingToday:
          todayStats.todayTasks -
          todayStats.completedToday -
          todayStats.inProgress,
      };
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get recent activities
const getRecentActivities = async (req, res) => {
  try {
    const { role, id } = req.user;
    let query = `
     SELECT al.*, u.full_name as user_name
     FROM activity_logs al
     JOIN users u ON al.user_id = u.id
   `;

    const params = [];

    if (role === "Electrician") {
      query += " WHERE al.user_id = ?";
      params.push(id);
    }

    query += " ORDER BY al.created_at DESC LIMIT 20";

    const [activities] = await db.query(query, params);

    res.json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Recent activities error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    const [notifications] = await db.query(
      `SELECT * FROM notifications 
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

// Generate report
const generateReport = async (req, res) => {
  try {
    const { report_type, start_date, end_date } = req.body;
    const userId = req.user.id;

    let reportData = {};

    switch (report_type) {
      case "system_usage":
        // Get all users with their status
        const [userStats] = await db.query(
          `SELECT 
            u.id,
            u.full_name,
            u.email,
            u.role,
            u.status,
            u.created_at,
            u.last_login
          FROM users u
          ORDER BY u.role, u.full_name`
        );

        // Get login activities for the last 30 days
        const [loginActivity] = await db.query(
          `SELECT 
            al.id,
            al.user_id,
            al.created_at,
            al.ip_address,
            u.full_name as user_name,
            u.role
          FROM activity_logs al
          JOIN users u ON al.user_id = u.id
          WHERE al.action = 'Login' 
          AND al.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          ORDER BY al.created_at DESC
          LIMIT 100`
        );

        // Get account activity summary for this month
        const [[newRegistrations]] = await db.query(
          `SELECT COUNT(*) as count 
          FROM users 
          WHERE MONTH(created_at) = MONTH(CURRENT_DATE())
          AND YEAR(created_at) = YEAR(CURRENT_DATE())`
        );

        const [[passwordResets]] = await db.query(
          `SELECT COUNT(*) as count 
          FROM activity_logs 
          WHERE action = 'Password Reset'
          AND MONTH(created_at) = MONTH(CURRENT_DATE())
          AND YEAR(created_at) = YEAR(CURRENT_DATE())`
        );

        const [[deletedUsers]] = await db.query(
          `SELECT COUNT(*) as count 
          FROM activity_logs 
          WHERE (action = 'Delete User' OR action LIKE '%Deleted user%')
          AND MONTH(created_at) = MONTH(CURRENT_DATE())
          AND YEAR(created_at) = YEAR(CURRENT_DATE())`
        );

        reportData = {
          userStats,
          loginActivity,
          accountActivity: {
            newRegistrations: newRegistrations.count,
            passwordResets: passwordResets.count,
            deletedUsers: deletedUsers.count,
          },
        };
        break;

      default:
        return res.status(400).json({
          message: "Invalid report type. Only system_usage is supported.",
        });
    }

    // Log report generation
    await db.query(
      "INSERT INTO reports (report_type, generated_by, parameters) VALUES (?, ?, ?)",
      [report_type, userId, JSON.stringify({ start_date, end_date })]
    );

    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    console.error("Generate report error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivities,
  getNotifications,
  markNotificationRead,
  generateReport,
};
