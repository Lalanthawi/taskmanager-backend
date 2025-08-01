// services/users.js
const API_URL = "http://localhost:5000/api";

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

// Users service
export const usersService = {
  // Get all users
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/users?${queryString}`);
  },

  // Get user by ID
  getById: (id) => apiRequest(`/users/${id}`),

  // Create new user
  create: (userData) =>
    apiRequest("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  // Update user
  update: (id, userData) =>
    apiRequest(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),

  // Toggle user status
  toggleStatus: (id) =>
    apiRequest(`/users/${id}/toggle-status`, {
      method: "PATCH",
    }),

  // Delete user
  delete: (id) =>
    apiRequest(`/users/${id}`, {
      method: "DELETE",
    }),

  // Get electricians
  getElectricians: () => apiRequest("/users/electricians"),

  // Reset password
  resetPassword: (userId, newPassword) =>
    apiRequest(`/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),
};
