import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import { format } from 'date-fns';
import * as api from './api';
import authService from './auth';
import { formFields, generatePatientId } from './formFields';
import ambulanceIconPng from './ambulance.png';
import patientIconPng from './patient.png';


// --- Fix for Leaflet's default icon ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
});
// --- End of fix ---

// --- Dummy Booking Data & Initial Time ---
const getInitialArtificialTime = (mode) => {
  const checkInDate = new Date();
  checkInDate.setHours(15, 0, 0, 0); // Today at 3:00 PM

  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + 1);
  checkOutDate.setHours(11, 0, 0, 0); // Tomorrow at 11:00 AM

  if (mode === 'arrival') {
    return new Date(checkInDate.getTime() - 30 * 60 * 1000); // Start clock 30 minutes before check-in
  }
  return new Date(checkOutDate.getTime() - 30 * 60 * 1000); // Start clock 30 minutes before check-out
};
// --- End of Data & Initial Time ---

// --- Location Simulation Data ---


const generateRoute = (start, end, sections = 10) => {
  if (!start) return [end];
  const route = [start];
  const latDiff = (end.lat - start.lat) / sections;
  const lngDiff = (end.lng - start.lng) / sections;

  for (let i = 1; i < sections; i++) {
    route.push({
      lat: start.lat + latDiff * i,
      lng: start.lng + lngDiff * i,
    });
  }
  route.push(end);
  return route;
};

// --- End of Location Simulation Data ---

function getDistance(coords1, coords2) {
  const R = 6371e3; // metres
  const φ1 = coords1.lat * Math.PI / 180;
  const φ2 = coords2.lat * Math.PI / 180;
  const Δφ = (coords2.lat - coords1.lat) * Math.PI / 180;
  const Δλ = (coords2.lng - coords1.lng) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const LocationMap = ({ userGps, hospitalLocation, verifiedPhoneNumber, simulationMode }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapUpdateThrottle = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);

  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      if (mapRef.current._leaflet_id) mapRef.current._leaflet_id = null;
      const map = L.map(mapRef.current).setView([-33.8688, 151.2093], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      mapInstanceRef.current = map;
      setIsMapReady(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn("Map cleanup error", e);
        }
        mapInstanceRef.current = null;
        setIsMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    if (isMapReady && mapInstance && userGps && hospitalLocation) {
      mapInstance.invalidateSize();
      mapInstance.eachLayer((layer) => {
        if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polyline || !layer._url) { // Keep tile layer
          mapInstance.removeLayer(layer);
        }
      });

      if (verifiedPhoneNumber && userGps && hospitalLocation && !mapUpdateThrottle.current) {
        mapUpdateThrottle.current = setTimeout(() => {
          mapUpdateThrottle.current = null;
        }, 1000);

        const updateMapView = () => {
          const distance = getDistance(userGps, hospitalLocation);
          const ZOOM_START_RADIUS = 2000;
          const MIN_ZOOM = 12;
          const MAX_ZOOM = 18;

          let newZoom;
          if (distance >= ZOOM_START_RADIUS) {
            newZoom = MIN_ZOOM;
          } else {
            const zoomProgress = 1 - (distance / ZOOM_START_RADIUS);
            newZoom = MIN_ZOOM + (MAX_ZOOM - MIN_ZOOM) * zoomProgress;
          }

          const midLat = (userGps.lat + hospitalLocation.lat) / 2;
          const midLng = (userGps.lng + hospitalLocation.lng) / 2;

          mapInstance.setView([midLat, midLng], newZoom, { animate: true, pan: { duration: 2.5 } });
        }
        if (verifiedPhoneNumber) {
          updateMapView();
        }
      }

      if (hospitalLocation && hospitalLocation.lat && hospitalLocation.lng) {
        const hospitalIcon = L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000" width="32px" height="32px"><path d="M18 13h-5v5h-2v-5H6v-2h5V6h2v5h5v2z"/><path d="M0 0h24v24H0z" fill="none"/></svg>`,
          className: 'hospital-location-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });
        L.marker([hospitalLocation.lat, hospitalLocation.lng], { icon: hospitalIcon }).addTo(mapInstance).bindPopup('Wellsoon Hospital');

        L.circle([hospitalLocation.lat, hospitalLocation.lng], {
          color: 'red',
          fillColor: '#ff0000',
          fillOpacity: 0.2,
          radius: 100
        }).addTo(mapInstance).bindPopup('Hospital Check-in Area');
      }

      if (userGps && verifiedPhoneNumber) {
        const iconUrl = simulationMode === 'departure' ? patientIconPng : ambulanceIconPng;
        const userIcon = L.icon({
          iconUrl: iconUrl,
          iconSize: [32, 32],
          iconAnchor: [20, 40],
          popupAnchor: [0, -32]
        });

        L.marker([userGps.lat, userGps.lng], { icon: userIcon }).addTo(mapInstance).bindPopup('User Location');
      }
    }
  }, [userGps, verifiedPhoneNumber, hospitalLocation, isMapReady, simulationMode]);

  return <div id="map" ref={mapRef} style={{ height: '350px', width: '100%' }}></div>;
};

const ApiLogsView = ({ apiLogs, onClear, maxHeight }) => (
  <div className="card">
    <div className="card-header d-flex justify-content-between align-items-center">
      <h2 className="mb-0">Real-time Network API Logs</h2>
      <button className="btn btn-sm btn-outline-secondary" onClick={onClear}>Clear</button>
    </div>
    <div className="p-3" style={maxHeight ? { maxHeight, overflowY: 'auto' } : {}}>
      {apiLogs.length === 0 && <p>No API interactions yet. Start a sequence in Patient Dashboard.</p>}
      {apiLogs.map(log => (
        <div key={log.id} style={{ border: '1px solid #ccc', marginBottom: '15px', borderRadius: '5px', overflow: 'hidden' }}>
          <div style={{ background: '#e9ecef', padding: '10px', fontWeight: 'bold', borderBottom: '1px solid #ccc' }}>
            {log.timestamp.split('T')[1].split('.')[0]} - {log.title}
          </div>
          <div style={{ display: 'flex', fontSize: '0.9em' }}>
            <div style={{ flex: 1, padding: '10px', borderRight: '1px solid #eee', background: '#fff' }}>
              <strong>Request:</strong>
              <div style={{ color: '#0056b3', marginBottom: '5px' }}>{log.method} {log.url}</div>
              <pre style={{ background: '#f8f9fa', padding: '5px', borderRadius: '3px', overflowX: 'auto' }}>{JSON.stringify(log.request, null, 2)}</pre>
            </div>
            <div style={{ flex: 1, padding: '10px', background: '#fff' }}>
              <strong>Response:</strong>
              <pre style={{ background: '#f8f9fa', padding: '5px', borderRadius: '3px', overflowX: 'auto' }}>{JSON.stringify(log.response, null, 2)}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState('');
  const [tokenExpirySeconds, setTokenExpirySeconds] = useState(null);
  const [activeScreen, setActiveScreen] = useState(() => {
    const saved = localStorage.getItem('activeScreen');
    return saved ? parseInt(saved) : 1;
  });
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState(() => {
    const stored = localStorage.getItem('verifiedPhoneNumber');
    return (stored && stored !== 'null' && stored !== 'undefined') ? stored : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [kycMatchResponse, setKycMatchResponse] = useState(null);
  const [location, setLocation] = useState(null);
  // New state variables based on the plan
  const [simulationMode, setSimulationMode] = useState('arrival'); // 'arrival' or 'departure'
  const [registrationStatus, setRegistrationStatus] = useState('Not Registered');
  const [artificialTime, setArtificialTime] = useState(null);
  const [identityIntegrity, setIdentityIntegrity] = useState('Bad');
  const [patientStatus, setPatientStatus] = useState('Not Checked In');
  const [paymentStatus, setPaymentStatus] = useState('Not Paid');
  const [geofencingSubscriptionId, setGeofencingSubscriptionId] = useState(null);
  const [outpatientStatus, setOutpatientStatus] = useState('Inactive');
  const [hospitalLocation, setHospitalLocation] = useState(null);
  const [userGps, setUserGps] = useState(null);
  const [initialUserLocation, setInitialUserLocation] = useState(null);
  const [lastIntegrityCheckTime, setLastIntegrityCheckTime] = useState(null);
  const [patientMedicalDetails, setPatientMedicalDetails] = useState({
    patientId: '',
    esi: '',
    vitals: '',
    complaint: '',
    eta: '',
    medicalHistory: '',
    treatmentNeeds: { specialists: [], equipment: [] },
  });

  const [messages, setMessages] = useState([]);
  const [apiLogs, setApiLogs] = useState([]);
  
  // Initialize authentication on app start
  useEffect(() => {
    console.log('🚀 App mounted, checking for auth callback...');
    
    const step3Url = localStorage.getItem('auth_url_step3');
    if (step3Url) {
      console.log('📝 Step 3 Authorization URL (from previous session):', step3Url);
    }
    
    const checkAuth = async () => {
      const authResult = await authService.checkAndHandleCallback();
      
      console.log('📝 Auth result:', authResult);
      
      if (authResult) {
        if (authResult.success) {
          setIsAuthenticated(true);
          setVerifiedPhoneNumber(authResult.phoneNumber);
          localStorage.setItem('verifiedPhoneNumber', authResult.phoneNumber);
          localStorage.removeItem('auth_url_step3');
          localStorage.setItem('has_authenticated', 'true');
          broadcast('SET_VERIFIED_PHONE', authResult.phoneNumber);
          
          // Check if we need to resume verification
          const shouldResume = localStorage.getItem('shouldResumeVerification');
          const pendingPhone = localStorage.getItem('pendingPhoneVerification');
          if (shouldResume === 'true' && pendingPhone) {
            localStorage.removeItem('shouldResumeVerification');
            // Trigger verification after a short delay to let state settle
            setTimeout(() => {
              const verifyBtn = document.getElementById('verifyBtn');
              if (verifyBtn) verifyBtn.click();
            }, 100);
          }
          
          // Check if we need to resume monitoring
          const shouldResumeMonitoring = localStorage.getItem('shouldResumeMonitoring');
          if (shouldResumeMonitoring === 'true') {
            // Trigger monitoring after a short delay to let state settle
            setTimeout(() => {
              const monitoringBtns = document.querySelectorAll('button');
              monitoringBtns.forEach(btn => {
                if (btn.textContent === 'Start Monitoring') {
                  btn.click();
                }
              });
            }, 100);
          }
          
          // Restore outpatient monitoring status
          const savedOutpatientStatus = localStorage.getItem('outpatientStatus');
          if (savedOutpatientStatus && savedOutpatientStatus !== 'Inactive') {
            syncSetOutpatientStatus(savedOutpatientStatus);
          }
        } else if (authResult.error) {
          setAuthError(authResult.error);
        }
        return;
      }
      
      if (authService.isAuthenticated()) {
        console.log('✅ Token still valid, restoring authentication state');
        setIsAuthenticated(true);
        return;
      }
      
      // Auto-authenticate only on first visit
      const hasAuthenticated = localStorage.getItem('has_authenticated');
      console.log('🔍 Checking has_authenticated flag:', hasAuthenticated);
      if (!hasAuthenticated) {
        console.log('🔐 First visit - triggering auto-authentication');
        const phoneToUse = '+99999991000';
        setPhone(phoneToUse);
        setTimeout(async () => {
          try {
            await authService.authenticate(phoneToUse);
          } catch (error) {
            console.error('Auto-authentication failed:', error);
          }
        }, 100);
      }
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const interval = setInterval(() => {
        const seconds = authService.getTimeUntilExpiry();
        setTokenExpirySeconds(seconds);
        if (seconds === 0) {
          setIsAuthenticated(false);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // --- Broadcast Channel for Cross-Tab Sync ---
  const channelRef = useRef(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel('healthcare_demo_sync_v2');
    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      switch (type) {
        case 'SET_VERIFIED_PHONE':
          setVerifiedPhoneNumber(data);
          break;
        case 'SET_IDENTITY_INTEGRITY':
          setIdentityIntegrity(data);
          break;
        case 'SET_REGISTRATION_STATUS':
          setRegistrationStatus(data);
          break;
        case 'SET_PATIENT_STATUS':
          setPatientStatus(data);
          break;
        case 'SET_PAYMENT_STATUS':
          setPaymentStatus(data);
          break;
        case 'SET_GEOFENCING_SUB_ID':
          setGeofencingSubscriptionId(data);
          break;
        case 'SET_OUTPATIENT_STATUS':
          setOutpatientStatus(data);
          break;
        case 'SET_HOSPITAL_LOCATION':
          setHospitalLocation(data);
          break;
        case 'SET_USER_GPS':
          setUserGps(data);
          break;
        case 'SET_INITIAL_USER_LOCATION':
          setInitialUserLocation(data);
          break;
        case 'SET_MEDICAL_DETAILS':
          setPatientMedicalDetails(data);
          break;
        case 'SET_ADDITIONAL_PATIENTS':
          setAdditionalPatients(data);
          break;
        case 'ADD_MESSAGE':
          setMessages(prev => {
             if (prev.includes(data)) return prev;
             return [...prev, data];
          });
          break;
        case 'SET_ARTIFICIAL_TIME':
          setArtificialTime(data ? new Date(data) : null);
          break;
        case 'SET_FORM_STATE':
          setFormState(data);
          break;
        case 'SET_KYC_MATCH_RESPONSE':
          setKycMatchResponse(data);
          break;
        case 'SET_LAST_INTEGRITY_CHECK_TIME':
          setLastIntegrityCheckTime(data ? new Date(data) : null);
          break;
        case 'ADD_API_LOG':
          setApiLogs(prev => [data, ...prev]);
          break;
        default: break;
      }
    };
    return () => channelRef.current?.close();
  }, []);

  const broadcast = (type, data) => {
    channelRef.current?.postMessage({ type, data });
  };

  // Sync Wrappers
  const syncSetUserGps = (val) => { setUserGps(val); broadcast('SET_USER_GPS', val); };
  const syncSetPatientStatus = (val) => { setPatientStatus(val); broadcast('SET_PATIENT_STATUS', val); };
  const syncSetPaymentStatus = (val) => { setPaymentStatus(val); broadcast('SET_PAYMENT_STATUS', val); };
  const syncSetGeofencingSubscriptionId = (val) => { setGeofencingSubscriptionId(val); broadcast('SET_GEOFENCING_SUB_ID', val); };
  const syncSetPatientMedicalDetails = (val) => {
    setPatientMedicalDetails(prev => {
        const newData = typeof val === 'function' ? val(prev) : val;
        broadcast('SET_MEDICAL_DETAILS', newData);
        return newData;
    });
  };
  const syncSetAdditionalPatients = (val) => {
    setAdditionalPatients(val);
    broadcast('SET_ADDITIONAL_PATIENTS', val);
  };
  const syncSetArtificialTime = (val) => { setArtificialTime(val); broadcast('SET_ARTIFICIAL_TIME', val); };
  const syncSetOutpatientStatus = (val) => { setOutpatientStatus(val); broadcast('SET_OUTPATIENT_STATUS', val); };
  const syncSetIdentityIntegrity = (val) => { setIdentityIntegrity(val); broadcast('SET_IDENTITY_INTEGRITY', val); };
  const syncSetRegistrationStatus = (val) => { setRegistrationStatus(val); broadcast('SET_REGISTRATION_STATUS', val); };
  const syncSetHospitalLocation = (val) => { setHospitalLocation(val); broadcast('SET_HOSPITAL_LOCATION', val); };
  const syncSetInitialUserLocation = (val) => { setInitialUserLocation(val); broadcast('SET_INITIAL_USER_LOCATION', val); };
  const syncSetFormState = (val) => {
    setFormState(prev => {
        const newData = typeof val === 'function' ? val(prev) : val;
        broadcast('SET_FORM_STATE', newData);
        return newData;
    });
  };
  const syncSetKycMatchResponse = (val) => { setKycMatchResponse(val); broadcast('SET_KYC_MATCH_RESPONSE', val); };
  const syncSetLastIntegrityCheckTime = (val) => { setLastIntegrityCheckTime(val); broadcast('SET_LAST_INTEGRITY_CHECK_TIME', val); };
  const syncSetLocation = (val) => { setLocation(val); }; // Location object not strictly synced for map, userGps is used

  const addMessage = (message) => {
    setMessages(prevMessages => {
      const newMessage = `${new Date().toLocaleTimeString()}: ${message}`;
      if (prevMessages.includes(newMessage)) {
        return prevMessages;
      }
      broadcast('ADD_MESSAGE', newMessage);
      return [...prevMessages, newMessage];
    });
  };

  const logApiInteraction = (title, method, url, request, response) => {
    const logEntry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      title,
      method,
      url,
      request,
      response
    };
    setApiLogs(prev => [logEntry, ...prev]);
    broadcast('ADD_API_LOG', logEntry);
  };


  // --- State Persistence Logic ---
  // On component mount, load state from localStorage

  const [isSequenceRunning, setIsSequenceRunning] = useState(false);
  const userProfileRef = useRef(null);
  const [formState, setFormState] = useState(
    formFields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [additionalPatients, setAdditionalPatients] = useState([]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    syncSetFormState(prevState => ({ ...prevState, [name]: value }));
    if (kycMatchResponse) {
      syncSetKycMatchResponse(null);
    }
  };

  const handlePhoneChange = (e) => {
    setPhone(e.target.value);
    setSuccess('');
    setError('');
  };

  useEffect(() => {
    if (verifiedPhoneNumber) {
      localStorage.setItem('verifiedPhoneNumber', verifiedPhoneNumber);
    }
  }, [verifiedPhoneNumber]);

  useEffect(() => {
    // Auto-scroll all log containers
    const containers = document.querySelectorAll('.log-container');
    containers.forEach(container => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messages, activeScreen]);

  const getVerifiedNumber = () => verifiedPhoneNumber || localStorage.getItem('verifiedPhoneNumber');

  const handleRegistrationSequence = async () => {
    const phone = getVerifiedNumber();
    if (!phone) {
      alert('Please verify your phone number first to start registration.');
      return;
    }
    syncSetRegistrationStatus('Registered');
    addMessage("Registration Status: Registered");
  };

  const submitKyc = async () => {
    const phone = getVerifiedNumber();
    if (!phone) {
      alert('Please verify your phone number first.');
      return;
    }

    setIsLoading(true);
    try {
      const kycReq = {
        phoneNumber: phone,
        email: formState.email,
        address: formState.address,
        birthdate: formState.birthdate,
        name: formState.name
      };
      const kycData = await api.kycMatch(kycReq);
      logApiInteraction('KYC Match', 'POST', '/kyc-match/kyc-match/v0.2/match', api.obscureKycRequest(kycReq), kycData);

      syncSetKycMatchResponse(kycData);

      // Check if all fields are true after the match
      const allFieldsMatch = !Object.values(kycData).includes('false');
      if (allFieldsMatch) {
        syncSetRegistrationStatus('Registered');
        addMessage('KYC Match successful. Proceed with check-in.');
      }

    } catch (err) {
      console.error('KYC Match failed:', err);
      addMessage(`KYC Match API Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Identity Integrity Timeout Logic ---
  useEffect(() => {
    if (identityIntegrity === 'Good' && lastIntegrityCheckTime && artificialTime) {
      const timeoutMs = 24 * 60 * 60 * 1000; // Increased to 24 hours for demo
      const timeSinceCheck = artificialTime.getTime() - lastIntegrityCheckTime.getTime();

      if (timeSinceCheck > timeoutMs) {
        syncSetIdentityIntegrity('Bad');
        addMessage("Identity Integrity Check Expired (24 Hour Timeout)");
      }
    }
  }, [artificialTime, identityIntegrity, lastIntegrityCheckTime]);

  const [phone, setPhone] = useState(() => {
    return localStorage.getItem('pendingPhoneVerification') || '';
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (isSequenceRunning && verifiedPhoneNumber) {
      const timer = setInterval(() => {
        setArtificialTime(prevTime => {
            const newTime = prevTime ? new Date(prevTime.getTime() + 50000) : getInitialArtificialTime(simulationMode);
            broadcast('SET_ARTIFICIAL_TIME', newTime);
            return newTime;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isSequenceRunning, verifiedPhoneNumber, simulationMode]);

  // Authentication handler
  const handleAuthentication = async () => {
    const phoneToUse = phone || getVerifiedNumber() || '+99999991000';

    setIsAuthenticating(true);
    setAuthError('');
    if (!phone && !getVerifiedNumber()) {
      setPhone(phoneToUse);
    }
    
    try {
      await authService.authenticate(phoneToUse);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Authentication failed:', error);
      setAuthError(`Authentication failed: ${error.message}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const validatePhone = async (e) => {
    e.preventDefault();
    const fullPhoneNumber = phone.replace(/\s/g, '');
    const regex = /^\+\d{10,15}$/
    setError('');
    setSuccess('');

    if (!regex.test(fullPhoneNumber)) {
      setError('Please enter a valid international phone number (e.g., +61412345678).');
      return;
    }
    
    // Save current screen and phone number before verification
    localStorage.setItem('activeScreen', activeScreen.toString());
    localStorage.setItem('pendingPhoneVerification', fullPhoneNumber);
    localStorage.setItem('shouldResumeVerification', 'true');

    setIsLoading(true);
    try {
      const verificationData = await api.verifyPhoneNumber(fullPhoneNumber);
      logApiInteraction('Number Verification', 'POST', '/number-verification/number-verification/v0/verify', { phoneNumber: fullPhoneNumber }, verificationData);

      if (verificationData.devicePhoneNumberVerified === true) {
        addMessage("Phone number is verified...");
        setSuccess('Phone number is verified.');
        setVerifiedPhoneNumber(fullPhoneNumber);
        localStorage.setItem('verifiedPhoneNumber', fullPhoneNumber);
        localStorage.removeItem('pendingPhoneVerification');
        broadcast('SET_VERIFIED_PHONE', fullPhoneNumber);
      } else {
        setError(`Phone number verification failed.`);
      }
    } catch (err) {
      console.error('API call failed:', err);
      setError('An error occurred during verification. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkIdentityIntegrity = async (loader) => {
    // TODO: Temporarily using phone from text box for testing since Nokia doesn't provide a number with all APIs working
    // In production, should use: const phoneToCheck = getVerifiedNumber();
    const phoneToCheck = phone || getVerifiedNumber();
    if (!phoneToCheck) {
      alert('Please enter or verify phone number first.');
      return false;
    }
    setIsLoading(loader);
    setIdentityIntegrity('Checking...');
    try {
      const simSwapReq = { phoneNumber: phoneToCheck, maxAge: 240 };
      const simSwapResult = await api.simSwap(phoneToCheck);
      logApiInteraction('SIM Swap', 'POST', '/sim-swap/sim-swap/v0/check', simSwapReq, simSwapResult);

      const deviceSwapReq = { phoneNumber: phoneToCheck, maxAge: 240 };
      const deviceSwapResult = await api.deviceSwap(phoneToCheck);
      logApiInteraction('Device Swap', 'POST', '/device-swap/device-swap/v1/check', deviceSwapReq, deviceSwapResult);

      const isSimSwapped = simSwapResult && simSwapResult.swapped === true;
      const isDeviceSwapped = deviceSwapResult && deviceSwapResult.swapped === true;

      if (isSimSwapped || isDeviceSwapped) {
        syncSetIdentityIntegrity('Bad');
        addMessage(`Identity Integrity Check Failed. SIM: ${isSimSwapped}, Device: ${isDeviceSwapped}`);
      } else {
        const checkTime = artificialTime ? new Date(artificialTime.getTime()) : new Date();
        syncSetLastIntegrityCheckTime(checkTime);
        syncSetIdentityIntegrity('Good');
        addMessage(`Identity Integrity Verified`);
      }
      return true;
    } catch (err) {
      console.error('Identity integrity check failed:', err);
      syncSetIdentityIntegrity('Bad');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const renderMatchStatus = (status, fieldName) => {
    if (status === null || status === undefined || status === 'true') {
      return null;
    }

    let text = '';
    if (status === 'false') {
      text = 'Not Match';
    } else if (status === 'not_available') {
      text = 'Not Available';
    }

    return (
      <div className="status-text-error">{text}</div>
    );
  };

  const handleCompleteCheckIn = async () => {
    const phone = getVerifiedNumber();
    if (!phone || !hospitalLocation) {
      alert('Missing phone number or hospital location.');
      return;
    }
    const subId = await api.completeCheckIn(phone, hospitalLocation, addMessage, syncSetPatientStatus, logApiInteraction);
    if (subId) syncSetGeofencingSubscriptionId(subId);
  };

  const handlePatientSequence = async (mode) => {
    const phone = getVerifiedNumber();
    if (!phone) {
      alert('Please verify your phone number first.');
      return;
    }

    if (mode === 'departure' && patientStatus !== 'Checked In') {
      addMessage("Patient is not Checked In.");
      return;
    }

    if (mode === 'arrival') {
      const patientId = Math.floor(100000000 + Math.random() * 900000000).toString();
      const alertMessage = `INCOMING PATIENT - High-level symptoms: Chest pains and intermittent consciousness`;
      syncSetPatientMedicalDetails({ patientId, alert: alertMessage, esi: '', vitals: '', complaint: '', eta: '', medicalHistory: '', treatmentNeeds: { specialists: [], equipment: [] } });
      addMessage(`Alert! Incoming patient (ID: ${patientId}). High-level symptoms: Chest pains and intermittent consciousness.`);
      addMessage("Fetching patient details with KYC Fill...");
      const kycData = await api.kycFill(phone);
      logApiInteraction('KYC Fill', 'POST', '/kyc-fill-in/kyc-fill-in/v0.4/fill-in', { phoneNumber: phone }, kycData._obscured);
      syncSetFormState(kycData);
      addMessage("Patient details populated.");
    }

    setIsSequenceRunning(true);
    try {
      const startTime = getInitialArtificialTime(mode);
      
      // Update integrity timestamp BEFORE artificial time to prevent race condition timeout
      if (identityIntegrity === 'Good') {
        syncSetLastIntegrityCheckTime(startTime);
      }
      syncSetArtificialTime(startTime);
      setSimulationMode(mode);
      if (mode === 'arrival') {
        // Mock additional patients in the system
        syncSetAdditionalPatients([
          { id: '847293561', name: 'Sarah Mitchell', symptoms: 'Moderate abdominal pain, nausea' },
          { id: '923847102', name: 'James Rodriguez', symptoms: 'Minor laceration, stable' },
          { id: '756482039', name: 'Emily Chen', symptoms: 'Fever, respiratory symptoms' },
          { id: '681923745', name: 'Robert Thompson', symptoms: 'Ankle sprain, awaiting X-ray' }
        ]);

        setIsLoading(true);
        // Fetch actual hotel location
        const hospitalLocationData = await api.locationRetrieval(phone);
        logApiInteraction('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', { device: { phoneNumber: phone } }, hospitalLocationData);

        const actualHotelCoords = {
          lat: hospitalLocationData.area.center.latitude,
          lng: hospitalLocationData.area.center.longitude
        };
        syncSetHospitalLocation(actualHotelCoords);

        // Set initial user location slightly away from the hotel
        const userStartLat = actualHotelCoords.lat + 0.05; // 0.05 degrees ~ 5.5 km
        const userStartLng = actualHotelCoords.lng + 0.05;
        const initialUserCoords = { lat: userStartLat, lng: userStartLng };

        syncSetInitialUserLocation(initialUserCoords);
        syncSetUserGps(initialUserCoords);
        setIsLoading(false);

        const subId = await api.startMedicalTransportSequence(
          phone,
          initialUserCoords, // Use the newly set initialUserCoords
          actualHotelCoords, // Use the newly fetched actualHotelCoords
          addMessage,
          syncSetLocation,
          syncSetUserGps,
          syncSetPatientStatus,
          syncSetPatientMedicalDetails,
          generateRoute,
          syncSetArtificialTime,
          logApiInteraction
        );
        if (subId) syncSetGeofencingSubscriptionId(subId);
      } else if (mode === 'departure') {
        const guestName = formState.name ? `${formState.name}` : 'Patient';
        await api.startPatientAbscondmentSequence(
          phone,
          initialUserLocation,
          hospitalLocation,
          addMessage,
          syncSetLocation,
          syncSetUserGps,
          syncSetPatientStatus,
          syncSetPatientMedicalDetails,
          generateRoute,
          syncSetArtificialTime,
          guestName,
          logApiInteraction,
          syncSetPaymentStatus,
          geofencingSubscriptionId
        );

        setTimeout(() => {
          addMessage("Resetting application state to defaults...");
          syncSetRegistrationStatus('Not Registered');
          syncSetIdentityIntegrity('Bad');
          syncSetPatientStatus('Not Checked In');
          syncSetPaymentStatus('Not Paid');
          syncSetGeofencingSubscriptionId(null);
          syncSetOutpatientStatus('Inactive');
          syncSetHospitalLocation(null);
          syncSetUserGps(null);
          syncSetInitialUserLocation(null);
          syncSetLastIntegrityCheckTime(null);
          syncSetPatientMedicalDetails({
            patientId: '',
            esi: '',
            vitals: '',
            complaint: '',
            eta: '',
            medicalHistory: '',
            treatmentNeeds: { specialists: [], equipment: [] },
          });
          syncSetAdditionalPatients([]);
          syncSetKycMatchResponse(null);
          syncSetFormState(formFields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {}));
          syncSetArtificialTime(null);
          setPhone('');
          setSuccess('');
          setSimulationMode('arrival');
        }, 15000);
      }
    } catch (error) { // eslint-disable-line no-empty
      console.error('Sequence failed:', error);
      addMessage(`Error during sequence: ${error.message}`);
    } finally {
      // You might want to set this to false when the sequence is fully complete
    }
  };

  const handleOutpatientSequence = async () => {
    const phone = getVerifiedNumber();
    if (!phone) {
      alert('Please verify your phone number first.');
      return;
    }
    
    // Clear the flag first to prevent auto-resume on refresh
    localStorage.removeItem('shouldResumeMonitoring');
    
    // Save current screen and flag to resume monitoring after OAuth
    localStorage.setItem('activeScreen', activeScreen.toString());
    localStorage.setItem('shouldResumeMonitoring', 'true');
    
    syncSetArtificialTime(new Date());
    setIsSequenceRunning(true);
    syncSetOutpatientStatus("Initializing...");
    
    try {
        let startLoc = initialUserLocation;
        if (!startLoc) {
             addMessage("Fetching current location for monitoring baseline...");
             const locData = await api.locationRetrieval(phone);
             logApiInteraction('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', { device: { phoneNumber: phone } }, locData);
             startLoc = { lat: locData.area.center.latitude, lng: locData.area.center.longitude };
             syncSetInitialUserLocation(startLoc);
             syncSetUserGps(startLoc);
        }

        await api.startOutpatientMonitoringSequence(phone, startLoc, addMessage, syncSetLocation, syncSetUserGps, syncSetOutpatientStatus, syncSetArtificialTime, logApiInteraction);
        
        // Clear the flag after monitoring starts successfully
        localStorage.removeItem('shouldResumeMonitoring');
    } catch (e) {
        console.error(e);
        addMessage("Error in monitoring sequence: " + e.message);
        // Clear flag on error too
        localStorage.removeItem('shouldResumeMonitoring');
    }
  };

  return (
    <div className="App">
      {isLoading &&
        <div className="loader-overlay">
          <div className="d-flex justify-content-center align-items-center h-100">
            <div className="spinner-border text-light" style={{ width: '3rem', height: '3rem' }} role="status">
              <span className="sr-only">Loading...</span>
            </div>
          </div>
        </div>
      }
      <header className="header">
        <h1><a href="/" className="header-link">Healthcare Use Case Demo</a></h1>
      </header>

      <nav className="screen-nav" style={{ background: '#f0f0f0', padding: '10px', textAlign: 'center', marginBottom: '20px' }}>
        <button className={`btn ${activeScreen === 1 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px' }} onClick={() => setActiveScreen(1)}>1. API Interactions</button>
        <button className={`btn ${activeScreen === 2 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px' }} onClick={() => setActiveScreen(2)}>2. Hospital Dashboard</button>
        <button className={`btn ${activeScreen === 3 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px' }} onClick={() => setActiveScreen(3)}>3. All Details</button>
      </nav>

      <main className="main-content">
        <div className="dashboard-container">
          {/* Main two-column layout */}
          <div className="dashboard-main" style={{ display: activeScreen === 3 ? 'flex' : 'block', gap: '20px' }}>
            
            {/* SCREEN 1: API Interactions */}
            {activeScreen === 1 && (
            <div className="dashboard-column" style={{ width: '100%', maxWidth: '100%' }}>
              <ApiLogsView apiLogs={apiLogs} onClear={() => setApiLogs([])} />
            </div>
            )}

            {/* SCREEN 2: Patient Dashboard (Aggregated View) */}
            {activeScreen === 2 && (
            <div className="dashboard-column" style={{ width: '100%', maxWidth: '100%' }}>
              {/* Controls (Automated Sequences) */}
              <div id="apiActions" className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h2 className="mb-0">Controls & Sequences</h2>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setMessages([])}>Clear Logs</button>
                </div>
                <div className="p-3">
                  <div className="api-buttons">
                    <button className="btn btn-primary" onClick={handleRegistrationSequence}>Start Registration</button>
                    {patientStatus !== 'Checked In' && patientStatus !== 'Awaiting Check-in' && (
                      <button className="btn btn-primary" onClick={() => handlePatientSequence('arrival')}>Admit Patient & Monitor Transport</button>
                    )}
                    {patientStatus === 'Awaiting Check-in' && (
                      <button className="btn btn-success" onClick={handleCompleteCheckIn}>Complete Check-in</button>
                    )}
                    {patientStatus === 'Checked In' && <>
                      <button className="btn btn-primary" onClick={() => handlePatientSequence('departure')}>Patient Abscondment</button>
                    </>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
              {/* Phone Verification */}
              <div id="verification-container" className="card">
                <h2 className="card-header">1. Phone Verification</h2>
                <div className="p-3">
                  <form onSubmit={validatePhone}>
                    <div className="verify-form-container">
                      <div className="form-group">
                        <input type="text" id="phone" className="form-control" placeholder="e.g., +61412345678" value={phone} onChange={handlePhoneChange} />
                      </div>
                      <button type="submit" id="verifyBtn" className="btn btn-primary">Verify</button>
                    </div>
                    {error && <div id="error" className="alert alert-danger">{error}</div>}
                    {success && <div id="success" className="alert alert-success">{success}</div>}
                    {!verifiedPhoneNumber && !error && <div className="alert alert-info">Please authenticate and verify the phone number.</div>}
                  </form>
                </div>
              </div>

              {/* User Status */}
              <div id="userStatus" className="card">
                <h2 className="card-header">2. Patient Status</h2>
                <ul className="details-list">
                  <li><strong>Identity Integrity:</strong> <span id="identity-status" style={{ color: identityIntegrity === 'Good' ? 'green' : (identityIntegrity === 'Bad' ? 'red' : 'black') }}>{identityIntegrity}</span>
                    <button className="btn btn-primary" onClick={() => checkIdentityIntegrity(true)}>Check</button>
                  </li>
                  <li><strong>Registration Status:</strong> <span style={{ color: registrationStatus === 'Registered' ? 'green' : 'red' }}>{registrationStatus}</span>
                  </li>
                  {/* <li><strong>Payment Status:</strong> <span style={{ color: paymentStatus === 'Paid' ? 'green' : 'red' }}>{paymentStatus}</span></li> */}
                  <li><strong>Patient Status:</strong> <span style={{ color: patientStatus === 'Checked In' ? 'green' : 'red' }}>{patientStatus}</span></li>
                </ul>
              </div>

              {/* User Profile Section (Full-width) */}
              <div id="userDetails" className="card" ref={userProfileRef}>
                <h2 className="card-header">3. Patient Personal Details</h2>
                <form id="user-form" className="user-profile-form p-3">
                  <div className="row" style={{ margin: "0px" }}>
                    {formFields.map(field => (
                      <div className="col-md-6" key={field.name}>
                        <div className="form-group">
                          <label htmlFor={field.name}>{field.label}</label>
                          <div className="input-with-status">
                            {field.type === 'select' ? (
                              <select id={field.name} name={field.name} className={`form-control ${kycMatchResponse && (kycMatchResponse[`${field.name}Match`] === 'false' || kycMatchResponse[`${field.name}Match`] === 'not_available') ? 'input-match-error' : kycMatchResponse && kycMatchResponse[`${field.name}Match`] === 'true' ? 'input-match-success' : ''}`} value={formState[field.name]} onChange={handleInputChange}>
                                {field.options.map(option => (
                                  <option key={option} value={option} >{option}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={field.type}
                                id={field.name}
                                name={field.name}
                                className={`form-control ${kycMatchResponse && (kycMatchResponse[`${field.name}Match`] === 'false' || kycMatchResponse[`${field.name}Match`] === 'not_available') ? 'input-match-error' : kycMatchResponse && kycMatchResponse[`${field.name}Match`] === 'true' ? 'input-match-success' : ''}`}
                                value={formState[field.name]}
                                onChange={handleInputChange}
                              />
                            )}
                            {kycMatchResponse && renderMatchStatus(kycMatchResponse[`${field.name}Match`], field.name)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="btn-container">
                    <button type="button" id="submitKycBtn" className="btn btn-primary" onClick={submitKyc}>KYC Match</button>
                  </div>
                </form>
              </div>
                </div>

                <div style={{ flex: 1, minWidth: '300px' }}>
                  {/* Medical Details */}
                  <div id="medicalDetails" className="card">
                    <h2 className="card-header">4. Patient Medical Details</h2>
                    <ul className="details-list">
                      {patientMedicalDetails.alert && <li style={{ background: '#fff3cd', padding: '4px 6px', marginBottom: '4px', borderRadius: '2px', fontSize: '0.8em', color: '#856404' }}>{patientMedicalDetails.alert}</li>}
                      <li><strong>Patient ID:</strong> <span>{patientMedicalDetails.patientId}</span></li>
                      <li><strong>Emergency Severity Index:</strong> <span>{patientMedicalDetails.esi}</span></li>
                      <li><strong>Vital signs:</strong> <span>{patientMedicalDetails.vitals}</span></li>
                      <li><strong>Chief Complaint:</strong> <span>{patientMedicalDetails.complaint}</span></li>
                      <li><strong>Estimated time of arrival (duration until arrival):</strong> <span>{patientMedicalDetails.eta}</span></li>
                      {patientMedicalDetails.medicalHistory && <li><strong>Medical History:</strong> <span>{patientMedicalDetails.medicalHistory}</span></li>}
                      {patientMedicalDetails.treatmentNeeds.specialists.length > 0 && <li><strong>Specialists Required:</strong> <span>{patientMedicalDetails.treatmentNeeds.specialists.join(', ')}</span></li>}
                      {patientMedicalDetails.treatmentNeeds.equipment.length > 0 && <li><strong>Equipment Needed:</strong> <span>{patientMedicalDetails.treatmentNeeds.equipment.join(', ')}</span></li>}
                    </ul>
                  </div>

                  {/* Additional Patients */}
                  {additionalPatients.length > 0 && (
                  <div id="additionalPatients" className="card">
                    <h2 className="card-header">Additional Patients</h2>
                    <div className="p-3">
                      {additionalPatients.map((patient, idx) => (
                        <div key={idx} style={{ padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px', background: '#f9f9f9' }}>
                          <div><strong>{patient.name}</strong> (ID: {patient.id})</div>
                          <div style={{ fontSize: '0.9em', color: '#666' }}>{patient.symptoms}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}

                  {/* Outpatient Monitoring */}
                  <div id="outpatientMonitoring" className="card">
                    <h2 className="card-header">5. Outpatient Monitoring</h2>
                    <ul className="details-list">
                      <li><strong>Status:</strong> <span style={{ color: outpatientStatus.includes('Anomaly') ? 'red' : (outpatientStatus === 'Inactive' ? 'black' : 'green') }}>{outpatientStatus}</span></li>
                    </ul>
                    <div className="p-3">
                        <button className="btn btn-primary" onClick={handleOutpatientSequence}>Start Monitoring</button>
                    </div>
                  </div>

                  {/* Location Tracker */}
                  <div id="locationTracker" className="card">
                    <h2 className="card-header">6. Location Tracker</h2>
                    <LocationMap userGps={userGps} hospitalLocation={hospitalLocation} verifiedPhoneNumber={verifiedPhoneNumber} simulationMode={simulationMode} />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* SCREEN 3: All Details */}
            {activeScreen === 3 && (
            <>
              <div className="dashboard-column" style={{ flex: 1, minWidth: 0 }}>
                {/* Phone Verification */}
                <div id="verification-container" className="card">
                  <h2 className="card-header">1. Phone Verification</h2>
                  <div className="p-3">
                    
                    <form onSubmit={validatePhone}>
                      <div className="verify-form-container">
                        <div className="form-group">
                          <input type="text" id="phone" className="form-control" placeholder="e.g., +61412345678" value={phone} onChange={handlePhoneChange} />
                        </div>
                        <button type="submit" id="verifyBtn" className="btn btn-primary">Verify</button>
                      </div>
                      {error && <div id="error" className="alert alert-danger">{error}</div>}
                      {success && <div id="success" className="alert alert-success">{success}</div>}
                      {!verifiedPhoneNumber && !error && <div className="alert alert-info">Please authenticate and verify the phone number.</div>}
                    </form>
                  </div>
                </div>

                {/* User Status */}
                <div id="userStatus" className="card">
                  <h2 className="card-header">2. Patient Status</h2>
                  <ul className="details-list">
                    <li><strong>Identity Integrity:</strong> <span id="identity-status" style={{ color: identityIntegrity === 'Good' ? 'green' : (identityIntegrity === 'Bad' ? 'red' : 'black') }}>{identityIntegrity}</span>
                      <button className="btn btn-primary" onClick={() => checkIdentityIntegrity(true)}>Check</button>
                    </li>
                    <li><strong>Registration Status:</strong> <span style={{ color: registrationStatus === 'Registered' ? 'green' : 'red' }}>{registrationStatus}</span>
                    </li>
                    {/* <li><strong>Payment Status:</strong> <span style={{ color: paymentStatus === 'Paid' ? 'green' : 'red' }}>{paymentStatus}</span></li> */}
                    <li><strong>Patient Status:</strong> <span style={{ color: patientStatus === 'Checked In' ? 'green' : 'red' }}>{patientStatus}</span></li>
                  </ul>
                </div>

                {/* User Profile Section (Full-width) */}
                <div id="userDetails" className="card" ref={userProfileRef}>
                  <h2 className="card-header">3. Patient Personal Details</h2>
                  <form id="user-form" className="user-profile-form p-3">
                    <div className="row" style={{ margin: "0px" }}>
                      {formFields.map(field => (
                        <div className="col-md-6" key={field.name}>
                          <div className="form-group">
                            <label htmlFor={field.name}>{field.label}</label>
                            <div className="input-with-status">
                              {field.type === 'select' ? (
                                <select id={field.name} name={field.name} className={`form-control ${kycMatchResponse && (kycMatchResponse[`${field.name}Match`] === 'false' || kycMatchResponse[`${field.name}Match`] === 'not_available') ? 'input-match-error' : kycMatchResponse && kycMatchResponse[`${field.name}Match`] === 'true' ? 'input-match-success' : ''}`} value={formState[field.name]} onChange={handleInputChange}>
                                  {field.options.map(option => (
                                    <option key={option} value={option} >{option}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type={field.type}
                                  id={field.name}
                                  name={field.name}
                                  className={`form-control ${kycMatchResponse && (kycMatchResponse[`${field.name}Match`] === 'false' || kycMatchResponse[`${field.name}Match`] === 'not_available') ? 'input-match-error' : kycMatchResponse && kycMatchResponse[`${field.name}Match`] === 'true' ? 'input-match-success' : ''}`}
                                  value={formState[field.name]}
                                  onChange={handleInputChange}
                                />
                              )}
                              {kycMatchResponse && renderMatchStatus(kycMatchResponse[`${field.name}Match`], field.name)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="btn-container">
                      <button type="button" id="submitKycBtn" className="btn btn-primary" onClick={submitKyc}>KYC Match</button>
                    </div>
                  </form>
                </div>

                {/* Medical Details */}
                <div id="medicalDetails" className="card">
                  <h2 className="card-header">4. Patient Medical Details</h2>
                  <ul className="details-list">
                    {patientMedicalDetails.alert && <li style={{ background: '#fff3cd', padding: '4px 6px', marginBottom: '4px', borderRadius: '2px', fontSize: '0.8em', color: '#856404' }}>{patientMedicalDetails.alert}</li>}
                    <li><strong>Patient ID:</strong> <span>{patientMedicalDetails.patientId}</span></li>
                    <li><strong>Emergency Severity Index:</strong> <span>{patientMedicalDetails.esi}</span></li>
                    <li><strong>Vital signs:</strong> <span>{patientMedicalDetails.vitals}</span></li>
                    <li><strong>Chief Complaint:</strong> <span>{patientMedicalDetails.complaint}</span></li>
                    <li><strong>Estimated time of arrival (duration until arrival):</strong> <span>{patientMedicalDetails.eta}</span></li>
                    {patientMedicalDetails.medicalHistory && <li><strong>Medical History:</strong> <span>{patientMedicalDetails.medicalHistory}</span></li>}
                    {patientMedicalDetails.treatmentNeeds.specialists.length > 0 && <li><strong>Specialists Required:</strong> <span>{patientMedicalDetails.treatmentNeeds.specialists.join(', ')}</span></li>}
                    {patientMedicalDetails.treatmentNeeds.equipment.length > 0 && <li><strong>Equipment Needed:</strong> <span>{patientMedicalDetails.treatmentNeeds.equipment.join(', ')}</span></li>}
                  </ul>
                </div>

                {/* Additional Patients */}
                {additionalPatients.length > 0 && (
                <div id="additionalPatients" className="card">
                  <h2 className="card-header">Additional Patients</h2>
                  <div className="p-3">
                    {additionalPatients.map((patient, idx) => (
                      <div key={idx} style={{ padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px', background: '#f9f9f9' }}>
                        <div><strong>{patient.name}</strong> (ID: {patient.id})</div>
                        <div style={{ fontSize: '0.9em', color: '#666' }}>{patient.symptoms}</div>
                      </div>
                    ))}
                  </div>
                </div>
                )}
              </div>

              <div className="dashboard-column" style={{ flex: 1, minWidth: 0 }}>
                {/* API Actions */}
                <div id="apiActions" className="card">
                  <h2 className="card-header">5. Automated Sequences</h2>
                  <div className="p-3">
                    <div className="api-buttons">
                      <button className="btn btn-primary" onClick={handleRegistrationSequence}>Start Registration</button>
                      {patientStatus !== 'Checked In' && patientStatus !== 'Awaiting Check-in' && (
                        <button className="btn btn-primary" onClick={() => handlePatientSequence('arrival')}>Admit Patient & Monitor Transport</button>
                      )}
                      {patientStatus === 'Awaiting Check-in' && (
                        <button className="btn btn-success" onClick={handleCompleteCheckIn}>Complete Check-in</button>
                      )}
                      {patientStatus === 'Checked In' && <>
                        <button className="btn btn-primary" onClick={() => handlePatientSequence('departure')}>Patient Abscondment</button>
                      </>}
                    </div>
                    <div id="response-container" className="log-container" style={{ height: '200px', overflowY: 'auto', background: 'black', border: '1px solid #dee2e6', padding: '10px', marginTop: '10px' }}>
                      <pre id="api-response" style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'white' }}>{messages.join('\n')}</pre>
                    </div>
                  </div>
                </div>

                {/* API Logs in Tab 3 */}
                <ApiLogsView apiLogs={apiLogs} onClear={() => setApiLogs([])} maxHeight="400px" />

                {/* Outpatient Monitoring */}
                <div id="outpatientMonitoring" className="card">
                  <h2 className="card-header">6. Outpatient Monitoring</h2>
                  <ul className="details-list">
                    <li><strong>Status:</strong> <span style={{ color: outpatientStatus.includes('Anomaly') ? 'red' : (outpatientStatus === 'Inactive' ? 'black' : 'green') }}>{outpatientStatus}</span></li>
                  </ul>
                  <div className="p-3">
                      <button className="btn btn-primary" onClick={handleOutpatientSequence}>Start Monitoring</button>
                  </div>
                </div>

                {/* Location Tracker */}
                <div id="locationTracker" className="card">
                  <h2 className="card-header">7. Location Tracker</h2>
                  <LocationMap userGps={userGps} hospitalLocation={hospitalLocation} verifiedPhoneNumber={verifiedPhoneNumber} simulationMode={simulationMode} />
                </div>
              </div>
            </>
            )}
          </div>


        </div>
      </main>

      <footer className="footer">
        &copy; 2026 MWC Event
      </footer>
    </div>
  );
}
export default App;

