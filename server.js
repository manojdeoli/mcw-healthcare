const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const https = require('https');

// Disable SSL verification for development (Nokia certificate issue)
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth redirect callback endpoint
app.get('/redirect', (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;

  console.log('📥 Redirect callback received:', { code, state, error });

  if (error) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Error</title></head>
      <body>
        <h3>Authentication Error</h3>
        <p>${error}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({type:'AUTH_ERROR',error:'${error}'}, '*');
            setTimeout(() => window.close(), 1000);
          }
        </script>
      </body>
      </html>
    `);
  } else if (code) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Success</title></head>
      <body>
        <h3>✅ Authentication Successful!</h3>
        <p>Authorization code received. Closing window...</p>
        <script>
          console.log('Sending code to parent:', '${code}');
          if (window.opener) {
            window.opener.postMessage({type:'AUTH_CODE',code:'${code}'}, '*');
            setTimeout(() => window.close(), 500);
          } else {
            document.body.innerHTML += '<p>Please close this window manually.</p>';
          }
        </script>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Auth Callback</title></head>
      <body>
        <h3>No authorization code received</h3>
        <script>setTimeout(() => window.close(), 2000);</script>
      </body>
      </html>
    `);
  }
});

// Token exchange proxy endpoint
app.post('/api/token-exchange', async (req, res) => {
  try {
    console.log('🔄 Backend: Proxying token exchange to Nokia...');
    
    const { tokenEndpoint, authHeader, body } = req.body;
    
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: body,
      agent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    const responseText = await response.text();
    console.log('📥 Nokia Response:', response.status, responseText);

    if (response.ok) {
      res.json(JSON.parse(responseText));
    } else {
      res.status(response.status).json({ error: responseText });
    }
  } catch (error) {
    console.error('❌ Backend error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve React build files (production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('📱 React app: http://localhost:3000');
    console.log('🔧 API server: http://localhost:3005');
  }
});