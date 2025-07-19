// src/services/users.js
import { apiRequest } from "./api";

export const usersService = {
  getAll: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return apiRequest(`/users${queryString ? `?${queryString}` : ""}`);
  },

  getById: (id) => apiRequest(`/users/${id}`),

  create: (userData) =>
    apiRequest("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    }),

  update: (id, userData) =>
    apiRequest(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),

  toggleStatus: (id) =>
    apiRequest(`/users/${id}/toggle-status`, {
      method: "PATCH",
    }),
  delete: (id) =>
    apiRequest(`/users/${id}`, {
      method: "DELETE",
    }),

  resetPassword: (id, newPassword) =>
    apiRequest(`/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    }),

  getElectricians: () => apiRequest("/users/electricians"),
};
