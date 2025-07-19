// src/services/tasks.js
import { apiRequest } from "./api";

export const tasksService = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/tasks${queryString ? `?${queryString}` : ""}`);
  },

  getById: (id) => apiRequest(`/tasks/${id}`),

  create: (taskData) =>
    apiRequest("/tasks", {
      method: "POST",
      body: JSON.stringify(taskData),
    }),

  assign: (id, electricianId) =>
    apiRequest(`/tasks/${id}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ electrician_id: electricianId }),
    }),

  updateStatus: (id, status) =>
    apiRequest(`/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  complete: (id, completionData) =>
    apiRequest(`/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(completionData),
    }),

  addRating: (id, rating, feedback) =>
    apiRequest(`/tasks/${id}/rating`, {
      method: "POST",
      body: JSON.stringify({ rating, feedback }),
    }),
};
