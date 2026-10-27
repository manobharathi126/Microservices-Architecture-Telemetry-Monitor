-- Migration: Add user-specific alert acknowledgement tracking columns
-- Preserves all existing alerts and records.
ALTER TABLE alerts ADD COLUMN acknowledged_by_id VARCHAR(100) NULL;
ALTER TABLE alerts ADD COLUMN acknowledged_by_name VARCHAR(255) NULL;
ALTER TABLE alerts ADD COLUMN acknowledged_by_email VARCHAR(255) NULL;
