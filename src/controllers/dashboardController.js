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
          SUM(CASE WHEN status = 'Completed' THEN 1
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
      case "user_performance":
        const [performance] = await db.query(
          `SELECT 
           u.full_name,
           ed.employee_code,
           COUNT(t.id) as total_tasks,
           SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed_tasks,
           AVG(tr.rating) as avg_rating,
           ed.rating as overall_rating
          FROM users u
          JOIN electrician_details ed ON u.id = ed.electrician_id
          LEFT JOIN tasks t ON u.id = t.assigned_to 
                           AND t.scheduled_date BETWEEN ? AND ?
          LEFT JOIN task_ratings tr ON t.id = tr.task_id
          WHERE u.role = 'Electrician'
          GROUP BY u.id`,
          [start_date, end_date]
        );
        reportData = { performance };
        break;

      case "task_analytics":
        const [analytics] = await db.query(
          `SELECT 
           COUNT(*) as total_tasks,
           SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
           SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled,
           AVG(TIMESTAMPDIFF(HOUR, actual_start_time, actual_end_time)) as avg_duration,
           SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) as high_priority,
           SUM(CASE WHEN priority = 'Medium' THEN 1 ELSE 0 END) as medium_priority,
           SUM(CASE WHEN priority = 'Low' THEN 1 ELSE 0 END) as low_priority
          FROM tasks
          WHERE scheduled_date BETWEEN ? AND ?`,
          [start_date, end_date]
        );
        reportData = { analytics: analytics[0] };
        break;

      case "customer_satisfaction":
        const [satisfaction] = await db.query(
          `SELECT 
           AVG(tr.rating) as avg_rating,
           COUNT(tr.id) as total_ratings,
           SUM(CASE WHEN tr.rating = 5 THEN 1 ELSE 0 END) as five_star,
           SUM(CASE WHEN tr.rating = 4 THEN 1 ELSE 0 END) as four_star,
           SUM(CASE WHEN tr.rating <= 3 THEN 1 ELSE 0 END) as three_or_below
          FROM task_ratings tr
          JOIN tasks t ON tr.task_id = t.id
          WHERE t.scheduled_date BETWEEN ? AND ?`,
          [start_date, end_date]
        );
        reportData = { satisfaction: satisfaction[0] };
        break;
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
