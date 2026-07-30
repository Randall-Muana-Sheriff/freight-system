# Kigali Freight UI Frontend

React + Vite command center for fleet monitoring, geofence operations, dispatching, and admin workflows.

## Overview

This UI connects to the backend API and Socket.IO stream to provide:

- live driver telemetry mapping,
- route optimization and commit workflows,
- order pooling and assignment operations,
- geofence creation/management,
- admin user/vehicle management and audit visibility.

## Tech Stack

- React
- Vite
- Leaflet + React Leaflet
- Socket.IO client
- Tailwind CSS

## Prerequisites

- Node.js 18+
- Backend API running on your LAN or reachable host URL

## Environment

Create a `.env` file from [`.env.example`](.env.example) and set the backend URL before starting the UI:

```bash
VITE_API_BASE_URL=http://192.168.1.71:5000
```

Use your computer LAN IP on a phone or emulator, not `localhost`.

## Install

```bash
npm install
```

## Run

Development:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## Backend Connection

The API base is configured in `src/utils/api.js` and must be supplied through `VITE_API_BASE_URL`.

## Docker

```bash
docker build -t kigali-freight-ui --build-arg VITE_API_BASE_URL=http://your-backend:5000 .
docker run -p 8080:80 kigali-freight-ui
```

`VITE_API_BASE_URL` is baked into the static bundle at build time (Vite env vars aren't
readable at runtime once this is just static files), so rebuild the image whenever the
backend URL changes. Or run the full local stack from the repo root with
`docker compose up --build` (see `../docker-compose.yml`).

## API Contract Expectations

The UI expects normalized backend responses:

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human readable message"
  }
}
```

`src/utils/api.js` automatically unwraps `data` and throws on error responses.

## Main Feature Areas

- Authentication: login/signup and token persistence.
- Live Fleet Map: realtime Socket.IO driver updates.
- Dispatch Matrix: ETA and nearest-driver ranking.
- Route Optimization: optimize, save, and commit route flows.
- Geofences: create/delete polygon zones and monitor violations.
- Stops: create/delete delivery stops.
- Admin: user role management, vehicle assignment, audit logs.

## Troubleshooting

- Blank data panels: verify backend is running and token is valid.
- CORS/network errors: ensure backend `PORT` and `API_BASE` match.
- Map not updating: verify Socket.IO connection and backend telemetry events.
- Build failures: run `npm install` again and then `npm run build`.

## Continuous Integration

The frontend repo includes a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on pull requests and pushes to `main` and `develop`.

It performs:

- `npm ci`
- `npm run lint`
- `npm run build`

Keep the workflow green before merging UI changes.

## Production Notes

- Use a production API base URL before deployment.
- Serve UI behind HTTPS when backend/auth is public.
- Align backend CORS policy with deployed frontend origin.
