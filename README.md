Gaze Web Scaffold (React + Flask)

This repo contains a minimal React (Vite) frontend and Flask backend suitable as a starting point for a gaze visualization app.

Prerequisites
- Node.js 18+
- Python 3.10+

Backend (Flask)
```
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
The API will be available at http://localhost:5000. Health check: GET /api/health

Frontend (Vite + React)
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. The dev server proxies requests to the Flask backend at /api.

Structure
- backend/app.py: Flask app with CORS and basic endpoints
- frontend/: Vite React app with proxy to /api

Next steps
- Add endpoints to upload/stream gaze data
- Build video player and gaze overlay components
- Implement NPY parsing or use a backend converter


# gazedashboard
