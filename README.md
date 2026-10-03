# 🍽️ DineSetu Backend Service

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%208-47A248.svg)](https://mongoosejs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-white.svg)](https://socket.io/)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)

Production REST API and real-time WebSocket backend engine for **DineSetu — Table Intelligence & Dining Experience** (Rasrang — Modern Indian Dining).

---
Backend: https://github.com/laksh76777/dinesetu_backend.git
backend deployed: https://dinesetu-backend-1.onrender.com

frontend : https://github.com/laksh76777/DINEFLOW_frontend.git
frontend deployed: https://dineflow-frontend-rosy.vercel.app/

## ⚡ Quick Start (Local)

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```

3. **Seed Database**:
   Populates Rasrang signature dishes, floor tables, and staff credentials:
   ```bash
   npm run seed
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Server starts at `http://localhost:5000` with WebSocket support.

5. **Build for Production**:
   ```bash
   npm run build
   npm start
   ```

---

## 🚀 Deploy to Render (Step-by-Step)

1. Open [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service**.
3. Connect your repository: `laksh76777/dinesetu_backend`.
4. Configure service settings:
   - **Name**: `dinesetu-backend`
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free`
5. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `MONGODB_URI`: `mongodb+srv://<username>:<password>@cluster.mongodb.net/dinesetu?retryWrites=true&w=majority` *(or leave blank for embedded memory database)*
   - `FRONTEND_URL`: `https://your-frontend.vercel.app` *(update after frontend deployment)*
   - `JWT_SECRET`: `dinesetu_super_secret_jwt_key_2026`
   - `GEMINI_API_KEY`: *(Optional) your Gemini API key*
6. Click **Deploy Web Service**.
7. Once deployed, note your service URL: `https://dinesetu-backend.onrender.com`.
8. *(Optional)* In the Render dashboard **Shell**, seed the database:
   ```bash
   npm run seed
   ```

---

## 👥 Demo Staff Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| **Owner** | `owner@dineflow.com` | `dineflow123` | Executive Analytics, Branding, Kitchen Stations |
| **Manager** | `manager@dineflow.com` | `dineflow123` | Floor Plan, Live Order Stream, Staff Oversight |
| **Chef** | `chef@dineflow.com` | `dineflow123` | Multi-Station Kitchen Display System |
| **Waiter** | `waiter@dineflow.com` | `dineflow123` | Table Requests, Dish Delivery, Floor Assistance |

---

## 📡 API Endpoints

- `GET /api/health` - Service health status
- `POST /api/auth/login` - Staff authentication & JWT issuance
- `GET /api/restaurant` - Establishment profile, hours & tax settings
- `PATCH /api/restaurant` - Update branding & taxes (emits `RESTAURANT_UPDATED`)
- `GET /api/menu/items` - Digital menu catalog
- `POST /api/menu/help-me-choose` - Gemini AI dish recommendation
- `POST /api/sessions/join` - Join table session
- `POST /api/orders` - Submit round order to kitchen
- `GET /api/orders/kitchen/active` - Fetch active kitchen tickets
- `PATCH /api/orders/:id/status` - Advance order stage
- `GET /api/tables` - Floor tables & active session states
- `POST /api/payments/demo/create` - Initialize DineSetu Pay checkout
- `POST /api/payments/demo/confirm` - Settle table session & generate invoice
- `GET /api/payments/invoice/:sessionId` - Stream official PDF tax invoice
