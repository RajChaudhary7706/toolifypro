# ToolifyPro

## Overview
ToolifyPro is an all-in-one free online tool suite for PDF and image operations. It consists of a Node.js backend (API) and a static frontend.

## Features
- PDF merge, compress, split
- Image conversion and optimization
- Secure file handling

## Project Structure
- `backend/`: Node.js Express server
- `frontend/`: Static HTML files
- `netlify.toml`: Netlify config for frontend
- `render.yaml`: Render config for backend

## Setup
### Backend
1. Copy `.env.example` to `.env` and fill in values.
2. Run `npm install` in `backend/`.
3. Start server: `npm start` or `npm run dev`.

### Frontend
- Static files, no build needed. Deploy with Netlify or serve with backend.

## Deployment
- **Frontend:** Netlify (see `netlify.toml`)
- **Backend:** Render (see `render.yaml`)

## Security
- CORS, Helmet, Rate Limiting enabled

## Contact
For privacy or support: support@toolifypro.com

---

Feel free to update this README with more details as you add features.