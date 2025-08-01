const axios = require("axios");

async function testFlow() {
  const API = "http://localhost:5001/api";

  try {
    // 1. Login
    console.log("1. Attempting login...");
    const loginRes = await axios.post(`${API}/auth/login`, {
      email: "admin@kandyelectricians.com",
      password: "admin123",
    });

    const token = loginRes.data.token;
    console.log("✅ Login successful!");
    console.log("Token:", token.substring(0, 50) + "...");

    // 2. Test authenticated request
    console.log("\n2. Testing authenticated request...");
    const config = {
      headers: { Authorization: `Bearer ${token}` },
    };

    const usersRes = await axios.get(`${API}/users`, config);
    console.log("✅ Authenticated request successful!");
    console.log("Users found:", usersRes.data.data.length);
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.log("\n🔍 This is an authentication error. Check:");
      console.log("1. Is the email/password correct?");
      console.log('2. Is the user status "Active"?');
      console.log("3. Is the JWT_SECRET in .env correct?");
    }
  }
}

testFlow();
