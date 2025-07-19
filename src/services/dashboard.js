// src/services/dashboard.js
import { apiRequest } from "./api";

export const dashboardService = {
  getStats: () => apiRequest("/dashboard/stats"),

  getActivities: () => apiRequest("/dashboard/activities"),

  getNotifications: () => apiRequest("/dashboard/notifications"),

  markNotificationRead: (id) =>
    apiRequest(`/dashboard/notifications/${id}/read`, {
      method: "PATCH",
    }),

  generateReport: (reportData) =>
    apiRequest("/dashboard/reports", {
      method: "POST",
      body: JSON.stringify(reportData),
    }),
};
