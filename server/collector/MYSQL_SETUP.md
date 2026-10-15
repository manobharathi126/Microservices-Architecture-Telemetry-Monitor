# MySQL setup for the collector

The collector now persists services, readings, and traces in MySQL
instead of an in-memory array — data survives restarts.

## 1. Install MySQL (or MariaDB, fully compatible)

**Windows:** download MySQL Installer from mysql.com, or install
MariaDB from mariadb.org — either works.

**Mac:** `brew install mysql` then `brew services start mysql`

**Linux:** `sudo apt install mariadb-server` then `sudo systemctl start mariadb`

## 2. Create the database and a dedicated app user

Open a MySQL shell (`mysql -u root -p`) and run:

```sql
CREATE DATABASE pulsetrace;
CREATE USER 'pulsetrace_app'@'localhost' IDENTIFIED BY 'pulsetrace_pw';
GRANT ALL PRIVILEGES ON pulsetrace.* TO 'pulsetrace_app'@'localhost';
FLUSH PRIVILEGES;
```

(Change the password to whatever you like — just update `.env` to match.)

## 3. Apply the schema

From `server/collector/`:

```bash
mysql -u pulsetrace_app -p pulsetrace < schema.sql
```

## 4. Set up your `.env` file

Copy `.env.example` to `.env` and adjust if you changed the username/password:

```bash
cp .env.example .env
```

**`.env` is gitignored on purpose** — never commit real database
credentials to GitHub.

## 5. Run it

```bash
npm install
node index.js
```

First run will print `database empty — seeding initial services...` and
insert the 6 default services. Every run after that skips seeding and
just keeps polling + persisting, since the database already has data.

## Verifying it worked

```bash
mysql -u pulsetrace_app -p pulsetrace -e "SELECT * FROM services;"
mysql -u pulsetrace_app -p pulsetrace -e "SELECT COUNT(*) FROM readings;"
```

You should see 6 services and a growing reading count every time you
check (readings accumulate every 3 seconds while the collector runs).
