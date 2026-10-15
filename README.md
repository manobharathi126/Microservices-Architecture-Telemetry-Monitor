# PulseTrace

PulseTrace is a React/Vite dashboard backed by a Node.js WebSocket telemetry
collector. The collector can persist services, readings, and traces in MySQL.

## Deploy to Railway

Deploy three services in the same Railway project/environment: MySQL, the
collector, and the dashboard. The dashboard and collector are separate because
the collector needs to remain running to poll services and accept WebSocket
connections.

### 1. Create the MySQL service

Add a MySQL service from Railway's service menu. In its **Variables** tab, note
the service name (the examples below call it `MySQL`).

Initialize the schema before starting the collector so it can connect to
persistent storage immediately. Temporarily enable the MySQL service's TCP
proxy and apply the schema from a PowerShell terminal with a MySQL client
installed:

```powershell
Get-Content -Raw server\collector\schema.sql | mysql --host=YOUR_MYSQL_PUBLIC_HOST --port=YOUR_MYSQL_PUBLIC_PORT --user=YOUR_MYSQL_USER --password YOUR_MYSQL_DATABASE
```

Use the host, port, username, and database name shown by Railway. Enter the
password when prompted; do not put it in the command or commit it to the
repository. Disable the TCP proxy after the schema has been applied.

### 2. Create the collector service

Add this GitHub repository as a service, keeping the repository root as its
root directory. Set this service variable:

```text
RAILWAY_DOCKERFILE_PATH=server/collector/Dockerfile
```

Add database variables by referencing the MySQL service (replace `MySQL` if
your service has a different name):

```text
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

In the collector service's **Settings → Networking**, generate a public
domain. Use the generated domain in the next step, with the `wss://` scheme.
Railway supplies `PORT` to the collector automatically.

### 3. Create the dashboard service

Add the same GitHub repository as another service, again using the repository
root. Set this service variable:

```text
RAILWAY_DOCKERFILE_PATH=Dockerfile.dashboard
```

Set the dashboard's build variable to the collector's public WebSocket URL,
replacing `Collector` with the collector service's name:

```text
VITE_COLLECTOR_WS_URL=wss://${{Collector.RAILWAY_PUBLIC_DOMAIN}}
```

Generate a public domain for the dashboard service. The `VITE_` variable is
embedded in the dashboard at build time, so redeploy the dashboard after
changing the collector domain.

## Run locally

Install the frontend dependencies at the repository root, then start Vite:

```powershell
npm install
npm run dev
```

For the collector, install its dependencies and start it in a second terminal:

```powershell
cd server/collector
npm install
node index.js
```

The dashboard defaults to `ws://localhost:6001` when
`VITE_COLLECTOR_WS_URL` is not set. See
[`server/collector/MYSQL_SETUP.md`](./server/collector/MYSQL_SETUP.md) for
local MySQL setup.
