const API_KEY = 'a1dee25b3dmsh933c9f572c08b1cp1e7225jsna6c0a404fd8e';
const API_HOST = 'network-as-code.nokia.rapidapi.com';
const BASE_URL = 'https://network-as-code.p-eu.rapidapi.com';

class AuthService {
    constructor() {
        this.accessToken = null;
        this.clientCredentials = null;
        this.endpoints = null;
        this.tokenExpiresAt = null;
        this.isAuthenticating = false;
        
        // Restore token from localStorage on initialization
        const savedToken = localStorage.getItem('access_token');
        const savedExpiry = localStorage.getItem('token_expires_at');
        if (savedToken && savedExpiry) {
            this.accessToken = savedToken;
            this.tokenExpiresAt = parseInt(savedExpiry, 10);
            console.log('💾 Restored token from localStorage');
        }
    }

    getTimeUntilExpiry() {
        if (!this.tokenExpiresAt) return null;
        const secondsRemaining = Math.floor((this.tokenExpiresAt - Date.now()) / 1000);
        return secondsRemaining > 0 ? secondsRemaining : 0;
    }

    isTokenValid() {
        if (!this.accessToken || !this.tokenExpiresAt) return false;
        const buffer = 30000; // 30 seconds buffer
        const isValid = Date.now() < (this.tokenExpiresAt - buffer);
        if (!isValid) {
            // Clear expired token from localStorage
            localStorage.removeItem('access_token');
            localStorage.removeItem('token_expires_at');
        }
        return isValid;
    }

    saveAppState(state) {
        localStorage.setItem('app_state_backup', JSON.stringify(state));
    }

    restoreAppState() {
        const saved = localStorage.getItem('app_state_backup');
        if (saved) {
            localStorage.removeItem('app_state_backup');
            return JSON.parse(saved);
        }
        return null;
    }

    async getClientCredentials() {
        console.log('🔑 Step 1: Getting client credentials...');
        const response = await fetch(`${BASE_URL}/oauth2/v1/auth/clientcredentials`, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Host': API_HOST,
                'X-RapidAPI-Key': API_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get client credentials: ${response.status}`);
        }
        
        this.clientCredentials = await response.json();
        console.log('✅ Client credentials received:', this.clientCredentials);
        return this.clientCredentials;
    }

    async getEndpoints() {
        console.log('🌐 Step 2: Getting endpoints...');
        const response = await fetch(`${BASE_URL}/.well-known/openid-configuration`, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Host': API_HOST,
                'X-RapidAPI-Key': API_KEY
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to get endpoints: ${response.status}`);
        }
        
        this.endpoints = await response.json();
        console.log('✅ Endpoints received:', this.endpoints);
        return this.endpoints;
    }

    getAuthorizationUrl(phoneNumber) {
        if (!this.endpoints || !this.clientCredentials) {
            throw new Error('Must call getClientCredentials and getEndpoints first');
        }

        const port = window.location.port || '3000';
        const redirectUri = `http://localhost:${port}/redirect`;

        const params = new URLSearchParams({
            scope: 'number-verification:verify',
            response_type: 'code',
            client_id: this.clientCredentials.client_id,
            redirect_uri: redirectUri,
            login_hint: phoneNumber
        });

        const authUrl = `${this.endpoints.authorization_endpoint}?${params.toString()}`;
        console.log('🔗 Step 3: Authorization URL generated');
        return { authUrl, redirectUri };
    }

    async exchangeCodeForToken(code, redirectUri) {
        console.log('🎫 Step 4: Exchanging authorization code for token...');
        console.log('📝 Authorization code received:', code);
        
        if (!this.endpoints || !this.clientCredentials) {
            throw new Error('Missing endpoints or client credentials');
        }

        const tokenData = {
            grant_type: 'authorization_code',
            code: code,
            client_id: this.clientCredentials.client_id,
            client_secret: this.clientCredentials.client_secret
        };

        // Use backend proxy for token exchange (required due to CORS)
        try {
            console.log('🔄 Attempting token exchange via backend proxy...');
            console.log('📤 Token endpoint:', this.endpoints.token_endpoint);
            console.log('📤 Token data:', tokenData);
            
            const currentPort = window.location.port || '3000';
            const response = await fetch(`http://localhost:${currentPort}/api/token-exchange`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tokenEndpoint: this.endpoints.token_endpoint,
                    authHeader: `Basic ${btoa(this.clientCredentials.client_id + ':' + this.clientCredentials.client_secret)}`,
                    body: new URLSearchParams(tokenData).toString()
                })
            });

            console.log('📥 RESPONSE STATUS:', response.status);
            const responseText = await response.text();
            console.log('📥 RESPONSE BODY:', responseText);

            if (response.ok) {
                const result = JSON.parse(responseText);
                console.log('✅ Token received');
                this.accessToken = result.access_token;
                this.tokenExpiresAt = Date.now() + (result.expires_in * 1000);
                
                // Persist token to localStorage
                localStorage.setItem('access_token', result.access_token);
                localStorage.setItem('token_expires_at', this.tokenExpiresAt.toString());
                
                return result;
            }
        } catch (error) {
            console.log('❌ Backend proxy request failed:', error.message);
        }

        throw new Error('Failed to exchange authorization code for token');
    }

    getAccessToken() {
        if (this.tokenExpiresAt && Date.now() >= this.tokenExpiresAt - 30000) {
            console.warn('⚠️ Token expired or about to expire - please re-authenticate');
        }
        return this.accessToken;
    }

    isAuthenticated() {
        return this.isTokenValid();
    }

    extractCodeFromUrl(urlString) {
        try {
            // Ignore about:blank and empty URLs
            if (!urlString || urlString === 'about:blank' || urlString.startsWith('about:')) {
                return null;
            }

            const url = new URL(urlString);
            
            // Skip logging for initial empty/localhost state to avoid confusion
            if (url.origin === window.location.origin && !url.search) {
                return null;
            }

            console.log('🔍 Processing URL:', urlString);
            
            // Check direct code parameter
            let code = url.searchParams.get('code');
            if (code) {
                console.log('✅ Found code directly:', code);
                return code;
            }

            // Check Zscaler original_url
            const originalUrl = url.searchParams.get('original_url');
            if (originalUrl) {
                console.log('🔍 Decoded Original Callback URL:', originalUrl);
                const nestedUrl = new URL(originalUrl);
                code = nestedUrl.searchParams.get('code');
                if (code) {
                    console.log('✅ Found code in nested URL:', code);
                    return code;
                }
            }
            
            return null;
        } catch (e) {
            // Silently ignore URL parsing errors
            return null;
        }
    }

    async handleAuthCode(code, addMessage, resolve, reject, popup) {
        try {
            console.log('🔑 Authorization Code:', code);
            if (addMessage) addMessage(`Authorization Code: ${code}`);
            
            const tokenData = await this.exchangeCodeForToken(code);
            
            console.log('🎫 Access Token:', tokenData.access_token);
            if (addMessage) addMessage('Authentication completed!');
            
            if (popup && !popup.closed) popup.close();
            resolve(tokenData);
        } catch (error) {
            if (popup && !popup.closed) popup.close();
            reject(error);
        }
    }

    async authenticate(phoneNumber) {
        if (this.isAuthenticating) {
            console.log('⚠️ Authentication already in progress, skipping...');
            return new Promise(() => {});
        }
        
        this.isAuthenticating = true;
        
        try {
            console.log('🔑 Step 1: Getting client credentials for phone:', phoneNumber);
            await this.getClientCredentials();
            console.log('✅ Step 1 complete - Client credentials received');
            
            console.log('🌐 Step 2: Getting endpoints...');
            await this.getEndpoints();
            console.log('✅ Step 2 complete - Endpoints received');
            
            console.log('🔗 Step 3: Generating authorization URL...');
            const { authUrl, redirectUri } = this.getAuthorizationUrl(phoneNumber);
            console.log('✅ Step 3 complete - Auth URL:', authUrl);
            
            // Save to sessionStorage for callback handling
            console.log('💾 Saving auth state to sessionStorage...');
            sessionStorage.setItem('auth_phone', phoneNumber);
            sessionStorage.setItem('auth_redirect_uri', redirectUri);
            sessionStorage.setItem('auth_credentials', JSON.stringify(this.clientCredentials));
            sessionStorage.setItem('auth_endpoints', JSON.stringify(this.endpoints));
            console.log('✅ Auth state saved to sessionStorage');
            
            console.log('🚀 Redirecting to OAuth provider...');
            window.location.href = authUrl;
            
            return new Promise(() => {});
        } catch (error) {
            console.error('❌ Authentication failed at setup stage:', error);
            this.isAuthenticating = false;
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    async checkAndHandleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');
        
        console.log('🔍 Checking for OAuth callback...', { code, error, errorDescription, url: window.location.href });
        
        // Handle OAuth error responses
        if (error) {
            console.error('❌ OAuth Error:', error, errorDescription);
            const errorMsg = `Authentication failed: ${error}${errorDescription ? ' - ' + errorDescription : ''}`;
            
            // Clear any stale session data
            sessionStorage.clear();
            this.isAuthenticating = false;
            
            // Show user-friendly error
            alert(`Authentication Error:\n\n${errorMsg}\n\nThis may be due to:\n- Phone number not supported by the OAuth provider\n- Browser security settings blocking the authentication\n- Network/proxy issues\n\nPlease try:\n1. Using a different phone number\n2. Clearing browser cache and cookies\n3. Trying a different browser`);
            
            // Redirect to home page
            window.history.replaceState({}, document.title, window.location.pathname);
            return { error: errorMsg };
        }
        
        if (code) {
            console.log('✅ Code found in URL:', code);
            
            const credStr = sessionStorage.getItem('auth_credentials');
            const endStr = sessionStorage.getItem('auth_endpoints');
            const authPhone = sessionStorage.getItem('auth_phone');
            const redirectUri = sessionStorage.getItem('auth_redirect_uri');
            
            console.log('📦 Session data:', { hasCredentials: !!credStr, hasEndpoints: !!endStr, authPhone, redirectUri });
            
            if (credStr && endStr && authPhone) {
                this.clientCredentials = JSON.parse(credStr);
                this.endpoints = JSON.parse(endStr);
                
                window.history.replaceState({}, document.title, window.location.pathname);
                
                try {
                    const tokenData = await this.exchangeCodeForToken(code, redirectUri);
                    sessionStorage.clear();
                    this.isAuthenticating = false;
                    console.log('✅ Authentication complete!');
                    return { success: true, phoneNumber: authPhone, tokenData };
                } catch (error) {
                    console.log('❌ Token exchange failed:', error);
                    sessionStorage.clear();
                    this.isAuthenticating = false;
                    return { error: error.message };
                }
            } else {
                console.log('❌ Missing session data - authentication state lost');
                this.isAuthenticating = false;
            }
        }
        
        return null;
    }
}

export default new AuthService();