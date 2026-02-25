import React, { useState, useEffect, useRef } from 'react';
import './ERDashboard.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ambulanceIcon from '../ambulance.png';
import patientIcon from '../patient.png';
import emergencyRoomBg from '../emergency.png';

const HOSPITAL_LOCATION = { lat: 41.38697, lng: 2.1182 }; // Barcelona - Les Corts residential area
const MAP_CENTER = { lat: 41.38697, lng: 2.1182 };

const mockAdditionalPatients = [
  {
    id: 'CIP-3847291056',
    phoneNumber: 'mock-1',
    name: 'Sarah Mitchell',
    age: 45,
    esi: 2,
    status: 'URGENT',
    eta: '55 min',
    distance: '27.5 km',
    location: { lat: 41.520, lng: 1.950 },
    initialLocation: { lat: 41.520, lng: 1.950 },
    vitals: '♥ HR: 145/95 bpm | 🩸 BP: 98 mmHg | 🫁 O₂: 94% | 🌡 T: 37.2°C',
    complaint: 'Severe abdominal pain, possible appendicitis',
    transport: 'Ambulance #A-153',
    medicalHistory: 'Hypertension, Previous abdominal surgery (2019)',
    specialistsNeeded: ['General Surgeon', 'Anesthesiologist'],
    equipmentNeeded: ['CT Scanner', 'Surgical Suite', 'IV Fluids'],
    aiSummary: {
      diagnosis: 'Suspected acute appendicitis with elevated BP',
      recommendedAction: 'Immediate CT scan, surgical consult, IV antibiotics, NPO status'
    }
  },
  {
    id: 'CIP-9238471029',
    phoneNumber: 'mock-2',
    name: 'James Rodriguez',
    age: 28,
    esi: 3,
    status: 'MODERATE',
    eta: '62 min',
    distance: '31.0 km',
    location: { lat: 41.385, lng: 1.880 },
    initialLocation: { lat: 41.385, lng: 1.880 },
    vitals: '♥ HR: 88 bpm | 🩸 BP: 128/82 mmHg | 🫁 O₂: 97% | 🌡 T: 36.8°C',
    complaint: 'Fractured wrist from fall, stable',
    transport: 'Ambulance #A-089',
    medicalHistory: 'Asthma (controlled), Previous ankle fracture (2020)',
    specialistsNeeded: ['Orthopedic Surgeon'],
    equipmentNeeded: ['X-Ray', 'Casting Materials', 'Pain Management'],
    aiSummary: {
      diagnosis: 'Distal radius fracture, stable vitals',
      recommendedAction: 'X-ray imaging, orthopedic evaluation, pain management, splinting'
    }
  },
  {
    id: 'CIP-7564820394',
    phoneNumber: 'mock-3',
    name: 'Emily Chen',
    age: 52,
    esi: 3,
    status: 'MODERATE',
    eta: '70 min',
    distance: '35.0 km',
    location: { lat: 41.280, lng: 1.980 },
    initialLocation: { lat: 41.280, lng: 1.980 },
    vitals: '♥ HR: 82 bpm | 🩸 BP: 135/85 mmHg | 🫁 O₂: 98% | 🌡 T: 37.0°C',
    complaint: 'Laceration requiring sutures, bleeding controlled',
    transport: 'Ambulance #A-201',
    medicalHistory: 'Type 2 Diabetes, Allergic to Penicillin',
    specialistsNeeded: ['ER Physician'],
    equipmentNeeded: ['Suture Kit', 'Local Anesthetic', 'Wound Care Supplies'],
    aiSummary: {
      diagnosis: 'Deep laceration with controlled bleeding, diabetic patient',
      recommendedAction: 'Wound irrigation, suturing, tetanus prophylaxis, avoid penicillin-based antibiotics'
    }
  },
  {
    id: 'CIP-6819237450',
    phoneNumber: 'mock-4',
    name: 'Robert Thompson',
    age: 34,
    esi: 3,
    status: 'MODERATE',
    eta: '78 min',
    distance: '39.0 km',
    location: { lat: 41.350, lng: 2.050 },
    initialLocation: { lat: 41.350, lng: 2.050 },
    vitals: '♥ HR: 76 bpm | 🩸 BP: 122/78 mmHg | 🫁 O₂: 99% | 🌡 T: 36.6°C',
    complaint: 'Ankle sprain, awaiting X-ray',
    transport: 'Ambulance #A-312',
    medicalHistory: 'No significant medical history',
    specialistsNeeded: ['Orthopedic Specialist'],
    equipmentNeeded: ['X-Ray', 'Ankle Brace', 'Ice Pack'],
    aiSummary: {
      diagnosis: 'Suspected ankle sprain, stable condition',
      recommendedAction: 'X-ray to rule out fracture, RICE protocol, pain management'
    }
  }
];

const ERDashboard = () => {
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patients, setPatients] = useState(mockAdditionalPatients);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hospitalLocation, setHospitalLocation] = useState(HOSPITAL_LOCATION);
  const [showGeofenceCircle, setShowGeofenceCircle] = useState(false);
  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);
  const [showDetailCard, setShowDetailCard] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const channelRef = useRef(null);
  const videoRef = useRef(null);
  const currentVideoRef = useRef(null); // ref to track current video without stale closure
  const audioEnabledRef = useRef(false); // ref to avoid stale closure in BroadcastChannel handler
  const isHealthcareActiveRef = useRef(true); // ref to check active state inside playVideo closure
  const [backgroundVideo, setBackgroundVideo] = useState(() => {
    const videos = ['ER-1.mp4', 'ER-2.mp4', 'ER-3.mp4', 'ER-4.mp4', 'ER-5.mp4', 'ER-6.mp4', 'ER-7.mp4', 'ER-8.mp4', 'ER-9.mp4'];
    const initial = videos[Math.floor(Math.random() * videos.length)];
    currentVideoRef.current = initial;
    return initial;
  });
  const [nextVideo, setNextVideo] = useState(null);
  const [showAttribution, setShowAttribution] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [showAudioPrompt, setShowAudioPrompt] = useState(true);
  const [isHealthcareActive, setIsHealthcareActive] = useState(true);
  const [showPresentationOverlay, setShowPresentationOverlay] = useState(false);
  const videoCountRef = useRef(0);
  const overlayTimersRef = useRef([]);

  // Only hide dashboard overlay in attract mode OR when inside iframe (for AttractMode)
  const isInIframe = window !== window.top;
  const isAttractMode = window.location.hash === '#/attract-mode' || isInIframe;

  // Sort patients: real patient (Joe Bloggs) always first, then rotate mock patients
  const realPatient = patients.find(p => !p.phoneNumber.startsWith('mock-'));
  const mockPatients = patients.filter(p => p.phoneNumber.startsWith('mock-'));
  
  const sortedPatients = realPatient ? [realPatient, ...mockPatients] : mockPatients;

  // Patient rotation timer - only rotate mock patients (skip index 0 if real patient exists)
  useEffect(() => {
    if (sortedPatients.length <= 1) return;
    
    const rotationTimer = setInterval(() => {
      setCurrentPatientIndex(prev => {
        const nextIndex = prev + 1;
        // If we have a real patient, rotate only through mock patients (indices 1+)
        if (realPatient) {
          return nextIndex >= sortedPatients.length ? 1 : nextIndex;
        }
        // Otherwise rotate through all
        return nextIndex >= sortedPatients.length ? 0 : nextIndex;
      });
    }, 5000);
    return () => clearInterval(rotationTimer);
  }, [sortedPatients.length, realPatient]);

  // Reset currentPatientIndex if it's out of bounds
  useEffect(() => {
    if (currentPatientIndex >= sortedPatients.length) {
      setCurrentPatientIndex(realPatient ? 1 : 0);
    }
  }, [sortedPatients.length, currentPatientIndex, realPatient]);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Video rotation
  useEffect(() => {
    const videos = ['ER-1.mp4', 'ER-2.mp4', 'ER-3.mp4', 'ER-4.mp4', 'ER-5.mp4', 'ER-6.mp4', 'ER-7.mp4', 'ER-8.mp4', 'ER-9.mp4'];
    const canPlayHandlerRef = { current: null };

    const playVideo = (src) => {
      if (!videoRef.current) return;
      if (canPlayHandlerRef.current) {
        videoRef.current.removeEventListener('canplay', canPlayHandlerRef.current);
        canPlayHandlerRef.current = null;
      }
      const handler = () => {
        videoRef.current?.removeEventListener('canplay', handler);
        canPlayHandlerRef.current = null;
        if (!isHealthcareActiveRef.current) return;
        videoRef.current.muted = !audioEnabledRef.current;
        videoRef.current?.play().catch(() => {});
      };
      canPlayHandlerRef.current = handler;
      videoRef.current.addEventListener('canplay', handler);
      videoRef.current.src = src;
      videoRef.current.load();
    };

    // Expose playVideo for VIEW_CHANGED handler
    window.__erPlayVideo = playVideo;

    // In iframe: no internal timer — VIEW_CHANGED controls when to start a new video
    // In standalone: rotate every 8s
    if (isInIframe) {
      playVideo(`/${currentVideoRef.current}`);

      // Brief black pause (1.5s) between videos so the end of each clip is perceptible
      const handleEnded = () => {
        if (!isHealthcareActiveRef.current) return;
        setTimeout(() => {
          if (!isHealthcareActiveRef.current) return;
          let newVideo;
          do { newVideo = videos[Math.floor(Math.random() * videos.length)]; }
          while (newVideo === currentVideoRef.current && videos.length > 1);
          currentVideoRef.current = newVideo;
          playVideo(`/${newVideo}`);
        }, 1500);
      };
      videoRef.current?.addEventListener('ended', handleEnded);

      return () => {
        videoRef.current?.removeEventListener('ended', handleEnded);
        delete window.__erPlayVideo;
        if (canPlayHandlerRef.current && videoRef.current) {
          videoRef.current.removeEventListener('canplay', canPlayHandlerRef.current);
        }
      };
    }

    playVideo(`/${currentVideoRef.current}`);
    const videoRotationTimer = setInterval(() => {
      let newVideo;
      do {
        newVideo = videos[Math.floor(Math.random() * videos.length)];
      } while (newVideo === currentVideoRef.current && videos.length > 1);
      currentVideoRef.current = newVideo;
      playVideo(`/${newVideo}`);
    }, 8000);

    return () => {
      clearInterval(videoRotationTimer);
      delete window.__erPlayVideo;
      if (canPlayHandlerRef.current && videoRef.current) {
        videoRef.current.removeEventListener('canplay', canPlayHandlerRef.current);
      }
    };
  }, [isInIframe]);
  // Watchdog: resume video if browser suspends/stalls it while this view is active
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = () => {
      if (isHealthcareActiveRef.current && video.paused && !video.ended && !overlayTimersRef.current.length) {
        video.play().catch(() => {});
      }
    };
    video.addEventListener('stalled', resume);
    video.addEventListener('suspend', resume);
    video.addEventListener('waiting', resume);
    return () => {
      video.removeEventListener('stalled', resume);
      video.removeEventListener('suspend', resume);
      video.removeEventListener('waiting', resume);
    };
  }, []);
  // Audio control for attract mode - handleAudioMessage defined inside effect to avoid stale closure
  useEffect(() => {
    if (!isAttractMode) return;

    const handleAudioMessage = (data) => {
    const { type, activeView } = data;
    if (type === 'PAUSE_ALL') {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.muted = true; }
    } else if (type === 'VIEW_CHANGED') {
      const isActive = data.activeTarget ? data.activeTarget === 'er' : activeView === 0;
      setIsHealthcareActive(isActive);
      isHealthcareActiveRef.current = isActive;
      if (videoRef.current) {
        if (isActive) {
          videoCountRef.current += 1;
          const videos = ['ER-1.mp4','ER-2.mp4','ER-3.mp4','ER-4.mp4','ER-5.mp4','ER-6.mp4','ER-7.mp4','ER-8.mp4','ER-9.mp4'];
          const startNextVideo = () => {
            if (!isHealthcareActiveRef.current) return;
            let newVideo;
            do { newVideo = videos[Math.floor(Math.random() * videos.length)]; }
            while (newVideo === currentVideoRef.current && videos.length > 1);
            currentVideoRef.current = newVideo;
            const v = videoRef.current;
            if (!v) return;
            v.muted = !audioEnabledRef.current;
            const onCanPlay = () => { v.removeEventListener('canplay', onCanPlay); if (isHealthcareActiveRef.current) v.play().catch(() => {}); };
            v.addEventListener('canplay', onCanPlay);
            v.src = `/${newVideo}`;
            v.load();
          };
          // Every activation: show overlay, start next video immediately (plays behind overlay),
            // then fade out overlay after 6s for smooth transition
            setShowPresentationOverlay(true);
            setTimeout(() => { if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize(); }, 100);
            startNextVideo(); // load next video now so it's ready when overlay fades
            const t1 = setTimeout(() => {
              setShowPresentationOverlay(false);
              overlayTimersRef.current = [];
            }, 6000);
            overlayTimersRef.current = [t1];
          } else {
          // Cancel overlay if switching away
          overlayTimersRef.current.forEach(t => clearTimeout(t));
          overlayTimersRef.current = [];
          setShowPresentationOverlay(false);
          videoRef.current.muted = true;
          videoRef.current.pause();
        }
      }
    } else if (type === 'SOUND_TOGGLE') {
      if (data.target && data.target !== 'er') return;
      const newState = data.hasOwnProperty('enabled') ? data.enabled : !audioEnabledRef.current;
      audioEnabledRef.current = newState;
      setAudioEnabled(newState);
      if (videoRef.current) {
        // Only unmute if ER is the currently active view; always allow muting
        videoRef.current.muted = !newState || !isHealthcareActiveRef.current;
      }
    }
  };

    const channel = new BroadcastChannel('attract_mode_sync');
    channel.onmessage = (event) => handleAudioMessage(event.data);
    const handlePostMessage = (event) => handleAudioMessage(event.data);
    window.addEventListener('message', handlePostMessage);

    return () => {
      channel.close();
      window.removeEventListener('message', handlePostMessage);
    };
  }, [isAttractMode]);

  // Toggle audio mute/unmute
  const toggleAudio = async () => {
    const newAudioState = !audioEnabled;
    setAudioEnabled(newAudioState);
    audioEnabledRef.current = newAudioState; // keep ref in sync
    
    if (videoRef.current) {
      videoRef.current.muted = !newAudioState;
      if (newAudioState) {
        setShowAudioPrompt(false);
        try {
          await videoRef.current.play();
        } catch (error) {
          console.log('Audio autoplay failed, keeping muted');
          setAudioEnabled(false);
        }
      }
    }
  };

  // Mock patient ETA updates with location movement
  useEffect(() => {
    const etaTimer = setInterval(() => {
      setPatients(prev => prev.map(patient => {
        if (patient.phoneNumber.startsWith('mock-')) {
          const currentEta = parseInt(patient.eta);
          if (!isNaN(currentEta)) {
            if (currentEta <= 5) {
              // Reset to starting position when very close to hospital
              const newEta = Math.floor(Math.random() * 20) + 55;
              const directions = [
                { lat: 41.520, lng: 1.950 },
                { lat: 41.385, lng: 1.880 },
                { lat: 41.280, lng: 1.980 }
              ];
              const randomDirection = directions[Math.floor(Math.random() * directions.length)];
              return { ...patient, eta: `${newEta} min`, location: randomDirection };
            } else {
              // Move closer to hospital
              const newEta = currentEta - 1;
              const newLocation = {
                lat: patient.location.lat + (HOSPITAL_LOCATION.lat - patient.location.lat) * 0.05,
                lng: patient.location.lng + (HOSPITAL_LOCATION.lng - patient.location.lng) * 0.05
              };
              return { ...patient, eta: `${newEta} min`, location: newLocation };
            }
          }
        }
        return patient;
      }));
    }, 15000);
    return () => clearInterval(etaTimer);
  }, []);

  // Cross-window sync via BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('healthcare_demo_sync_v2');
    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'PATIENT_ADMITTED') {
        setPatients(prev => {
          const exists = prev.find(p => p.phoneNumber === data.phoneNumber);
          if (exists) {
            return prev.map(p => p.phoneNumber === data.phoneNumber ? { ...p, ...data } : p);
          }
          return [...prev, data];
        });
      } else if (type === 'PATIENT_STATUS_UPDATE') {
        setPatients(prev => prev.map(p => 
          p.phoneNumber === data.phoneNumber ? { ...p, ...data } : p
        ));
      } else if (type === 'PATIENT_CHECKED_IN') {
        setPatients(prev => prev.map(p => 
          p.phoneNumber === data.phoneNumber ? { ...p, status: data.status, eta: 'Arrived' } : p
        ));
        setShowGeofenceCircle(true);
      } else if (type === 'SHOW_GEOFENCE_CIRCLE') {
        setShowGeofenceCircle(true);
      } else if (type === 'REMOVE_PATIENT') {
        setPatients(prev => prev.filter(p => p.phoneNumber !== data.phoneNumber));
        // Clear selected patient and detail card if it's the one being removed
        setSelectedPatient(prev => {
          if (prev?.phoneNumber === data.phoneNumber) {
            setShowDetailCard(false);
            return null;
          }
          return prev;
        });
      }
    };
    return () => channelRef.current?.close();
  }, []);

  // Update selected patient when patients data changes
  useEffect(() => {
    if (selectedPatient) {
      const updatedPatient = patients.find(p => p.phoneNumber === selectedPatient.phoneNumber);
      if (updatedPatient) {
        setSelectedPatient(updatedPatient);
      }
    }
  }, [patients]);

  // Initialize map and markers
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([MAP_CENTER.lat, MAP_CENTER.lng], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
      mapInstanceRef.current = map;
    }
  }, []);

  // Update markers separately without reinitializing map
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers and circles only
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Circle) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    // Add hospital marker
    const hospitalIcon = L.divIcon({
      html: '<div style="background: white; border: 2px solid #007bff; border-radius: 50%; padding: 2px; box-shadow: 0 0 8px rgba(0, 123, 255, 0.8);">🏥</div>',
      className: 'hospital-marker',
      iconSize: [35, 35]
    });
    L.marker([hospitalLocation.lat, hospitalLocation.lng], { icon: hospitalIcon })
      .addTo(mapInstanceRef.current)
      .bindPopup('Hospital Emergency Department - Barcelona');

    // Add patient/ambulance markers
    patients.forEach(patient => {
      if (patient.location) {
        const isLeaving = patient.status === 'LEFT_AMA';
        const isCheckedIn = patient.status === 'CHECKED_IN';
        
        if (!isCheckedIn && !isLeaving) {
          // Determine ambulance color based on ESI level
          let ambulanceColor = '#dc3545'; // Default red
          if (patient.esi === 2) {
            ambulanceColor = '#FD7E14'; // Orange for ESI-2 (Urgent)
          } else if (patient.esi === 3) {
            ambulanceColor = '#FFC107'; // Yellow for ESI-3 (Moderate)
          }
          
          const ambulanceMarker = L.divIcon({
            html: `<div style="background: white; border: 2px solid ${ambulanceColor}; border-radius: 50%; padding: 2px; box-shadow: 0 0 8px ${ambulanceColor};">🚑</div>`,
            className: 'ambulance-marker',
            iconSize: [30, 30]
          });
          L.marker([patient.location.lat, patient.location.lng], { icon: ambulanceMarker })
            .addTo(mapInstanceRef.current)
            .bindPopup(`${patient.name}<br/>ESI-${patient.esi}<br/>ETA: ${patient.eta}<br/>${patient.transport}`);
        } else if (isLeaving) {
          const patientMarker = L.divIcon({
            html: '<div style="background: white; border: 2px solid #FF6B35; border-radius: 50%; padding: 2px; box-shadow: 0 0 8px rgba(255, 107, 53, 0.8);">🚶</div>',
            className: 'patient-marker',
            iconSize: [30, 30]
          });
          L.marker([patient.location.lat, patient.location.lng], { icon: patientMarker })
            .addTo(mapInstanceRef.current)
            .bindPopup(`${patient.name}<br/>LEFT AMA<br/>Contact: ${patient.phoneNumber}`);
        }
      }
    });

    // Add geofence circle if needed
    if (showGeofenceCircle) {
      L.circle([hospitalLocation.lat, hospitalLocation.lng], {
        color: '#00d4ff',
        fillColor: '#00d4ff',
        fillOpacity: 0.1,
        radius: 1000
      }).addTo(mapInstanceRef.current);
    }
  }, [hospitalLocation, patients, showGeofenceCircle]);

  const getESIColor = (esi) => {
    switch(esi) {
      case 1: return '#DC3545';
      case 2: return '#FD7E14';
      case 3: return '#FFC107';
      case 4: return '#28A745';
      case 5: return '#17A2B8';
      default: return '#6C757D';
    }
  };

  const getESIBackgroundColor = (esi) => {
    switch(esi) {
      case 1: return 'linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 50%, #80DEEA 100%)';
      case 2: return 'linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 50%, #80CBC4 100%)';
      case 3: return 'linear-gradient(135deg, #E0F2F1 0%, #B2DFDB 50%, #80CBC4 100%)';
      case 4: return 'linear-gradient(135deg, #FFFFFF 0%, #F8FDFF 50%, #F0F8FF 100%)';
      case 5: return 'linear-gradient(135deg, #FFFFFF 0%, #F8FDFF 50%, #F0F8FF 100%)';
      default: return 'linear-gradient(135deg, #FFFFFF 0%, #F8FDFF 50%, #F0F8FF 100%)';
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'CRITICAL': '#DC3545',
      'URGENT': '#FD7E14',
      'MODERATE': '#FFC107',
      'STABLE': '#28A745',
      'CHECKED_IN': '#17A2B8',
      'ARRIVED': '#17A2B8',
      'LEFT_AMA': '#FF6B35'
    };
    return colors[status] || '#6C757D';
  };

  const handleCheckIn = (patient) => {
    channelRef.current?.postMessage({ 
      type: 'ER_COMPLETE_CHECKIN', 
      data: { phoneNumber: patient.phoneNumber } 
    });
  };

  return (
    <div className="er-dashboard">
      {/* Background Video - Timer Controlled */}
      {/* Static background in standalone mode, video in presentation/iframe mode */}
      {isInIframe ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          preload="auto"
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'cover', zIndex: -1 }}
        />
      ) : (
        <img
          src="/ER_Back.png"
          alt=""
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', objectFit: 'cover', zIndex: -1 }}
        />
      )}
      
      
      
      {/* Attribution Button */}
      <button
        onClick={() => setShowAttribution(!showAttribution)}
        style={{
          position: 'fixed',
          top: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          padding: '5px 10px',
          fontSize: '0.7rem',
          cursor: 'pointer',
          zIndex: 16
        }}
      >
        ℹ️ Video Attribution
      </button>

      {/* Attribution Popup */}
      {showAttribution && (
        <div
          style={{
            position: 'fixed',
            top: '45px',
            left: '10px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '2px solid #007bff',
            borderRadius: '8px',
            padding: '15px',
            maxWidth: '350px',
            zIndex: 17,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            fontSize: '0.75rem',
            color: '#000'
          }}
        >
          <button
            onClick={() => setShowAttribution(false)}
            style={{
              position: 'absolute',
              top: '5px',
              right: '10px',
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ×
          </button>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Video Source:</div>
          <div>Video generated by Oliver Holland using Google Gemini (Veo 3.1), 23 February 2026, using the prompt: "Create a 10 second video of a hospital Emergency Room from the stationary camera perspective of just inside the entrance door. Don't focus on any specific individuals or interactions"</div>
        </div>
      )}
      
      {/* Demo Banner - Only show in attract mode */}
      {isAttractMode && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.3)',
          color: 'white',
          padding: '15px 20px',
          fontSize: '0.75rem',
          lineHeight: '1.4',
          zIndex: 15,
          textShadow: '1px 1px 2px rgba(0, 0, 0, 0.8)'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '0.8rem' }}>Healthcare Enhancements using Network APIs</div>
          <div>A demo of healthcare enhancement solutions using CAMARA Network APIs and aggregators. Specifically:</div>
          <ul style={{ margin: '5px 0', paddingLeft: '15px' }}>
            <li>Automated patient registration, tracking of their transport and (in advance) arrival/care planning for emergency medical transport in a case of a medical emergency.</li>
            <li>Monitoring for abscondment from the hospital, and abscondment management.</li>
            <li>Outpatient monitoring for patients with chronic conditions.</li>
          </ul>
          {isInIframe && (
            <button
              onClick={() => window.parent.postMessage({ type: 'TRY_NOW' }, '*')}
              style={{
                marginTop: '8px',
                background: 'rgba(0, 123, 255, 0.85)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.6)',
                borderRadius: '20px',
                padding: '5px 16px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                textShadow: 'none'
              }}
            >
              ▶ Try Now
            </button>
          )}
        </div>
      )}
      
      {/* Dashboard - shown in standalone mode OR as overlay on frozen video in presentation */}
      {(!isAttractMode || isInIframe) && (
        <div
          className="monitor-screen"
          style={isInIframe ? { opacity: showPresentationOverlay ? 0.72 : 0, transition: 'opacity 1.2s ease', pointerEvents: 'none' } : undefined}
        >
          <div className="monitor-content">
            <div className="er-content">
              <div className="er-header">
                <div>
                  <h1>ER Coordination Center</h1>
                </div>
                <div className="er-stats">
                  <div className="stat-item">
                    <span className="stat-label">Current Time</span>
                    <span className="stat-value">{currentTime.toLocaleTimeString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Incoming Patients</span>
                    <span className="stat-value">{sortedPatients.filter(p => p.status !== 'CHECKED_IN' && p.status !== 'LEFT_AMA').length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Available Beds</span>
                    <span className="stat-value">7</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Staff on Duty</span>
                    <span className="stat-value">12</span>
                  </div>
                </div>
              </div>

              <div className="er-main">
                <div className="patient-queue">
                  <h2>Incoming Patients</h2>
                  <div className="queue-list">
                    {sortedPatients.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                        <div style={{ fontSize: '3em', marginBottom: '10px' }}>🏥</div>
                        <div>No incoming patients</div>
                        <div style={{ fontSize: '0.9em', marginTop: '5px' }}>Waiting for ambulance arrivals...</div>
                      </div>
                    )}
                    {sortedPatients.length > 0 && (
                      <>
                        {/* First patient card - always real patient (Joe Bloggs) if exists */}
                        <div 
                          key={sortedPatients[0].id} 
                          className={`patient-card ${sortedPatients[0].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[0].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[0].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPatient(sortedPatients[0]);
                            setShowDetailCard(true);
                          }}
                          style={{ borderLeftColor: getESIColor(sortedPatients[0].esi), background: getESIBackgroundColor(sortedPatients[0].esi) }}
                        >
                          <div className="patient-header">
                            <div className="patient-info">
                              <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
                                <span style={{ color: getESIColor(sortedPatients[0].esi) }}>{sortedPatients[0].name} ({sortedPatients[0].age})</span>
                                {sortedPatients[0].id && <span style={{ fontSize: '0.7em', color: '#333', fontWeight: 'bold' }}>| ID: {sortedPatients[0].id}</span>}
                                {/* Check-in button only when patient arrives at hospital */}
                                {!sortedPatients[0].phoneNumber.startsWith('mock-') && 
                                 sortedPatients[0].status === 'ARRIVED' && (
                                  <button 
                                    className="checkin-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('Check-in clicked for:', sortedPatients[0].name);
                                      handleCheckIn(sortedPatients[0]);
                                    }}
                                  >
                                    ✓ Check-In Patient
                                  </button>
                                )}
                              </h3>
                            </div>
                            <span 
                              className="status-badge" 
                              style={{ backgroundColor: getStatusBadge(sortedPatients[0].status) }}
                            >
                              {sortedPatients[0].status === 'CHECKED_IN' ? 'In Treatment' : sortedPatients[0].status === 'LEFT_AMA' ? 'Left AMA' : sortedPatients[0].status}
                            </span>
                          </div>
                          
                          <div className="patient-details">
                            <div className="detail-row">
                              <span className="label">ESI Level:</span>
                              <span className="value" style={{ color: getESIColor(sortedPatients[0].esi) }}>
                                <strong>ESI-{sortedPatients[0].esi}</strong>
                              </span>
                            </div>
                            <div className="detail-row">
                              <span className="label">ETA:</span>
                              <span className="value eta">{sortedPatients[0].eta}</span>
                            </div>
                          </div>

                          <div className="patient-complaint">
                            <strong>Chief Complaint:</strong> {sortedPatients[0].complaint}
                          </div>
                        </div>
                        
                        {/* Second patient - rotating through remaining mock patients */}
                        {sortedPatients.length > 1 && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex] && (
                          <div 
                            key={sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id} 
                            className={`patient-card ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatient(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex]);
                              setShowDetailCard(true);
                            }}
                            style={{ borderLeftColor: getESIColor(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi), background: getESIBackgroundColor(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi) }}
                          >
                            <div className="patient-header">
                              <div className="patient-info">
                                <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
                                  <span style={{ color: getESIColor(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi) }}>{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name} ({sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].age})</span>
                                  {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id && <span style={{ fontSize: '0.7em', color: '#333', fontWeight: 'bold' }}>| ID: {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id}</span>}
                                  {/* Check-in button only when patient arrives at hospital */}
                                  {!sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].phoneNumber.startsWith('mock-') && 
                                   sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'ARRIVED' && (
                                    <button 
                                      className="checkin-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('Check-in clicked for:', sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name);
                                        handleCheckIn(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex]);
                                      }}
                                    >
                                      ✓ Check-In Patient
                                    </button>
                                  )}
                                </h3>
                              </div>
                              <span 
                                className="status-badge" 
                                style={{ backgroundColor: getStatusBadge(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status) }}
                              >
                                {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'CHECKED_IN' ? 'In Treatment' : sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'LEFT_AMA' ? 'Left AMA' : sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status}
                              </span>
                            </div>
                            
                            <div className="patient-details">
                              <div className="detail-row">
                                <span className="label">ESI Level:</span>
                                <span className="value" style={{ color: getESIColor(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi) }}>
                                  <strong>ESI-{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi}</strong>
                                </span>
                              </div>
                              <div className="detail-row">
                                <span className="label">ETA:</span>
                                <span className="value eta">{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].eta}</span>
                              </div>
                            </div>

                            <div className="patient-complaint">
                              <strong>Chief Complaint:</strong> {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].complaint}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {/* Current Patient Alert */}
                    {sortedPatients.length > 0 && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex] && (
                      <div className="alert-panel" style={{ marginTop: '0.5rem' }}>
                        <h3>⚠️ Current Patient Alert</h3>
                        {/* Show LEFT_AMA alert for index 0 patient if they have that status */}
                        {sortedPatients[0].status === 'LEFT_AMA' && (
                          <div className="alert-item" style={{ background: 'rgba(255, 107, 53, 0.3)', borderLeft: '2px solid #FF6B35' }}>
                            <strong>🚶 PATIENT LEFT AMA</strong>
                            <p>{sortedPatients[0].name} - Left Against Medical Advice</p>
                            <p className="alert-action">📞 Contact patient immediately: {sortedPatients[0].phoneNumber}</p>
                          </div>
                        )}
                        {/* Show rotating patient alerts only if index 0 doesn't have LEFT_AMA */}
                        {sortedPatients[0].status !== 'LEFT_AMA' && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi === 1 && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item critical">
                            <strong>🚨 CRITICAL ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].eta}</p>
                            <p className="alert-action">⚠️ Prepare Trauma Room</p>
                          </div>
                        )}
                        {sortedPatients[0].status !== 'LEFT_AMA' && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi === 2 && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item urgent">
                            <strong>⚠️ URGENT ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].eta}</p>
                            <p className="alert-action">👉 Prepare treatment area</p>
                          </div>
                        )}
                        {sortedPatients[0].status !== 'LEFT_AMA' && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi > 2 && sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item" style={{ background: 'rgba(40, 167, 69, 0.2)', borderLeft: '2px solid #28a745' }}>
                            <strong>✅ STANDARD ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].eta}</p>
                            <p className="alert-action">📋 Standard preparation</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="er-sidebar">
                  <div className="map-panel">
                    <h3>Live Patient Tracking</h3>
                    {isInIframe ? (
                      <iframe
                        src="https://www.openstreetmap.org/export/embed.html?bbox=1.9%2C41.25%2C2.35%2C41.55&layer=mapnik&marker=41.387%2C2.118"
                        style={{ width: '100%', height: 'clamp(200px, 25vh, 350px)', borderRadius: '4px', border: 'none', display: 'block' }}
                        title="Barcelona map"
                        loading="eager"
                      />
                    ) : (
                      <div ref={mapRef} style={{ height: 'clamp(200px, 25vh, 350px)', width: '100%', borderRadius: '4px' }}></div>
                    )}
                  </div>

                  <div className="resource-panel">
                    <h3>Resource Status</h3>
                    <div className="resource-grid">
                      <div className="resource-item">
                        <span>🛏️ Trauma</span>
                        <span className="resource-value available">2</span>
                      </div>
                      <div className="resource-item">
                        <span>🛏️ Beds</span>
                        <span className="resource-value available">5</span>
                      </div>
                      <div className="resource-item">
                        <span>🫁 Ventilators</span>
                        <span className="resource-value limited">3</span>
                      </div>
                      <div className="resource-item">
                        <span>👨⚕️ Doctors</span>
                        <span className="resource-value available">4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/* Patient Detail Card Popup within Monitor */}
        {showDetailCard && selectedPatient && !isInIframe && (
          <div className="patient-detail-popup" style={{
            position: 'absolute',
            top: '5%',
            left: '10%',
            width: '80%',
            height: '90%',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: '2px solid #007bff',
            borderRadius: '8px',
            padding: '0.5rem',
            zIndex: 200,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            overflowY: 'auto'
          }}>
            <button 
              onClick={(e) => {
              e.stopPropagation();
              setShowDetailCard(false);
            }}
              style={{
                position: 'absolute',
                top: '10px',
                right: '15px',
                background: 'none',
                border: 'none',
                fontSize: 'clamp(1rem, 1.2vw, 1.2rem)',
                cursor: 'pointer',
                color: '#666',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
            
            <h2 style={{ marginTop: 0, color: '#000', fontSize: 'clamp(0.7rem, 1vw, 1.1rem)', fontWeight: 'bold', textShadow: '0 0 2px rgba(0,0,0,0.8)' }}>
              {selectedPatient.name} ({selectedPatient.age})
              {!selectedPatient.phoneNumber.startsWith('mock-') && selectedPatient.status === 'ARRIVED' && (
                <button 
                  className="checkin-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCheckIn(selectedPatient);
                  }}
                  style={{ marginLeft: '1rem' }}
                >
                  Check-In ✓
                </button>
              )}
            </h2>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <div>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold', display: 'block' }}>ESI Level:</strong>
                    <p style={{ backgroundColor: '#ffe6e6', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: getESIColor(selectedPatient.esi || 3) }}>
                      ESI-{selectedPatient.esi || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold', display: 'block' }}>Status:</strong>
                    <p style={{ backgroundColor: '#e3f2fd', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: getStatusBadge(selectedPatient.status || 'UNKNOWN') }}>
                      {selectedPatient.status || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold', display: 'block' }}>ETA:</strong>
                    <p style={{ backgroundColor: '#fff3e0', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.eta || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold', display: 'block' }}>Distance:</strong>
                    <p style={{ backgroundColor: '#f3e5f5', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.distance || 'N/A'}
                    </p>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold', display: 'block' }}>Transport:</strong>
                    <p style={{ backgroundColor: '#e8f5e9', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.transport || 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold' }}>Chief Complaint:</strong>
                  <p style={{ backgroundColor: '#f8f9fa', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                    {selectedPatient.complaint || 'N/A'}
                  </p>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold' }}>Vitals:</strong>
                  <p style={{ backgroundColor: '#e8f4f8', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                    {selectedPatient.vitals || 'N/A'}
                  </p>
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                {selectedPatient.medicalHistory && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold' }}>Medical History:</strong>
                    <p style={{ backgroundColor: '#fff3cd', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.medicalHistory}
                    </p>
                  </div>
                )}
                
                {selectedPatient.specialistsNeeded && selectedPatient.specialistsNeeded.length > 0 && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold' }}>Specialists Required:</strong>
                    <p style={{ backgroundColor: '#e1f5fe', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.specialistsNeeded.join(', ')}
                    </p>
                  </div>
                )}
                
                {selectedPatient.equipmentNeeded && selectedPatient.equipmentNeeded.length > 0 && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', color: '#000', fontWeight: 'bold' }}>Equipments Required:</strong>
                    <p style={{ backgroundColor: '#fce4ec', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.equipmentNeeded.join(', ')}
                    </p>
                  </div>
                )}
                
                {selectedPatient.aiSummary && (
                  <div style={{ 
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
                    padding: '0.3rem', 
                    borderRadius: '4px',
                    border: '2px solid #ffd700',
                    boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.2rem',
                      marginBottom: '0.2rem',
                      paddingBottom: '0.15rem',
                      borderBottom: '1px solid rgba(255, 215, 0, 0.3)'
                    }}>
                      <span style={{ fontSize: '0.9rem' }}>🤖</span>
                      <strong style={{ 
                        fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)', 
                        fontWeight: 'bold',
                        color: '#ffd700',
                        textShadow: '0 0 10px rgba(255, 215, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
                        letterSpacing: '0.5px'
                      }}>AI ANALYSIS</strong>
                    </div>
                    <div style={{ 
                      background: 'rgba(255, 255, 255, 0.1)', 
                      padding: '0.2rem', 
                      borderRadius: '3px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ marginBottom: '0.2rem' }}>
                        <strong style={{ 
                          fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)',
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                        }}>Diagnosis:</strong>
                        <p style={{ 
                          margin: '0.05rem 0 0 0', 
                          fontSize: 'clamp(0.5rem, 0.75vw, 0.8rem)', 
                          fontWeight: 'normal', 
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}>
                          {selectedPatient.aiSummary.diagnosis}
                        </p>
                      </div>
                      <div>
                        <strong style={{ 
                          fontSize: 'clamp(0.55rem, 0.8vw, 0.85rem)',
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                        }}>Recommended Action:</strong>
                        <p style={{ 
                          margin: '0.05rem 0 0 0', 
                          fontSize: 'clamp(0.5rem, 0.75vw, 0.8rem)', 
                          fontWeight: 'normal', 
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}>
                          {selectedPatient.aiSummary.recommendedAction}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default ERDashboard;