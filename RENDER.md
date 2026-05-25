# Deploy backend to Render

## 1. MongoDB Atlas

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Add a database user and allow network access (`0.0.0.0/0` for Render).
3. Copy the connection string and set it as `MONGO_URI` (replace `<password>`).

## 2. Create Web Service on Render

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. Connect this GitHub repo.
3. Settings (use **repo root**, leave Root Directory **empty**):
   - **Root Directory:** *(blank)* — not `backend` or `src`
   - **Runtime:** Node
   - **Build Command:** `npm install --include=dev && npm run build`  
     (`--include=dev` is required because TypeScript is a devDependency and Render sets `NODE_ENV=production` during build.)
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`

The repo root `package.json` runs build/start inside `backend/` automatically.

**If you see** `ENOENT ... package.json` in logs, Root Directory is wrong. Clear it or set it to blank, then redeploy.

Or use the repo root **Blueprint** (`render.yaml`) via **New** → **Blueprint**.

**Alternative:** set **Root Directory** to `backend` and use:
- **Build:** `npm install --include=dev && npm run build`
- **Start:** `npm start`

If `dist/index.js` is missing at start, the build step did not run or failed — check build logs for `tsc` / TypeScript errors.

## 3. Environment variables

| Variable | Required | Example |
|----------|----------|---------|
| `MONGO_URI` | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/socket-chat` |
| `JWT_SECRET` | Yes | long random string |
| `NODE_ENV` | Yes | `production` |
| `ALLOWED_ORIGINS` | Yes | `http://localhost:8080,https://your-app.vercel.app` |

Render sets `RENDER_EXTERNAL_URL` automatically; your service URL is added to CORS.

`PORT` is set by Render — do not override it.

## 4. Frontend

Point the frontend at your Render API:

```env
VITE_API_URL=https://your-service.onrender.com
```

Redeploy the frontend after changing this.

## 5. Notes

- **Uploads** (voice, images, files) use `/tmp` on Render and are **not persistent** across deploys or restarts. For production file storage, add S3 or Cloudinary later.
- **Free tier** may spin down after inactivity; first request can be slow.
- Socket.IO works on Render web services (WebSocket supported).
