// Generate unique codes
const generateCode = (prefix) => {
  const timestamp = Date.now().toString();
  return prefix + timestamp.slice(-6);
};

// Format date for MySQL
const formatDate = (date) => {
  return new Date(date).toISOString().slice(0, 10);
};

// Format time for MySQL
const formatTime = (time) => {
  return time + ":00";
};

// Calculate time difference in hours
const getTimeDifference = (start, end) => {
  const startTime = new Date(start);
  const endTime = new Date(end);
  const diff = Math.abs(endTime - startTime);
  return Math.floor(diff / (1000 * 60 * 60));
};

module.exports = {
  generateCode,
  formatDate,
  formatTime,
  getTimeDifference,
};
