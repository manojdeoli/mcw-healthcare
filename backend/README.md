# Backend Proxy Server

This is a simple proxy server to handle OAuth token exchange for the healthcare demo application.

## Setup

1. Install dependencies (if not already installed from root):
   ```
   npm install express cors axios
   ```

2. Start the server:
   ```
   node server.js
   ```

The server will run on http://localhost:3003

## Purpose

This proxy server handles the OAuth token exchange with the Nokia Network API, which requires server-side processing due to CORS restrictions.
