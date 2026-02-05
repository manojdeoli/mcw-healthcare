# Healthcare Demo - Setup Guide

## Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Backend Proxy Server
Open a terminal/command prompt and run:
```bash
cd backend
node server.js
```

You should see: `Proxy server running on http://localhost:3003`

**Keep this terminal running!**

### 3. Start the React Application
Open a **new** terminal/command prompt and run:
```bash
npm start
```

The application will automatically open at http://localhost:3000

## Running the Demo

1. The application will open in your default browser
2. Click **"Open ER Kiosk Display"** button to open the kiosk window
3. Navigate to the **"Admin Console"** tab for the main demo controls
4. Follow the demo flow:
   - Verify phone number
   - Check identity integrity
   - Start patient admission sequence
   - Monitor the kiosk display for real-time updates

## Important Notes

- **Both servers must be running**: Backend (port 3003) and Frontend (port 3000)
- **Allow popups**: The kiosk window requires popup permission
- **Browser compatibility**: Use Chrome, Edge, or Firefox for best results
- **Network**: Ensure you have internet connectivity for API calls

## Troubleshooting

### Backend server won't start
- Check if port 3003 is already in use
- Make sure you're in the `backend` directory when running `node server.js`

### Frontend won't start
- Check if port 3000 is already in use
- Run `npm install` again if you see dependency errors

### Kiosk window doesn't open
- Check browser popup settings and allow popups for localhost

## Project Structure
```
mcw-healthcare/
├── backend/           # Proxy server for OAuth token exchange
│   └── server.js
├── src/              # React application source code
├── public/           # Static assets
└── package.json      # Project dependencies
```

## Support
For issues or questions, contact the development team.
