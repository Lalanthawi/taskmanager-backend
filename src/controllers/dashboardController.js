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
      // Manager specific stats - show all tasks, not just created by manager
      const [[taskStats]] = await db.query(
        `SELECT 
          COUNT(*) as totalTasks,
          SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pendingTasks,
          SUM(CASE WHEN status = 'Assigned' THEN 1 ELSE 0 END) as assignedTasks,
          SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as inProgressTasks,
          SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completedTasks
        FROM tasks`
      );

      const [[electricianCount]] = await db.query(
        `SELECT COUNT(*) as availableElectricians
        FROM users
        WHERE role = 'Electrician' AND status = 'Active'`
      );

      const [[todayTaskCount]] = await db.query(
        `SELECT COUNT(*) as todayTasks
        FROM tasks
        WHERE DATE(created_at) = CURDATE()`
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
          // Get performance data for electricians - Last 12 months
          console.log('Executing user_performance query for last 12 months...');
          const performanceQuery =
            `SELECT 
              u.id,
              u.full_name,
              u.employee_code,
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
            LEFT JOIN tasks t ON u.id = t.assigned_to 
              AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            LEFT JOIN task_ratings tr ON t.id = tr.task_id
            WHERE u.role = 'Electrician' AND u.status = 'Active'
            GROUP BY u.id, u.full_name, u.employee_code
            ORDER BY u.full_name`;
            
          console.log('Performance query:', performanceQuery);
          const [performance] = await db.query(performanceQuery, []);
          console.log('Performance result count:', performance.length);

          // Get summary statistics - Last 12 months
          console.log('Executing summary stats query for last 12 months...');
          const summaryQuery = `SELECT 
              COUNT(DISTINCT u.id) as total_electricians,
              COUNT(t.id) as total_tasks_assigned,
              SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as total_completed,
              AVG(tr.rating) as overall_avg_rating
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to 
              AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
            LEFT JOIN task_ratings tr ON t.id = tr.task_id
            WHERE u.role = 'Electrician' AND u.status = 'Active'`;
            
          const [[summaryStats]] = await db.query(summaryQuery);
          console.log('Summary stats:', summaryStats);

          // Identify best performer - Last 12 months
          console.log('Executing best performer query for last 12 months...');
          const bestPerformerQuery = `SELECT 
              u.full_name,
              COUNT(t.id) as task_count,
              AVG(tr.rating) as avg_rating,
              (COUNT(CASE WHEN t.status = 'Completed' THEN 1 END) * IFNULL(AVG(tr.rating), 1)) as performance_score
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to 
              AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
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
              report_period: 'Last 12 Months',
              period_start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              period_end: new Date().toISOString().split('T')[0],
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
              best_performer: 'N/A',
              report_period: 'Last 12 Months',
              period_start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              period_end: new Date().toISOString().split('T')[0],
            },
            report_date: new Date().toISOString(),
          };
        }
        break;

      case "system_usage":
        // System usage report for admins only
        if (userRole !== "Admin") {
          return res
            .status(403)
            .json({ message: "Unauthorized to generate this report" });
        }

        try {
          // Get user statistics
          const [[userStats]] = await db.query(`
            SELECT 
              COUNT(*) as total_users,
              SUM(CASE WHEN role = 'Admin' THEN 1 ELSE 0 END) as total_admins,
              SUM(CASE WHEN role = 'Manager' THEN 1 ELSE 0 END) as total_managers,
              SUM(CASE WHEN role = 'Electrician' THEN 1 ELSE 0 END) as total_electricians,
              SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_users,
              SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive_users
            FROM users
          `);

          // Get login activity for last 30 days
          const [[loginActivity]] = await db.query(`
            SELECT 
              COUNT(DISTINCT user_id) as unique_logins,
              COUNT(*) as total_logins
            FROM activity_logs
            WHERE action = 'Login' 
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          `);

          // Get daily login stats for last 7 days
          const [dailyLogins] = await db.query(`
            SELECT 
              DATE(created_at) as date,
              COUNT(DISTINCT user_id) as unique_users,
              COUNT(*) as login_count
            FROM activity_logs
            WHERE action = 'Login' 
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY date DESC
          `);

          // Get account activity for last 30 days
          const [[accountActivity]] = await db.query(`
            SELECT 
              SUM(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_registrations,
              SUM(CASE WHEN action = 'Password Reset' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as password_resets
            FROM (
              SELECT created_at, 'Registration' as action FROM users
              UNION ALL
              SELECT created_at, action FROM activity_logs WHERE action = 'Password Reset'
            ) as combined_activity
          `);

          // Get current deactivated users count
          const [[deactivatedCount]] = await db.query(`
            SELECT COUNT(*) as deactivated_users
            FROM users
            WHERE status = 'Inactive'
          `);

          // Get recent login activity
          const [recentLogins] = await db.query(`
            SELECT 
              u.full_name as user_name,
              u.role,
              al.created_at as login_time,
              al.ip_address
            FROM activity_logs al
            INNER JOIN users u ON al.user_id = u.id
            WHERE al.action = 'Login'
            ORDER BY al.created_at DESC
            LIMIT 10
          `);


          reportData = {
            user_statistics: {
              total: userStats.total_users || 0,
              by_role: {
                admins: userStats.total_admins || 0,
                managers: userStats.total_managers || 0,
                electricians: userStats.total_electricians || 0
              },
              by_status: {
                active: userStats.active_users || 0,
                inactive: userStats.inactive_users || 0
              }
            },
            login_activity: {
              last_30_days: {
                unique_users: loginActivity.unique_logins || 0,
                total_logins: loginActivity.total_logins || 0
              },
              daily_stats: dailyLogins || [],
              recent_logins: recentLogins || []
            },
            account_activity: {
              new_registrations: accountActivity.new_registrations || 0,
              password_resets: accountActivity.password_resets || 0,
              deactivated_users: deactivatedCount.deactivated_users || 0
            },
            report_date: new Date().toISOString()
          };
        } catch (err) {
          console.error("System usage query error:", err);
          reportData = {
            user_statistics: {
              total: 0,
              by_role: { admins: 0, managers: 0, electricians: 0 },
              by_status: { active: 0, inactive: 0 }
            },
            login_activity: {
              last_30_days: { unique_users: 0, total_logins: 0 },
              daily_stats: [],
              recent_logins: []
            },
            account_activity: {
              new_registrations: 0,
              password_resets: 0,
              deactivated_users: 0
            },
            report_date: new Date().toISOString()
          };
        }
        break;

      case "daily_stats":
        // Daily statistics report for managers
        if (userRole !== "Manager" && userRole !== "Admin") {
          return res
            .status(403)
            .json({ message: "Unauthorized to generate this report" });
        }

        try {
          // Get today's date
          const today = new Date().toISOString().split('T')[0];
          
          // Get summary stats for today
          const [[summaryStats]] = await db.query(
            `SELECT 
              COUNT(*) as total_tasks,
              SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_tasks,
              SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_tasks,
              SUM(CASE WHEN status IN ('Pending', 'Assigned') THEN 1 ELSE 0 END) as pending_tasks
            FROM tasks
            WHERE DATE(scheduled_date) = ?`,
            [today]
          );

          // Get active electricians count
          const [[activeElectricians]] = await db.query(
            `SELECT COUNT(DISTINCT assigned_to) as active_electricians
            FROM tasks
            WHERE DATE(scheduled_date) = ? AND assigned_to IS NOT NULL`,
            [today]
          );

          // Get electrician activity
          const [electricianActivity] = await db.query(
            `SELECT 
              u.full_name as electrician_name,
              COUNT(t.id) as total_tasks,
              SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as tasks_completed,
              SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) as tasks_in_progress
            FROM users u
            LEFT JOIN tasks t ON u.id = t.assigned_to AND DATE(t.scheduled_date) = ?
            WHERE u.role = 'Electrician' AND u.status = 'Active'
            GROUP BY u.id, u.full_name
            HAVING total_tasks > 0
            ORDER BY tasks_completed DESC`,
            [today]
          );

          // Get tasks by status
          const [tasksByStatus] = await db.query(
            `SELECT 
              status,
              COUNT(*) as count
            FROM tasks
            WHERE DATE(scheduled_date) = ?
            GROUP BY status`,
            [today]
          );

          reportData = {
            summary: {
              ...summaryStats,
              active_electricians: activeElectricians.active_electricians || 0
            },
            electrician_activity: electricianActivity || [],
            tasks_by_status: tasksByStatus || [],
            report_date: new Date().toISOString()
          };
        } catch (err) {
          console.error("Daily stats query error:", err);
          reportData = {
            summary: {
              total_tasks: 0,
              completed_tasks: 0,
              in_progress_tasks: 0,
              pending_tasks: 0,
              active_electricians: 0
            },
            electrician_activity: [],
            tasks_by_status: [],
            report_date: new Date().toISOString()
          };
        }
        break;

      default:
        return res.status(400).json({
          message:
            "Invalid report type. Supported types: system_usage, user_performance, daily_stats",
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
