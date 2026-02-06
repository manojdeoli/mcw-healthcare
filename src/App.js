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
import emergencyRoomBg from './emergency2.png';
import ERDashboard from './components/ERDashboard';


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
  const [liveUserGps, setLiveUserGps] = useState(userGps);

  // Listen to location updates from broadcasts
  useEffect(() => {
    const channel = new BroadcastChannel('healthcare_demo_sync_v2');
    channel.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'SET_USER_GPS') {
        console.log('Admin Console Map received SET_USER_GPS:', data);
        setLiveUserGps(data);
      }
    };
    return () => channel.close();
  }, []);

  // Update liveUserGps when prop changes
  useEffect(() => {
    setLiveUserGps(userGps);
  }, [userGps]);

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
    console.log('[LocationMap useEffect] Starting - hospitalLocation:', hospitalLocation, 'liveUserGps:', liveUserGps);
    const mapInstance = mapInstanceRef.current;
    
    // Capture values immediately to prevent race conditions
    const currentHospitalLocation = hospitalLocation;
    const currentLiveUserGps = liveUserGps;
    
    console.log('[LocationMap useEffect] Captured - currentHospitalLocation:', currentHospitalLocation, 'currentLiveUserGps:', currentLiveUserGps);
    
    if (!isMapReady || !mapInstance) {
      console.log('[LocationMap useEffect] Early return - map not ready');
      return;
    }
    
    if (!currentHospitalLocation || !currentHospitalLocation.lat || !currentHospitalLocation.lng) {
      console.log('[LocationMap useEffect] Early return - no valid hospitalLocation');
      return;
    }
    
    mapInstance.invalidateSize();
    mapInstance.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polyline || !layer._url) {
        mapInstance.removeLayer(layer);
      }
    });

    if (verifiedPhoneNumber && !mapUpdateThrottle.current) {
        mapUpdateThrottle.current = setTimeout(() => {
          mapUpdateThrottle.current = null;
        }, 1000);

        // Capture current values to avoid race condition
        const currentHospitalLocation = hospitalLocation;
        const currentLiveUserGps = liveUserGps;
        
        const updateMapView = () => {
          console.log('[updateMapView] Called with currentHospitalLocation:', currentHospitalLocation);
          if (!currentHospitalLocation || !currentHospitalLocation.lat || !currentHospitalLocation.lng) {
            console.log('[updateMapView] Early return - currentHospitalLocation is null or missing lat/lng');
            return;
          }
          const distance = getDistance(currentLiveUserGps, currentHospitalLocation);
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

          const midLat = (currentLiveUserGps.lat + currentHospitalLocation.lat) / 2;
          const midLng = (currentLiveUserGps.lng + currentHospitalLocation.lng) / 2;

          mapInstance.setView([midLat, midLng], newZoom, { animate: true, pan: { duration: 2.5 } });
        }
        if (verifiedPhoneNumber) {
          updateMapView();
        }
      }

      if (currentHospitalLocation && currentHospitalLocation.lat && currentHospitalLocation.lng) {
        const hospitalIcon = L.divIcon({
          html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000" width="32px" height="32px"><path d="M18 13h-5v5h-2v-5H6v-2h5V6h2v5h5v2z"/><path d="M0 0h24v24H0z" fill="none"/></svg>`,
          className: 'hospital-location-icon',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });
        L.marker([currentHospitalLocation.lat, currentHospitalLocation.lng], { icon: hospitalIcon }).addTo(mapInstance).bindPopup('Wellsoon Hospital');

        L.circle([currentHospitalLocation.lat, currentHospitalLocation.lng], {
          color: 'red',
          fillColor: '#ff0000',
          fillOpacity: 0.2,
          radius: 100
        }).addTo(mapInstance).bindPopup('Hospital Check-in Area');
      }

      if (currentLiveUserGps && verifiedPhoneNumber) {
        console.log('Admin Console Map rendering ambulance at:', currentLiveUserGps);
        const iconUrl = simulationMode === 'departure' ? patientIconPng : ambulanceIconPng;
        const userIcon = L.icon({
          iconUrl: iconUrl,
          iconSize: [32, 32],
          iconAnchor: [20, 40],
          popupAnchor: [0, -32]
        });

        L.marker([currentLiveUserGps.lat, currentLiveUserGps.lng], { icon: userIcon }).addTo(mapInstance).bindPopup('User Location');
      } else {
        console.log('[LocationMap] No user GPS to render');
      }
  }, [liveUserGps, verifiedPhoneNumber, hospitalLocation, isMapReady, simulationMode]);

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
        case 'SET_SIMULATION_MODE':
          setSimulationMode(data);
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
        case 'COMPLETE_CHECKIN':
          const phone = verifiedPhoneNumber || localStorage.getItem('verifiedPhoneNumber');
          if (phone && hospitalLocation) {
            api.completeCheckIn(phone, hospitalLocation, addMessage, syncSetPatientStatus, logApiInteraction, broadcast).then(subId => {
              if (subId) syncSetGeofencingSubscriptionId(subId);
            });
          }
          break;
        case 'ER_COMPLETE_CHECKIN':
          // Handle check-in request from ER Dashboard
          if (data.phoneNumber && hospitalLocation) {
            api.completeCheckIn(data.phoneNumber, hospitalLocation, addMessage, syncSetPatientStatus, logApiInteraction, broadcast).then(subId => {
              if (subId) syncSetGeofencingSubscriptionId(subId);
            });
          }
          break;
        default: break;
      }
    };
    return () => channelRef.current?.close();
  }, [verifiedPhoneNumber, hospitalLocation]);

  const broadcast = (type, data) => {
    channelRef.current?.postMessage({ type, data });
  };

  // Sync Wrappers
  const syncSetUserGps = (val) => { setUserGps(val); broadcast('SET_USER_GPS', val); };
  const syncSetSimulationMode = (val) => { setSimulationMode(val); broadcast('SET_SIMULATION_MODE', val); };
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
  const [additionalPatients, setAdditionalPatients] = useState([
    { id: '847293561', name: 'Sarah Mitchell', symptoms: 'Moderate abdominal pain, nausea' },
    { id: '923847102', name: 'James Rodriguez', symptoms: 'Minor laceration, stable' },
    { id: '756482039', name: 'Emily Chen', symptoms: 'Fever, respiratory symptoms' },
    { id: '681923745', name: 'Robert Thompson', symptoms: 'Ankle sprain, awaiting X-ray' }
  ]);
  const [kioskWindow, setKioskWindow] = useState(null);

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
        setVerifiedPhoneNumber(null);
        localStorage.removeItem('verifiedPhoneNumber');
        broadcast('SET_VERIFIED_PHONE', null);
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
    const subId = await api.completeCheckIn(phone, hospitalLocation, addMessage, syncSetPatientStatus, logApiInteraction, broadcast);
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

    let patientKycData = null;
    if (mode === 'arrival') {
      const patientId = Math.floor(100000000 + Math.random() * 900000000).toString();
      const alertMessage = `INCOMING PATIENT - High-level symptoms: Chest pains and intermittent consciousness`;
      syncSetPatientMedicalDetails({ patientId, alert: alertMessage, esi: '', vitals: '', complaint: '', eta: '', medicalHistory: '', treatmentNeeds: { specialists: [], equipment: [] } });
      addMessage(`Alert! Incoming patient (ID: ${patientId}). High-level symptoms: Chest pains and intermittent consciousness.`);
      addMessage("Fetching patient details with KYC Fill...");
      patientKycData = await api.kycFill(phone);
      logApiInteraction('KYC Fill', 'POST', '/kyc-fill-in/kyc-fill-in/v0.4/fill-in', { phoneNumber: phone }, patientKycData._obscured);
      syncSetFormState(patientKycData);
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
      syncSetSimulationMode(mode);
      if (mode === 'arrival') {
        setIsLoading(true);
        // Fetch actual hotel location
        const hospitalLocationData = await api.locationRetrieval(phone);
        logApiInteraction('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', { device: { phoneNumber: phone } }, hospitalLocationData);

        const actualHotelCoords = {
          lat: hospitalLocationData.area.center.latitude,
          lng: hospitalLocationData.area.center.longitude
        };
        syncSetHospitalLocation(actualHotelCoords);
        
        // Broadcast hospital location to ER Dashboard
        broadcast('SET_HOSPITAL_LOCATION', actualHotelCoords);

        // Set initial user location for good demo visibility (3-4 km away from Budapest hospital)
        const userStartLat = actualHotelCoords.lat + 0.03; // 0.03 degrees ~ 3.3 km
        const userStartLng = actualHotelCoords.lng + 0.03;
        const initialUserCoords = { lat: userStartLat, lng: userStartLng };

        syncSetInitialUserLocation(initialUserCoords);
        syncSetUserGps(initialUserCoords);
        setIsLoading(false);

        // Calculate distance
        const distance = getDistance(initialUserCoords, actualHotelCoords);
        const distanceKm = (distance / 1000).toFixed(1);
        
        // Determine ESI level based on symptoms
        const esi = 1; // Critical for chest pains and consciousness issues
        const status = esi === 1 ? 'CRITICAL' : esi === 2 ? 'URGENT' : 'MODERATE';
        
        // Get patient data from KYC or formState
        const patientInfo = patientKycData || formState;
        const age = patientInfo.birthdate ? new Date().getFullYear() - new Date(patientInfo.birthdate).getFullYear() : 'Unknown';
        
        // Broadcast complete patient data to ER Dashboard (without ETA initially)
        const patientData = {
          id: Date.now(),
          phoneNumber: phone,
          name: patientInfo.name || 'Unknown Patient',
          age: age,
          esi: esi,
          status: status,
          eta: 'Calculating...',
          distance: `${distanceKm} km`,
          location: initialUserCoords,
          vitals: '♥ HR: Pending | 🩸 BP: Pending | 🫁 O₂: Pending | 🌡 T: Pending',
          complaint: patientMedicalDetails.alert || 'Chest pains and intermittent consciousness',
          chiefComplaint: patientMedicalDetails.alert || 'Chest pains and intermittent consciousness',
          transport: 'Ambulance #A-' + Math.floor(100 + Math.random() * 900),
          medicalHistory: '',
          specialistsNeeded: [],
          equipmentNeeded: []
        };
        broadcast('PATIENT_ADMITTED', patientData);
        console.log('Admin Console broadcasting PATIENT_ADMITTED:', patientData);
        addMessage(`Patient data broadcast to ER Dashboard - Distance: ${distanceKm} km, ETA will be calculated...`);

        const subId = await api.startMedicalTransportSequence(
          phone,
          initialUserCoords,
          actualHotelCoords,
          addMessage,
          syncSetLocation,
          syncSetUserGps,
          syncSetPatientStatus,
          syncSetPatientMedicalDetails,
          generateRoute,
          syncSetArtificialTime,
          logApiInteraction,
          broadcast,
          patientData
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
          geofencingSubscriptionId,
          broadcast
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
          syncSetSimulationMode('arrival');
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

  const openKioskDisplay = () => {
    const newWindow = window.open('', 'ERKiosk', 'width=1800,height=1000');
    if (!newWindow) {
      alert('Please allow popups for this site');
      return;
    }
    setKioskWindow(newWindow);
  };

  const openERDashboard = () => {
    window.open(window.location.origin + '/#/er-dashboard', '_blank');
  };



  useEffect(() => {
    if (!kioskWindow || kioskWindow.closed) return;

    const doc = kioskWindow.document;
    
    // Send icon URLs to kiosk
    broadcast('SET_ICON_URLS', {
      ambulance: ambulanceIconPng,
      patient: patientIconPng
    });
    
    // Only write the HTML structure once
    if (!doc.getElementById('kiosk-content')) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Emergency Room Kiosk</title>
          <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <style>
            body {
              margin: 0;
              padding: 0;
              background: url('${emergencyRoomBg}') no-repeat center center fixed;
              background-size: cover;
              font-family: Arial, sans-serif;
              overflow: hidden;
              font-weight: 700;
              color: #1a1a1a;
              font-size: 0.75em;
            }
            .kiosk-container {
              position: absolute;
              top: 0;
              left: 3%;
              width: 60%;
              height: 100%;
              overflow-y: auto;
              padding: 20px;
              text-align: left;
            }
            .card { margin-bottom: 5px; border: 1px solid #ddd; border-radius: 3px; }
            .card-header { background: #007bff; color: white; padding: 3px 6px; font-weight: bold; border-radius: 3px 3px 0 0; font-size: 0.85em; text-shadow: 1px 1px 2px rgba(0,0,0,0.3); }
            .details-list { list-style: none; padding: 5px; margin: 0; font-size: 0.85em; font-weight: 700; color: #1a1a1a; }
            .details-list li { padding: 2px 0; border-bottom: 1px solid #eee; }
            .details-list li:last-child { border-bottom: none; }
            .p-3 { padding: 5px; font-size: 0.85em; font-weight: 700; color: #1a1a1a; }
            .btn { padding: 4px 8px; margin: 2px; border: none; border-radius: 3px; cursor: pointer; font-size: 0.85em; }
            .btn-primary { background: #007bff; color: white; }
            .btn-success { background: #28a745; color: white; }
            .api-buttons { display: flex; flex-wrap: wrap; gap: 10px; }
            .form-control { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ddd; border-radius: 4px; }
            .verify-form-container { display: flex; gap: 10px; align-items: center; }
            .alert { padding: 3px 5px; margin: 3px 0; border-radius: 3px; font-size: 0.75em; }
            .alert-info { background: #d1ecf1; color: #0c5460; }
            .alert-success { background: #d4edda; color: #155724; }
            .alert-danger { background: #f8d7da; color: #721c24; }
            .additional-patients-scroll { max-height: 80px; overflow-y: auto; }
            #kiosk-map { height: 220px; width: 100%; border: 1px solid #ddd; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="kiosk-container" id="kiosk-content"></div>
          <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
          <script>
            const channel = new BroadcastChannel('healthcare_demo_sync_v2');
            let state = { ambulanceIcon: null, patientIcon: null };
            let map = null;
            let markers = [];
            
            channel.onmessage = (event) => {
              const { type, data } = event.data;
              switch (type) {
                case 'SET_VERIFIED_PHONE': state.verifiedPhoneNumber = data; break;
                case 'SET_IDENTITY_INTEGRITY': state.identityIntegrity = data; break;
                case 'SET_REGISTRATION_STATUS': state.registrationStatus = data; break;
                case 'SET_PATIENT_STATUS': state.patientStatus = data; break;
                case 'SET_OUTPATIENT_STATUS': state.outpatientStatus = data; break;
                case 'SET_MEDICAL_DETAILS': state.patientMedicalDetails = data; break;
                case 'SET_ADDITIONAL_PATIENTS': state.additionalPatients = data; break;
                case 'SET_FORM_STATE': state.formState = data; break;
                case 'SET_USER_GPS': state.userGps = data; updateMap(); break;
                case 'SET_HOSPITAL_LOCATION': state.hospitalLocation = data; updateMap(); break;
                case 'SET_SIMULATION_MODE': state.simulationMode = data; updateMap(); break;
                case 'SET_ICON_URLS': state.ambulanceIcon = data.ambulance; state.patientIcon = data.patient; updateMap(); break;
                case 'KIOSK_UPDATE': state = { ...state, ...data }; updateMap(); break;
              }
              render();
            };
            
            function render() {
              const content = document.getElementById('kiosk-content');
              if (!content) return;
              
              const s = state;
              const hasPatientData = s.verifiedPhoneNumber;
              
              if (!hasPatientData) {
                content.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; font-size: 2em; color: #666; text-align: center;"><div><div style="font-size: 3em; margin-bottom: 20px;">🏥</div>Waiting for patient admission...</div></div>';
                return;
              }
              
              const mapExists = document.getElementById('kiosk-map');
              
              if (!mapExists) {
                const html = '<div style="display: flex; gap: 20px; flex-wrap: wrap;">' +
                  '<div style="flex: 1; min-width: 300px;">' +
                    '<div class="card">' +
                      '<h2 class="card-header">1. Patient Status</h2>' +
                      '<ul class="details-list" id="patient-status-list">' +
                        '<li><strong>Identity Integrity:</strong> <span style="color: ' + (s.identityIntegrity === 'Good' ? 'green' : (s.identityIntegrity === 'Bad' ? 'red' : 'black')) + '">' + (s.identityIntegrity || 'Bad') + '</span></li>' +
                        '<li><strong>Registration Status:</strong> <span style="color: ' + (s.registrationStatus === 'Registered' ? 'green' : 'red') + '">' + (s.registrationStatus || 'Not Registered') + '</span></li>' +
                        '<li id="patient-status-line"><strong>Patient Status:</strong> <span style="color: ' + (s.patientStatus === 'Checked In' ? 'green' : 'red') + '">' + (s.patientStatus || 'Not Checked In') + '</span>' + (s.patientStatus === 'Awaiting Check-in' ? ' <button class="btn btn-success" onclick="completeCheckIn()" style="margin-left: 5px;">Complete Check-in</button>' : '') + '</li>' +
                    '</div>' +
                    '<div class="card">' +
                      '<h2 class="card-header">2. Patient Personal Details</h2>' +
                      '<div class="p-3" id="personal-details">' +
                        '<div><strong>Name:</strong> ' + (s.formState?.name || 'N/A') + '</div>' +
                        '<div><strong>Email:</strong> ' + (s.formState?.email || 'N/A') + '</div>' +
                        '<div><strong>Address:</strong> ' + (s.formState?.address || 'N/A') + '</div>' +
                        '<div><strong>Birthdate:</strong> ' + (s.formState?.birthdate || 'N/A') + '</div>' +
                      '</div>' +
                    '</div>' +
                    '<div class="card">' +
                      '<h2 class="card-header">3. Location Tracker</h2>' +
                      '<div class="p-3"><div id="kiosk-map"></div></div>' +
                    '</div>' +
                  '</div>' +
                  '<div style="flex: 1; min-width: 300px;">' +
                    '<div class="card">' +
                      '<h2 class="card-header">4. Patient Medical Details</h2>' +
                      '<ul class="details-list" id="medical-details-list">' +
                        (s.patientMedicalDetails?.alert ? '<li style="background: #dc3545; padding: 4px 6px; margin-bottom: 4px; border-radius: 3px; font-size: 0.75em; color: #ffffff; font-weight: 700; border: 2px solid #c82333;">' + s.patientMedicalDetails.alert + '</li>' : '') +
                        '<li><strong>Patient ID:</strong> ' + (s.patientMedicalDetails?.patientId || 'N/A') + '</li>' +
                        '<li><strong>Emergency Severity Index:</strong> ' + (s.patientMedicalDetails?.esi || 'N/A') + '</li>' +
                        '<li><strong>Vital signs:</strong> ' + (s.patientMedicalDetails?.vitals || 'N/A') + '</li>' +
                        '<li><strong>Chief Complaint:</strong> ' + (s.patientMedicalDetails?.complaint || 'N/A') + '</li>' +
                        '<li><strong>ETA:</strong> ' + (s.patientMedicalDetails?.eta || 'N/A') + '</li>' +
                        (s.patientMedicalDetails?.medicalHistory ? '<li><strong>Medical History:</strong> ' + s.patientMedicalDetails.medicalHistory + '</li>' : '') +
                        (s.patientMedicalDetails?.treatmentNeeds?.specialists?.length > 0 ? '<li><strong>Specialists Required:</strong> ' + s.patientMedicalDetails.treatmentNeeds.specialists.join(', ') + '</li>' : '') +
                        (s.patientMedicalDetails?.treatmentNeeds?.equipment?.length > 0 ? '<li><strong>Equipment Needed:</strong> ' + s.patientMedicalDetails.treatmentNeeds.equipment.join(', ') + '</li>' : '') +
                      '</ul>' +
                    '</div>' +
                    (s.additionalPatients?.length > 0 ? '<div class="card" id="additional-patients-card"><h2 class="card-header">Additional Patients</h2><div class="p-3 additional-patients-scroll" id="additional-patients-list">' + s.additionalPatients.map(p => '<div style="padding: 5px; margin-bottom: 5px; border: 1px solid #ddd; border-radius: 3px; background: #f9f9f9; font-size: 0.75em;"><div><strong>' + p.name + '</strong> (ID: ' + p.id + ')</div><div style="font-size: 0.9em; color: #666;">' + p.symptoms + '</div></div>').join('') + '</div></div>' : '') +
                    '<div class="card">' +
                      '<h2 class="card-header">5. Outpatient Monitoring</h2>' +
                      '<ul class="details-list" id="outpatient-status-list">' +
                        '<li><strong>Status:</strong> <span style="color: ' + (s.outpatientStatus?.includes('Anomaly') ? 'red' : (s.outpatientStatus === 'Inactive' ? 'black' : 'green')) + '">' + (s.outpatientStatus || 'Inactive') + '</span></li>' +
                      '</ul>' +
                    '</div>' +
                  '</div>' +
                '</div>';
                content.innerHTML = html;
                initMap();
              } else {
                // Update only text content
                const patientStatusList = document.getElementById('patient-status-list');
                if (patientStatusList) patientStatusList.innerHTML = '<li><strong>Identity Integrity:</strong> <span style="color: ' + (s.identityIntegrity === 'Good' ? 'green' : (s.identityIntegrity === 'Bad' ? 'red' : 'black')) + '">' + (s.identityIntegrity || 'Bad') + '</span></li>' +
                  '<li><strong>Registration Status:</strong> <span style="color: ' + (s.registrationStatus === 'Registered' ? 'green' : 'red') + '">' + (s.registrationStatus || 'Not Registered') + '</span></li>' +
                  '<li id="patient-status-line"><strong>Patient Status:</strong> <span style="color: ' + (s.patientStatus === 'Checked In' ? 'green' : 'red') + '">' + (s.patientStatus || 'Not Checked In') + '</span>' + (s.patientStatus === 'Awaiting Check-in' ? ' <button class="btn btn-success" onclick="completeCheckIn()" style="margin-left: 5px;">Complete Check-in</button>' : '') + '</li>';
                
                const personalDetails = document.getElementById('personal-details');
                if (personalDetails) personalDetails.innerHTML = '<div><strong>Name:</strong> ' + (s.formState?.name || 'N/A') + '</div>' +
                  '<div><strong>Email:</strong> ' + (s.formState?.email || 'N/A') + '</div>' +
                  '<div><strong>Address:</strong> ' + (s.formState?.address || 'N/A') + '</div>' +
                  '<div><strong>Birthdate:</strong> ' + (s.formState?.birthdate || 'N/A') + '</div>';
                
                const medicalDetailsList = document.getElementById('medical-details-list');
                if (medicalDetailsList) medicalDetailsList.innerHTML = (s.patientMedicalDetails?.alert ? '<li style="background: #dc3545; padding: 4px 6px; margin-bottom: 4px; border-radius: 3px; font-size: 0.75em; color: #ffffff; font-weight: 700; border: 2px solid #c82333;">' + s.patientMedicalDetails.alert + '</li>' : '') +
                  '<li><strong>Patient ID:</strong> ' + (s.patientMedicalDetails?.patientId || 'N/A') + '</li>' +
                  '<li><strong>Emergency Severity Index:</strong> ' + (s.patientMedicalDetails?.esi || 'N/A') + '</li>' +
                  '<li><strong>Vital signs:</strong> ' + (s.patientMedicalDetails?.vitals || 'N/A') + '</li>' +
                  '<li><strong>Chief Complaint:</strong> ' + (s.patientMedicalDetails?.complaint || 'N/A') + '</li>' +
                  '<li><strong>ETA:</strong> ' + (s.patientMedicalDetails?.eta || 'N/A') + '</li>' +
                  (s.patientMedicalDetails?.medicalHistory ? '<li><strong>Medical History:</strong> ' + s.patientMedicalDetails.medicalHistory + '</li>' : '') +
                  (s.patientMedicalDetails?.treatmentNeeds?.specialists?.length > 0 ? '<li><strong>Specialists Required:</strong> ' + s.patientMedicalDetails.treatmentNeeds.specialists.join(', ') + '</li>' : '') +
                  (s.patientMedicalDetails?.treatmentNeeds?.equipment?.length > 0 ? '<li><strong>Equipment Needed:</strong> ' + s.patientMedicalDetails.treatmentNeeds.equipment.join(', ') + '</li>' : '');
                
                const outpatientStatusList = document.getElementById('outpatient-status-list');
                if (outpatientStatusList) outpatientStatusList.innerHTML = '<li><strong>Status:</strong> <span style="color: ' + (s.outpatientStatus?.includes('Anomaly') ? 'red' : (s.outpatientStatus === 'Inactive' ? 'black' : 'green')) + '">' + (s.outpatientStatus || 'Inactive') + '</span></li>';
                
                const additionalPatientsCard = document.getElementById('additional-patients-card');
                if (s.additionalPatients?.length > 0) {
                  if (!additionalPatientsCard) {
                    const medicalCard = document.querySelector('.card:has(#medical-details-list)');
                    if (medicalCard) {
                      const newCard = document.createElement('div');
                      newCard.id = 'additional-patients-card';
                      newCard.className = 'card';
                      newCard.innerHTML = '<h2 class="card-header">Additional Patients</h2><div class="p-3 additional-patients-scroll" id="additional-patients-list"></div>';
                      medicalCard.parentNode.insertBefore(newCard, medicalCard.nextSibling);
                    }
                  }
                  const additionalPatientsList = document.getElementById('additional-patients-list');
                  if (additionalPatientsList) {
                    additionalPatientsList.innerHTML = s.additionalPatients.map(p => '<div style="padding: 5px; margin-bottom: 5px; border: 1px solid #ddd; border-radius: 3px; background: #f9f9f9; font-size: 0.75em;"><div><strong>' + p.name + '</strong> (ID: ' + p.id + ')</div><div style="font-size: 0.9em; color: #666;">' + p.symptoms + '</div></div>').join('');
                  }
                } else if (additionalPatientsCard) {
                  additionalPatientsCard.remove();
                }
                
                updateMap();
              }
            }
            
            function completeCheckIn() {
              channel.postMessage({ type: 'COMPLETE_CHECKIN' });
            }
            
            function initMap() {
              if (!map && document.getElementById('kiosk-map')) {
                try {
                  map = L.map('kiosk-map').setView([-33.8688, 151.2093], 12);
                  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap'
                  }).addTo(map);
                  setTimeout(() => map.invalidateSize(), 100);
                } catch(e) {
                  console.error('Map init error:', e);
                }
              }
            }
            
            function updateMap() {
              if (!map) initMap();
              if (!map) return;
              
              markers.forEach(m => {
                try { map.removeLayer(m); } catch(e) {}
              });
              markers = [];
              
              const s = state;
              
              if (s.hospitalLocation) {
                const hospitalIcon = L.divIcon({
                  html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000" width="32px" height="32px"><path d="M18 13h-5v5h-2v-5H6v-2h5V6h2v5h5v2z"/><path d="M0 0h24v24H0z" fill="none"/></svg>',
                  className: 'hospital-location-icon',
                  iconSize: [32, 32],
                  iconAnchor: [16, 32],
                  popupAnchor: [0, -32]
                });
                const hospitalMarker = L.marker([s.hospitalLocation.lat, s.hospitalLocation.lng], { icon: hospitalIcon }).addTo(map);
                hospitalMarker.bindPopup('Wellsoon Hospital');
                markers.push(hospitalMarker);
                
                const circle = L.circle([s.hospitalLocation.lat, s.hospitalLocation.lng], {
                  color: 'red',
                  fillColor: '#ff0000',
                  fillOpacity: 0.2,
                  radius: 100
                }).addTo(map);
                circle.bindPopup('Hospital Check-in Area');
                markers.push(circle);
                
                if (!s.userGps) {
                  map.setView([s.hospitalLocation.lat, s.hospitalLocation.lng], 13);
                }
              }
              
              if (s.userGps && s.hospitalLocation) {
                let iconUrl = s.ambulanceIcon;
                if (s.simulationMode === 'departure' && s.patientIcon) {
                  iconUrl = s.patientIcon;
                }
                
                const userIcon = iconUrl ? L.icon({
                  iconUrl: iconUrl,
                  iconSize: [32, 32],
                  iconAnchor: [16, 32],
                  popupAnchor: [0, -32]
                }) : L.icon({
                  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                  iconSize: [25, 41],
                  iconAnchor: [12, 41]
                });
                
                const userMarker = L.marker([s.userGps.lat, s.userGps.lng], { icon: userIcon }).addTo(map);
                userMarker.bindPopup('User Location');
                markers.push(userMarker);
                
                function getDistance(coords1, coords2) {
                  const R = 6371e3;
                  const φ1 = coords1.lat * Math.PI / 180;
                  const φ2 = coords2.lat * Math.PI / 180;
                  const Δφ = (coords2.lat - coords1.lat) * Math.PI / 180;
                  const Δλ = (coords2.lng - coords1.lng) * Math.PI / 180;
                  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  return R * c;
                }
                
                const distance = getDistance(s.userGps, s.hospitalLocation);
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
                
                const midLat = (s.userGps.lat + s.hospitalLocation.lat) / 2;
                const midLng = (s.userGps.lng + s.hospitalLocation.lng) / 2;
                map.setView([midLat, midLng], newZoom, { animate: true, pan: { duration: 2.5 } });
              }
              
              setTimeout(() => map.invalidateSize(), 50);
            }
          </script>
        </body>
        </html>
      `);
      doc.close();
    }
    
    // Send initial state to kiosk
    broadcast('KIOSK_UPDATE', {
      phone,
      verifiedPhoneNumber,
      identityIntegrity,
      registrationStatus,
      patientStatus,
      outpatientStatus,
      formState,
      patientMedicalDetails,
      additionalPatients,
      userGps,
      hospitalLocation,
      simulationMode
    });
  }, [kioskWindow, phone, verifiedPhoneNumber, identityIntegrity, registrationStatus, patientStatus, formState, patientMedicalDetails, additionalPatients, outpatientStatus, userGps, hospitalLocation, simulationMode]);

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
        <button className={`btn ${activeScreen === 1 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px' }} onClick={() => setActiveScreen(1)}>Network API Interactions</button>
        <button className={`btn ${activeScreen === 2 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px', display: 'none' }} onClick={() => setActiveScreen(2)}>Hospital Dashboard</button>
        <button className={`btn ${activeScreen === 3 ? 'btn-primary' : 'btn-secondary'}`} style={{ margin: '0 5px' }} onClick={() => setActiveScreen(3)}>Admin Console</button>
        <button className="btn btn-info" style={{ margin: '0 5px' }} onClick={openERDashboard}>📊 Open ER Dashboard</button>
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
                      {patientMedicalDetails.alert && <li style={{ background: '#dc3545', padding: '4px 6px', marginBottom: '4px', borderRadius: '3px', fontSize: '0.75em', color: '#ffffff', fontWeight: '700', border: '2px solid #c82333' }}>{patientMedicalDetails.alert}</li>}
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
                    {hospitalLocation ? (
                      <LocationMap userGps={userGps} hospitalLocation={hospitalLocation} verifiedPhoneNumber={verifiedPhoneNumber} simulationMode={simulationMode} />
                    ) : (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No location data available</div>
                    )}
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
                    {patientMedicalDetails.alert && <li style={{ background: '#dc3545', padding: '4px 6px', marginBottom: '4px', borderRadius: '3px', fontSize: '0.75em', color: '#ffffff', fontWeight: '700', border: '2px solid #c82333' }}>{patientMedicalDetails.alert}</li>}
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
                  {hospitalLocation ? (
                    <LocationMap userGps={userGps} hospitalLocation={hospitalLocation} verifiedPhoneNumber={verifiedPhoneNumber} simulationMode={simulationMode} />
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>No location data available</div>
                  )}
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

