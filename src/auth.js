const API_KEY = '5f2dbafafamsh87b419851b02d59p1c9ce3jsncbbd0bf87a70';
const API_HOST = 'network-as-code.nokia.rapidapi.com';
const BASE_URL = 'https://network-as-code.p-eu.rapidapi.com';

class AuthService {
    constructor() {
        this.accessToken = null;
        this.clientCredentials = null;
        this.endpoints = null;
        this.tokenExpiresAt = null;
    }

    getTimeUntilExpiry() {
        if (!this.tokenExpiresAt) return null;
        const secondsRemaining = Math.floor((this.tokenExpiresAt - Date.now()) / 1000);
        return secondsRemaining > 0 ? secondsRemaining : 0;
    }

    isTokenValid() {
        if (!this.accessToken || !this.tokenExpiresAt) return false;
        const buffer = 30000; // 30 seconds buffer
        return Date.now() < (this.tokenExpiresAt - buffer);
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

        const redirectUri = 'http://localhost:3000/redirect';

        const params = new URLSearchParams({
            scope: 'number-verification:verify',
            response_type: 'code',
            client_id: this.clientCredentials.client_id,
            redirect_uri: redirectUri,
            login_hint: phoneNumber
        });

        const authUrl = `${this.endpoints.authorization_endpoint}?${params.toString()}`;
        console.log('🔗 Step 3: Authorization URL generated:', authUrl);
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
            
            const response = await fetch('http://localhost:3003/api/token-exchange', {
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
                console.log('✅ Token received via backend:', result);
                this.accessToken = result.access_token;
                this.tokenExpiresAt = Date.now() + (result.expires_in * 1000);
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
        return !!this.accessToken;
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
        try {
            await this.getClientCredentials();
            await this.getEndpoints();
            
            const { authUrl, redirectUri } = this.getAuthorizationUrl(phoneNumber);
            
            localStorage.setItem('auth_url_step3', authUrl);
            console.log('🔗 Step 3 Authorization URL:', authUrl);
            console.log('📋 URL saved to localStorage for reference');
            
            sessionStorage.setItem('auth_phone', phoneNumber);
            sessionStorage.setItem('auth_redirect_uri', redirectUri);
            sessionStorage.setItem('auth_credentials', JSON.stringify(this.clientCredentials));
            sessionStorage.setItem('auth_endpoints', JSON.stringify(this.endpoints));
            
            window.location.href = authUrl;
            
            return new Promise(() => {});
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    // Check if we're returning from auth and need to handle the code
    async checkAndHandleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
            console.log('✅ Code found in URL:', code);
            
            // Restore credentials and endpoints from sessionStorage
            const credStr = sessionStorage.getItem('auth_credentials');
            const endStr = sessionStorage.getItem('auth_endpoints');
            const authPhone = sessionStorage.getItem('auth_phone');
            const redirectUri = sessionStorage.getItem('auth_redirect_uri');
            
            if (credStr && endStr && authPhone) {
                this.clientCredentials = JSON.parse(credStr);
                this.endpoints = JSON.parse(endStr);
                console.log('✅ Restored credentials and endpoints');
                
                // Clean URL immediately to prevent reprocessing
                window.history.replaceState({}, document.title, window.location.pathname);
                
                try {
                    const tokenData = await this.exchangeCodeForToken(code, redirectUri);
                    
                    // Clear session storage
                    sessionStorage.clear();
                    
                    return { success: true, phoneNumber: authPhone, tokenData };
                } catch (error) {
                    console.log('❌ Token exchange failed:', error);
                    sessionStorage.clear();
                    return { error: error.message };
                }
            }
        }
        
        return null;
    }
}

export default new AuthService();