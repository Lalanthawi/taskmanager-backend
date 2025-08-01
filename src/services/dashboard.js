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

// services/dashboard.js
const API_URL = "http://localhost:5001/api";

// Get token from localStorage
const getToken = () => localStorage.getItem("token");

// API request helper
const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();

  const config = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  };

  const response = await fetch(`${API_URL}${endpoint}`, config);

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new Error("API request failed");
  }

  return response.json();
};

// Dashboard service
export const dashboardService = {
  // Get dashboard statistics
  getStats: () => apiRequest("/dashboard/stats"),

  // Get recent activities
  getActivities: () => apiRequest("/dashboard/activities"),

  // Get notifications
  getNotifications: () => apiRequest("/dashboard/notifications"),

  // Mark notification as read
  markNotificationRead: (id) =>
    apiRequest(`/dashboard/notifications/${id}/read`, {
      method: "PATCH",
    }),

  // Generate report
  generateReport: (data) =>
    apiRequest("/dashboard/reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
