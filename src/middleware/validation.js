const { body, validationResult } = require("express-validator");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// User validation rules
const userValidationRules = () => {
  return [
    body("email").isEmail().normalizeEmail(),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name").notEmpty().trim().escape(),
    body("phone").optional().isMobilePhone(),
    body("role").isIn(["Admin", "Manager", "Electrician"]),
  ];
};

// Task validation rules
const taskValidationRules = () => {
  return [
    body("title").notEmpty().trim().escape(),
    body("description").optional().trim().escape(),
    body("priority").isIn(["High", "Medium", "Low"]),
    body("scheduled_date").isDate(),
    body("estimated_hours").isNumeric(),
  ];
};

module.exports = {
  validate,
  userValidationRules,
  taskValidationRules,
};
