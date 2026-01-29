const API_KEY = '5f2dbafafamsh87b419851b02d59p1c9ce3jsncbbd0bf87a70';
const API_HOST = 'network-as-code.nokia.rapidapi.com';
const BASE_URL = 'https://network-as-code.p-eu.rapidapi.com';

class AuthService {
    constructor() {
        this.accessToken = null;
        this.clientCredentials = null;
        this.endpoints = null;
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

        const state = 'state-' + Math.random().toString(36).substring(2, 15);

        const params = new URLSearchParams({
            scope: 'number-verification:verify',
            response_type: 'code',
            client_id: this.clientCredentials.client_id,
            redirect_uri: window.location.origin,
            login_hint: phoneNumber,
            state: state
        });

        const authUrl = `${this.endpoints.authorization_endpoint}?${params.toString()}`;
        console.log('🔗 Step 3: Authorization URL generated:', authUrl);
        return authUrl;
    }

    async exchangeCodeForToken(code) {
        console.log('🎫 Step 4: Exchanging authorization code for token...');
        console.log('📝 Authorization code received:', code);
        
        if (!this.endpoints || !this.clientCredentials) {
            throw new Error('Missing endpoints or client credentials');
        }

        const tokenData = {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: window.location.origin,
            client_id: this.clientCredentials.client_id,
            client_secret: this.clientCredentials.client_secret
        };

        // Try backend proxy for token exchange
        try {
            console.log('🔄 Attempting token exchange via backend proxy...');
            
            const response = await fetch('/api/token-exchange', {
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
                console.log('✅ Real token received via backend:', result);
                this.accessToken = result.access_token;
                return result;
            }
        } catch (error) {
            console.log('❌ Backend proxy request failed:', error.message);
        }

        throw new Error('Failed to exchange authorization code for token');
    }

    getAccessToken() {
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

    async authenticate(phoneNumber, addMessage) {
        try {
            if (addMessage) addMessage('Starting authentication flow...');
            
            await this.getClientCredentials();
            await this.getEndpoints();
            
            const authUrl = this.getAuthorizationUrl(phoneNumber);
            console.log('🔗 Redirecting to authorization URL');
            
            // Display URL in alert for easy copying
            alert('Step 3 - Authorization URL:\n\n' + authUrl + '\n\nClick OK to redirect...');
            
            // Save state before redirect
            sessionStorage.setItem('auth_phone', phoneNumber);
            sessionStorage.setItem('auth_return_url', window.location.href);
            sessionStorage.setItem('auth_credentials', JSON.stringify(this.clientCredentials));
            sessionStorage.setItem('auth_endpoints', JSON.stringify(this.endpoints));
            
            // Redirect to auth page
            window.location.href = authUrl;
            
            return new Promise(() => {}); // Never resolves as page redirects
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    // Check if we're returning from auth and need to handle the code
    async checkAndHandleCallback() {
        // First check if code is in current URL (direct redirect from Nokia)
        const urlParams = new URLSearchParams(window.location.search);
        const codeInUrl = urlParams.get('code');
        
        if (codeInUrl) {
            console.log('✅ Code found in URL:', codeInUrl);
            
            // Restore credentials and endpoints from sessionStorage
            const credStr = sessionStorage.getItem('auth_credentials');
            const endStr = sessionStorage.getItem('auth_endpoints');
            const authPhone = sessionStorage.getItem('auth_phone');
            
            if (credStr && endStr && authPhone) {
                this.clientCredentials = JSON.parse(credStr);
                this.endpoints = JSON.parse(endStr);
                console.log('✅ Restored credentials and endpoints');
                
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
                
                try {
                    const tokenData = await this.exchangeCodeForToken(codeInUrl);
                    
                    // Clear session storage
                    sessionStorage.removeItem('auth_phone');
                    sessionStorage.removeItem('auth_return_url');
                    sessionStorage.removeItem('auth_credentials');
                    sessionStorage.removeItem('auth_endpoints');
                    
                    return { success: true, phoneNumber: authPhone, tokenData };
                } catch (error) {
                    console.log('❌ Token exchange failed:', error);
                    sessionStorage.removeItem('auth_phone');
                    sessionStorage.removeItem('auth_return_url');
                    sessionStorage.removeItem('auth_credentials');
                    sessionStorage.removeItem('auth_endpoints');
                    return { error: error.message };
                }
            }
        }
        
        // Fallback: check for pending auth and prompt for URL
        const authPhone = sessionStorage.getItem('auth_phone');
        console.log('🔍 Checking for pending auth, phone:', authPhone);
        
        if (!authPhone) {
            console.log('❌ No pending auth found');
            return null;
        }

        console.log('✅ Pending auth found, prompting for URL...');

        // Restore credentials and endpoints
        const credStr = sessionStorage.getItem('auth_credentials');
        const endStr = sessionStorage.getItem('auth_endpoints');
        
        if (credStr && endStr) {
            this.clientCredentials = JSON.parse(credStr);
            this.endpoints = JSON.parse(endStr);
            console.log('✅ Restored credentials and endpoints');
        }

        // Prompt user for the URL with the code
        const urlInput = prompt(
            'After authentication, you will see an error page (this is normal).\n\n' +
            'Please copy the FULL URL from your browser address bar\n' +
            '(it should contain "code=" in it) and paste it here:'
        );
        
        if (!urlInput) {
            console.log('❌ User cancelled prompt');
            sessionStorage.removeItem('auth_phone');
            sessionStorage.removeItem('auth_return_url');
            sessionStorage.removeItem('auth_credentials');
            sessionStorage.removeItem('auth_endpoints');
            return { error: 'Authentication cancelled' };
        }
        
        const code = this.extractCodeFromUrl(urlInput);
        
        if (!code) {
            console.log('❌ No code found in URL');
            sessionStorage.removeItem('auth_phone');
            sessionStorage.removeItem('auth_return_url');
            sessionStorage.removeItem('auth_credentials');
            sessionStorage.removeItem('auth_endpoints');
            return { error: 'Could not find authorization code in URL' };
        }

        console.log('✅ Code extracted:', code);

        try {
            const tokenData = await this.exchangeCodeForToken(code);
            
            sessionStorage.removeItem('auth_phone');
            sessionStorage.removeItem('auth_return_url');
            sessionStorage.removeItem('auth_credentials');
            sessionStorage.removeItem('auth_endpoints');
            
            return { success: true, phoneNumber: authPhone, tokenData };
        } catch (error) {
            console.log('❌ Token exchange failed:', error);
            sessionStorage.removeItem('auth_phone');
            sessionStorage.removeItem('auth_return_url');
            sessionStorage.removeItem('auth_credentials');
            sessionStorage.removeItem('auth_endpoints');
            return { error: error.message };
        }
    }
}

export default new AuthService();