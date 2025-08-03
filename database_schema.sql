-- database_schema.sql
-- Database setup for Electrician Task Management System

-- Create Database
DROP DATABASE IF EXISTS electrician_management;
CREATE DATABASE electrician_management;
USE electrician_management;

-- Users Table (for all user types)
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    role ENUM('Admin', 'Manager', 'Electrician') NOT NULL,
    status ENUM('Active', 'Inactive') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_role (role),
    INDEX idx_status (status)
);

-- Electrician Details Table
CREATE TABLE electrician_details (
    electrician_id INT PRIMARY KEY,
    employee_code VARCHAR(20) UNIQUE,
    skills TEXT,
    certifications TEXT,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_tasks_completed INT DEFAULT 0,
    join_date DATE,
    FOREIGN KEY (electrician_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Customers Table
CREATE TABLE customers (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone (phone)
);

-- Tasks Table
CREATE TABLE tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_code VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    customer_id INT,
    priority ENUM('High', 'Medium', 'Low') DEFAULT 'Medium',
    status ENUM('Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled') DEFAULT 'Pending',
    created_by INT NOT NULL,
    assigned_to INT,
    scheduled_date DATE,
    scheduled_time_start TIME,
    scheduled_time_end TIME,
    estimated_hours DECIMAL(4,2),
    actual_start_time DATETIME,
    actual_end_time DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (assigned_to) REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_scheduled_date (scheduled_date)
);

-- Task Materials Table
CREATE TABLE task_materials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    material_name VARCHAR(100) NOT NULL,
    quantity INT DEFAULT 1,
    cost DECIMAL(10,2),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task Completion Details
CREATE TABLE task_completions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT UNIQUE NOT NULL,
    completion_notes TEXT,
    materials_used TEXT,
    additional_charges DECIMAL(10,2) DEFAULT 0.00,
    customer_signature BLOB,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Task Ratings Table
CREATE TABLE task_ratings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT UNIQUE NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    feedback TEXT,
    rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Activity Logs Table
CREATE TABLE activity_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    description TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Notifications Table
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_unread (user_id, is_read)
);

-- Issues Table
CREATE TABLE IF NOT EXISTS issues (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    reported_by INT NOT NULL,
    issue_type VARCHAR(50),
    description TEXT,
    priority ENUM('normal', 'urgent', 'emergency') DEFAULT 'normal',
    status ENUM('open', 'in_progress', 'resolved') DEFAULT 'open',
    requested_action VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    resolved_by INT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (reported_by) REFERENCES users(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id),
    INDEX idx_status (status),
    INDEX idx_priority (priority),
    INDEX idx_task_id (task_id)
);

-- Reports Table
CREATE TABLE reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    report_type VARCHAR(50) NOT NULL,
    generated_by INT NOT NULL,
    parameters JSON,
    file_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (generated_by) REFERENCES users(id)
);

-- System Settings Table
CREATE TABLE system_settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default admin user (password: admin123)
INSERT INTO users (username, email, password, full_name, phone, role) VALUES
('admin', 'admin@kandyelectricians.com', '$2b$10$8K1p/kCkLPLm3XMV7Y1Tc.1fj3Kjp1Q.Gj9QMVZ7qT3q.XYs6KBMW', 'System Admin', '+94 77 111 1111', 'Admin');

-- Insert sample data for testing
INSERT INTO users (username, email, password, full_name, phone, role) VALUES
('manager1', 'manager@kandyelectricians.com', '$2b$10$8K1p/kCkLPLm3XMV7Y1Tc.1fj3Kjp1Q.Gj9QMVZ7qT3q.XYs6KBMW', 'Sarah Johnson', '+94 77 222 2222', 'Manager'),
('john_e', 'john@kandyelectricians.com', '$2b$10$8K1p/kCkLPLm3XMV7Y1Tc.1fj3Kjp1Q.Gj9QMVZ7qT3q.XYs6KBMW', 'John Smith', '+94 77 123 4567', 'Electrician'),
('mike_e', 'mike@kandyelectricians.com', '$2b$10$8K1p/kCkLPLm3XMV7Y1Tc.1fj3Kjp1Q.Gj9QMVZ7qT3q.XYs6KBMW', 'Mike Wilson', '+94 77 234 5678', 'Electrician');

-- Insert electrician details
INSERT INTO electrician_details (electrician_id, employee_code, skills, certifications, rating, join_date) VALUES
(3, 'ELC001', 'Residential Wiring, Commercial Installation, Emergency Repairs', 'Level 3 Certified, Safety Standards', 4.8, '2023-05-15'),
(4, 'ELC002', 'Industrial Wiring, Maintenance, Solar Installation', 'Level 3 Certified, Emergency Response', 4.6, '2023-08-22');

-- Insert sample customers
INSERT INTO customers (name, email, phone, address) VALUES
('ABC Company Ltd', 'contact@abc.lk', '+94 77 987 6543', '123 Galle Road, Kandy'),
('Mr. Silva', 'silva@email.com', '+94 77 456 7890', '78 Temple Street, Kandy'),
('Green Gardens Hotel', 'info@greengardens.lk', '+94 77 345 6789', '45 Lake View Road, Kandy');

-- Insert sample tasks
INSERT INTO tasks (task_code, title, description, customer_id, priority, status, created_by, assigned_to, scheduled_date, scheduled_time_start, scheduled_time_end, estimated_hours) VALUES
('T00001', 'Fix electrical outlet - Main Office', 'Multiple outlets not working in the main office area', 1, 'High', 'Assigned', 2, 3, CURDATE(), '09:00:00', '11:00:00', 2),
('T00002', 'Install new lighting system', 'Install LED lighting in the restaurant area', 3, 'Medium', 'In Progress', 2, 4, CURDATE(), '14:00:00', '18:00:00', 4),
('T00003', 'Emergency repair - Power outage', 'Complete power outage in residential building', 2, 'High', 'Pending', 2, NULL, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', '12:00:00', 2);

-- Insert some notifications
INSERT INTO notifications (user_id, type, title, message) VALUES
(3, 'task', 'New Task Assigned', 'You have been assigned a new task: Fix electrical outlet - Main Office'),
(4, 'task', 'New Task Assigned', 'You have been assigned a new task: Install new lighting system');