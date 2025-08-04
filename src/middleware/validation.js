const { body, validationResult } = require("express-validator");

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Sri Lankan phone number validator
const isSriLankanPhone = (value) => {
  if (!value) return false;

  // Remove spaces and dashes
  const cleanPhone = value.replace(/[\s-]/g, "");

  // Sri Lankan phone number patterns:
  // +94XXXXXXXXX (with country code)
  // 0XXXXXXXXX (without country code)
  // Mobile numbers start with 07 or +947
  const sriLankanPhoneRegex = /^(?:\+94|0)?7[0-9]{8}$/;

  return sriLankanPhoneRegex.test(cleanPhone);
};

// Full name validator
const isValidFullName = (value) => {
  if (!value || value.trim() === "") {
    return false;
  }
  
  const trimmedName = value.trim();
  
  // Check if full name contains only numbers
  if (/^\d+$/.test(trimmedName)) {
    return false;
  }
  
  // Check if full name is primarily numbers (more than 70% numbers)
  const totalChars = trimmedName.replace(/\s/g, '').length;
  const numberChars = (trimmedName.match(/\d/g) || []).length;
  if (totalChars > 0 && (numberChars / totalChars) > 0.7) {
    return false;
  }
  
  // Check minimum length (at least 2 characters)
  if (trimmedName.length < 2) {
    return false;
  }
  
  return true;
};

// User validation rules
const userValidationRules = () => {
  return [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password")
      .optional({ nullable: true })
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("full_name")
      .notEmpty()
      .trim()
      .escape()
      .withMessage("Full name is required")
      .custom(isValidFullName)
      .withMessage("Full name cannot be only numbers and must be at least 2 characters long"),
    body("phone")
      .notEmpty()
      .withMessage("Phone number is required")
      .custom(isSriLankanPhone)
      .withMessage(
        "Please enter a valid Sri Lankan mobile number (07X XXX XXXX)"
      ),
    body("role")
      .isIn(["Admin", "Manager", "Electrician"])
      .withMessage("Invalid role"),
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
