-- 油耗记录系统 - MariaDB 建表
-- 支持: MariaDB 10.3+ (群晖套件中心默认)

CREATE DATABASE IF NOT EXISTS fuel_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fuel_tracker;

-- 车辆表
CREATE TABLE IF NOT EXISTS vehicles (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL DEFAULT '',
    plate VARCHAR(16) NOT NULL DEFAULT '',
    tank DECIMAL(6,2) NOT NULL DEFAULT 50.00,
    model VARCHAR(128) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 加油记录表
CREATE TABLE IF NOT EXISTS fuel_records (
    id VARCHAR(32) PRIMARY KEY,
    vehicle_id VARCHAR(32) NOT NULL,
    record_date DATE NOT NULL,
    odometer DECIMAL(10,2) NOT NULL,
    liters DECIMAL(8,3) NOT NULL,
    price DECIMAL(6,3) NOT NULL,
    total_cost DECIMAL(10,3) NOT NULL,
    full_tank ENUM('yes','no') NOT NULL DEFAULT 'yes',
    station VARCHAR(128) NOT NULL DEFAULT '',
    fuel_type VARCHAR(8) NOT NULL DEFAULT '92',
    note TEXT NOT NULL DEFAULT '',
    purpose VARCHAR(32) NOT NULL DEFAULT 'commute',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    INDEX idx_vehicle_date (vehicle_id, record_date),
    INDEX idx_date (record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 保养记录表
CREATE TABLE IF NOT EXISTS maint_records (
    id VARCHAR(32) PRIMARY KEY,
    vehicle_id VARCHAR(32) NOT NULL,
    record_date DATE NOT NULL,
    odometer DECIMAL(10,2) NOT NULL,
    maint_type VARCHAR(64) NOT NULL DEFAULT '',
    item VARCHAR(128) NOT NULL DEFAULT '',
    cost DECIMAL(10,3) NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    next_date DATE DEFAULT NULL,
    next_odo DECIMAL(10,2) DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    INDEX idx_vehicle_date (vehicle_id, record_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
