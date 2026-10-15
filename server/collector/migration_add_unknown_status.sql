-- migration_add_unknown_status.sql
--
-- Run this if you already set up the database BEFORE the "unknown
-- status" fix — it adds 'unknown'/'Unknown' as valid values to the
-- existing ENUM columns without losing any existing data.
--
-- Usage: mysql -u pulsetrace_app -p pulsetrace < migration_add_unknown_status.sql
--
-- Safe to run even if you're not sure whether you need it — if the
-- values already exist, this just re-declares the same ENUM (no-op).

ALTER TABLE readings
  MODIFY COLUMN status ENUM('healthy', 'degraded', 'down', 'unknown') NOT NULL;

ALTER TABLE spans
  MODIFY COLUMN status ENUM('Success', 'Error', 'Unknown') NOT NULL;
