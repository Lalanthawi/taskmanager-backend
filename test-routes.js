const express = require("express");
const app = express();

app.use(express.json());

// Simple test route
app.put("/api/tasks/:id", (req, res) => {
  res.json({ message: "PUT route works!", id: req.params.id });
});

app.listen(5002, () => {
  console.log("Test server running on port 5002");
});
