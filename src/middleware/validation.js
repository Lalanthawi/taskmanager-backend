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
      .withMessage("Full name is required"),
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
