// src/services/auth.js
import { apiRequest, setToken, setUser, removeToken, removeUser } from "./api";

export const authService = {
  login: async (email, password) => {
    const response = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (response.token) {
      setToken(response.token);
      setUser(response.user);
    }

    return response;
  },

  logout: () => {
    removeToken();
    removeUser();
    window.location.href = "/login";
  },

  changePassword: async (currentPassword, newPassword) => {
    return apiRequest("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};
