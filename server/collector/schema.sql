-- schema.sql — PulseTrace persistent storage
-- Run once: mysql -u pulsetrace_app -p pulsetrace < schema.sql

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500) NOT NULL,
  kind ENUM('ping', 'statuspage', 'coingecko') NOT NULL DEFAULT 'ping',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_url (url(255))
);

CREATE TABLE IF NOT EXISTS readings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  status ENUM('healthy', 'degraded', 'down', 'unknown') NOT NULL,
  latency_ms INT NULL,
  http_status INT NULL,
  error_message VARCHAR(500) NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  INDEX idx_service_time (service_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS traces (
  id VARCHAR(50) PRIMARY KEY, -- e.g. 'trace-a1b2c3d4'
  name VARCHAR(255) NOT NULL,
  status ENUM('Success', 'Error', 'Slow') NOT NULL,
  duration_ms INT NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_trace_time (recorded_at)
);

CREATE TABLE IF NOT EXISTS spans (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(50) NOT NULL,
  service_id INT NOT NULL,
  status ENUM('Success', 'Error', 'Unknown') NOT NULL,
  duration_ms INT NOT NULL,
  start_offset_ms INT NOT NULL,
  FOREIGN KEY (trace_id) REFERENCES traces(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NULL,
  service_name VARCHAR(255) NOT NULL,
  severity ENUM('Critical', 'Warning', 'Info') NOT NULL DEFAULT 'Warning',
  status ENUM('Active', 'Acknowledged', 'Resolved') NOT NULL DEFAULT 'Active',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL,
  alert_type VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  INDEX idx_alert_status (status),
  INDEX idx_alert_is_read (is_read),
  INDEX idx_alert_service (service_id)
);

CREATE TABLE IF NOT EXISTS logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NULL,
  service_name VARCHAR(255) NOT NULL,
  level ENUM('INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG') NOT NULL DEFAULT 'INFO',
  message TEXT NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'health_check',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_time (created_at),
  INDEX idx_log_level (level),
  INDEX idx_log_service (service_id)
);

