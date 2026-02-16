import React, { useState, useEffect, useRef } from 'react';
import './ERDashboard.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ambulanceIcon from '../ambulance.png';
import patientIcon from '../patient.png';
import emergencyRoomBg from '../emergency.png';

const HOSPITAL_LOCATION = { lat: 41.3874, lng: 2.1686 }; // West side of Barcelona

const mockAdditionalPatients = [
  {
    id: 'mock-1',
    phoneNumber: 'mock-1',
    name: 'Sarah Mitchell',
    age: 45,
    esi: 2,
    status: 'URGENT',
    eta: '35 min',
    distance: '17.5 km',
    location: { lat: 41.420, lng: 2.165 }, // North of hospital
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
    id: 'mock-2',
    phoneNumber: 'mock-2',
    name: 'James Rodriguez',
    age: 28,
    esi: 3,
    status: 'MODERATE',
    eta: '42 min',
    distance: '21.0 km',
    location: { lat: 41.350, lng: 2.170 }, // South of hospital
    vitals: '♥ HR: 88 bpm | 🩸 BP: 128/82 mmHg | 🫁 O₂: 97% | 🌡 T: 36.8°C',
    complaint: 'Fractured wrist from fall, stable',
    transport: 'Ambulance #A-089',
    medicalHistory: 'No significant medical history',
    specialistsNeeded: ['Orthopedic Surgeon'],
    equipmentNeeded: ['X-Ray', 'Casting Materials', 'Pain Management'],
    aiSummary: {
      diagnosis: 'Distal radius fracture, stable vitals',
      recommendedAction: 'X-ray imaging, orthopedic evaluation, pain management, splinting'
    }
  },
  {
    id: 'mock-3',
    phoneNumber: 'mock-3',
    name: 'Emily Chen',
    age: 52,
    esi: 3,
    status: 'MODERATE',
    eta: '50 min',
    distance: '25.0 km',
    location: { lat: 41.385, lng: 2.140 }, // West of hospital
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

  // Sort patients to prioritize real patients first
  const sortedPatients = [...patients].sort((a, b) => {
    const aIsReal = !a.phoneNumber.startsWith('mock-');
    const bIsReal = !b.phoneNumber.startsWith('mock-');
    if (aIsReal && !bIsReal) return -1;
    if (!aIsReal && bIsReal) return 1;
    return 0;
  });

  // Patient rotation timer with critical patient priority
  useEffect(() => {
    const getCurrentPatient = () => sortedPatients[currentPatientIndex];
    const isCritical = getCurrentPatient()?.esi === 1;
    const displayTime = isCritical ? 10000 : 5000; // Critical patients display for 10 seconds
    
    const rotationTimer = setInterval(() => {
      setCurrentPatientIndex(prev => (prev + 1) % sortedPatients.length);
    }, displayTime);
    return () => clearInterval(rotationTimer);
  }, [sortedPatients.length, currentPatientIndex]);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Mock patient ETA updates with location movement
  useEffect(() => {
    const etaTimer = setInterval(() => {
      setPatients(prev => prev.map(patient => {
        if (patient.phoneNumber.startsWith('mock-')) {
          const currentEta = parseInt(patient.eta);
          if (!isNaN(currentEta)) {
            let newEta, newLocation;
            if (currentEta <= 10) {
              // Reset to starting position
              newEta = Math.floor(Math.random() * 20) + 35;
              const angle = Math.random() * 2 * Math.PI;
              const distance = 0.05 + Math.random() * 0.03;
              newLocation = {
                lat: HOSPITAL_LOCATION.lat + Math.cos(angle) * distance,
                lng: HOSPITAL_LOCATION.lng + Math.sin(angle) * distance
              };
            } else {
              // Move closer to hospital
              newEta = currentEta - 1;
              const progress = (55 - newEta) / 45; // Progress from 0 to 1
              const currentLat = patient.location.lat;
              const currentLng = patient.location.lng;
              newLocation = {
                lat: currentLat + (HOSPITAL_LOCATION.lat - currentLat) * 0.05,
                lng: currentLng + (HOSPITAL_LOCATION.lng - currentLng) * 0.05
              };
            }
            return { ...patient, eta: `${newEta} min`, location: newLocation };
          }
        }
        return patient;
      }));
    }, 15000); // Update every 15 seconds
    return () => clearInterval(etaTimer);
  }, []);

  // Cross-window sync via BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('healthcare_demo_sync_v2');
    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      if (type === 'SET_HOSPITAL_LOCATION') {
        setHospitalLocation(data);
      } else if (type === 'PATIENT_ADMITTED') {
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
      }
    };
    return () => channelRef.current?.close();
  }, []);

  // Initialize map and markers
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([hospitalLocation.lat, hospitalLocation.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    // Update markers when patients or hospital location changes
    if (mapInstanceRef.current) {
      // Clear existing markers
      mapInstanceRef.current.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
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
          // Show ambulance icon for incoming patients, patient icon for checked-in/leaving patients
          const isLeaving = patient.status === 'LEFT_AMA';
          const isCheckedIn = patient.status === 'CHECKED_IN';
          
          if (!isCheckedIn && !isLeaving) {
            // Incoming ambulance
            const ambulanceMarker = L.divIcon({
              html: '<div style="background: white; border: 2px solid #dc3545; border-radius: 50%; padding: 2px; box-shadow: 0 0 8px rgba(220, 53, 69, 0.8);">🚑</div>',
              className: 'ambulance-marker',
              iconSize: [30, 30]
            });
            L.marker([patient.location.lat, patient.location.lng], { icon: ambulanceMarker })
              .addTo(mapInstanceRef.current)
              .bindPopup(`${patient.name}<br/>ESI-${patient.esi}<br/>ETA: ${patient.eta}<br/>${patient.transport}`);
          } else if (isLeaving) {
            // Patient leaving (show patient icon)
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
      {/* Fullscreen Video Background */}
      <video 
        autoPlay 
        loop 
        muted 
        playsInline
        className="video-background"
      >
        <source src="/Hospital_ER_Video.mp4" type="video/mp4" />
      </video>
      
      {/* Overlay to hide watermark */}
      <div className="video-overlay"></div>
      
      {/* Monitor Content Overlay */}
      <div className="monitor-screen">
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
                        <div 
                          key={sortedPatients[currentPatientIndex].id} 
                          className={`patient-card ${sortedPatients[currentPatientIndex].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[currentPatientIndex].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[currentPatientIndex].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPatient(sortedPatients[currentPatientIndex]);
                            setShowDetailCard(true);
                          }}
                          style={{ borderLeftColor: getESIColor(sortedPatients[currentPatientIndex].esi) }}
                        >
                          <div className="patient-header">
                            <div className="patient-info">
                              <h3>
                                {sortedPatients[currentPatientIndex].name} ({sortedPatients[currentPatientIndex].age}) {sortedPatients[currentPatientIndex].id && <span style={{ fontSize: '0.7em', color: '#666' }}>| ID: {sortedPatients[currentPatientIndex].id}</span>}
                                {/* Check-in button only when patient arrives at hospital */}
                                {!sortedPatients[currentPatientIndex].phoneNumber.startsWith('mock-') && 
                                 sortedPatients[currentPatientIndex].status === 'ARRIVED' && (
                                  <button 
                                    className="checkin-button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      console.log('Check-in clicked for:', sortedPatients[currentPatientIndex].name);
                                      handleCheckIn(sortedPatients[currentPatientIndex]);
                                    }}
                                    style={{ marginLeft: '5px', fontSize: '0.45rem', padding: '1px 3px', borderRadius: '2px', border: '1px solid #007bff', background: '#007bff', color: 'white', lineHeight: '1' }}
                                  >
                                    Check-In
                                  </button>
                                )}
                              </h3>
                            </div>
                            <span 
                              className="status-badge" 
                              style={{ backgroundColor: getStatusBadge(sortedPatients[currentPatientIndex].status) }}
                            >
                              {sortedPatients[currentPatientIndex].status === 'CHECKED_IN' ? 'In Treatment' : sortedPatients[currentPatientIndex].status === 'LEFT_AMA' ? 'Left AMA' : sortedPatients[currentPatientIndex].status}
                            </span>
                          </div>
                          
                          <div className="patient-details">
                            <div className="detail-row">
                              <span className="label">ESI Level:</span>
                              <span className="value" style={{ color: getESIColor(sortedPatients[currentPatientIndex].esi) }}>
                                <strong>ESI-{sortedPatients[currentPatientIndex].esi}</strong>
                              </span>
                            </div>
                            <div className="detail-row">
                              <span className="label">ETA:</span>
                              <span className="value eta">{sortedPatients[currentPatientIndex].eta}</span>
                            </div>
                          </div>

                          <div className="patient-complaint">
                            <strong>Chief Complaint:</strong> {sortedPatients[currentPatientIndex].complaint}
                          </div>
                        </div>
                        
                        {/* Second patient if available */}
                        {sortedPatients.length > 1 && (
                          <div 
                            key={sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].id} 
                            className={`patient-card ${sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatient(sortedPatients[(currentPatientIndex + 1) % sortedPatients.length]);
                              setShowDetailCard(true);
                            }}
                            style={{ borderLeftColor: getESIColor(sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].esi) }}
                          >
                            <div className="patient-header">
                              <div className="patient-info">
                                <h3>
                                  {sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].name} ({sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].age}) {sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].id && <span style={{ fontSize: '0.7em', color: '#666' }}>| ID: {sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].id}</span>}
                                  {/* Check-in button only when patient arrives at hospital */}
                                  {!sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].phoneNumber.startsWith('mock-') && 
                                   sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status === 'ARRIVED' && (
                                    <button 
                                      className="checkin-button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('Check-in clicked for:', sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].name);
                                        handleCheckIn(sortedPatients[(currentPatientIndex + 1) % sortedPatients.length]);
                                      }}
                                      style={{ marginLeft: '5px', fontSize: '0.45rem', padding: '1px 3px', borderRadius: '2px', border: '1px solid #007bff', background: '#007bff', color: 'white', lineHeight: '1' }}
                                    >
                                      Check-In
                                    </button>
                                  )}
                                </h3>
                              </div>
                              <span 
                                className="status-badge" 
                                style={{ backgroundColor: getStatusBadge(sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status) }}
                              >
                                {sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status === 'CHECKED_IN' ? 'In Treatment' : sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status === 'LEFT_AMA' ? 'Left AMA' : sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].status}
                              </span>
                            </div>
                            
                            <div className="patient-details">
                              <div className="detail-row">
                                <span className="label">ESI Level:</span>
                                <span className="value" style={{ color: getESIColor(sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].esi) }}>
                                  <strong>ESI-{sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].esi}</strong>
                                </span>
                              </div>
                              <div className="detail-row">
                                <span className="label">ETA:</span>
                                <span className="value eta">{sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].eta}</span>
                              </div>
                            </div>

                            <div className="patient-complaint">
                              <strong>Chief Complaint:</strong> {sortedPatients[(currentPatientIndex + 1) % sortedPatients.length].complaint}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {/* Current Patient Alert */}
                    {sortedPatients.length > 0 && (
                      <div className="alert-panel" style={{ marginTop: '0.5rem' }}>
                        <h3>⚠️ Current Patient Alert</h3>
                        {sortedPatients[currentPatientIndex].status === 'LEFT_AMA' && (
                          <div className="alert-item" style={{ background: 'rgba(255, 107, 53, 0.3)', borderLeft: '2px solid #FF6B35' }}>
                            <strong>🚶 PATIENT LEFT AMA</strong>
                            <p>{sortedPatients[currentPatientIndex].name} - Left Against Medical Advice</p>
                            <p className="alert-action">📞 Contact patient immediately: {sortedPatients[currentPatientIndex].phoneNumber}</p>
                          </div>
                        )}
                        {sortedPatients[currentPatientIndex].esi === 1 && sortedPatients[currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item critical">
                            <strong>🚨 CRITICAL ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex].eta}</p>
                            <p className="alert-action">⚠️ Prepare Trauma Room</p>
                          </div>
                        )}
                        {sortedPatients[currentPatientIndex].esi === 2 && sortedPatients[currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item urgent">
                            <strong>⚠️ URGENT ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex].eta}</p>
                            <p className="alert-action">👉 Prepare treatment area</p>
                          </div>
                        )}
                        {sortedPatients[currentPatientIndex].esi > 2 && sortedPatients[currentPatientIndex].status !== 'LEFT_AMA' && (
                          <div className="alert-item" style={{ background: 'rgba(40, 167, 69, 0.2)', borderLeft: '2px solid #28a745' }}>
                            <strong>✅ STANDARD ARRIVAL</strong>
                            <p>{sortedPatients[currentPatientIndex].name} - ESI-{sortedPatients[currentPatientIndex].esi} - ETA {sortedPatients[currentPatientIndex].eta}</p>
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
                    <div ref={mapRef} style={{ height: '250px', width: '100%', borderRadius: '4px' }}></div>
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
        {showDetailCard && selectedPatient && (
          <div style={{
            position: 'absolute',
            top: '15%',
            left: '10%',
            width: '80%',
            height: '70%',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            border: '2px solid #007bff',
            borderRadius: '8px',
            padding: '0.5rem',
            zIndex: 200,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
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
                fontSize: '1rem',
                cursor: 'pointer',
                color: '#666',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
            
            <h2 style={{ marginTop: 0, color: '#000', fontSize: '0.8rem', fontWeight: 'bold', textShadow: '0 0 2px rgba(0,0,0,0.8)' }}>{selectedPatient.name}</h2>
            <p style={{ color: '#333', marginBottom: '0.4rem', fontSize: '0.6rem', fontWeight: 'bold' }}>{selectedPatient.age} years old</p>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem', fontSize: '0.55rem', fontWeight: 'bold' }}>
                  <div><strong>ESI Level:</strong> <span style={{ color: getESIColor(selectedPatient.esi) }}>ESI-{selectedPatient.esi}</span></div>
                  <div><strong>Status:</strong> <span style={{ color: getStatusBadge(selectedPatient.status) }}>{selectedPatient.status}</span></div>
                  <div><strong>ETA:</strong> {selectedPatient.eta}</div>
                  <div><strong>Distance:</strong> {selectedPatient.distance}</div>
                  <div><strong>Transport:</strong> {selectedPatient.transport}</div>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.55rem', color: '#000', fontWeight: 'bold' }}>Chief Complaint:</strong>
                  <p style={{ backgroundColor: '#f8f9fa', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>
                    {selectedPatient.complaint}
                  </p>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.55rem', color: '#000', fontWeight: 'bold' }}>Vitals:</strong>
                  <p style={{ backgroundColor: '#e8f4f8', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>
                    {selectedPatient.vitals}
                  </p>
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                {selectedPatient.medicalHistory && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.55rem', color: '#000', fontWeight: 'bold' }}>Medical History:</strong>
                    <p style={{ backgroundColor: '#fff3cd', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: '0.5rem', fontWeight: 'bold', color: '#000' }}>
                      {selectedPatient.medicalHistory}
                    </p>
                  </div>
                )}
                
                {selectedPatient.specialistsNeeded && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.55rem', color: '#000', fontWeight: 'bold' }}>Specialists:</strong>
                    <p style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000', margin: '0.1rem 0' }}>{selectedPatient.specialistsNeeded.join(', ')}</p>
                  </div>
                )}
                
                {selectedPatient.equipmentNeeded && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.55rem', color: '#000', fontWeight: 'bold' }}>Equipment:</strong>
                    <p style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#000', margin: '0.1rem 0' }}>{selectedPatient.equipmentNeeded.join(', ')}</p>
                  </div>
                )}
                
                {selectedPatient.aiSummary && (
                  <div style={{ backgroundColor: '#667eea', color: 'white', padding: '0.4rem', borderRadius: '4px' }}>
                    <strong style={{ fontSize: '0.55rem', fontWeight: 'bold' }}>🤖 AI Summary</strong>
                    <div style={{ marginTop: '0.2rem', fontSize: '0.5rem', fontWeight: 'bold' }}>
                      <div style={{ marginBottom: '0.2rem' }}><strong>Diagnosis:</strong> {selectedPatient.aiSummary.diagnosis}</div>
                      <div><strong>Recommended Action:</strong> {selectedPatient.aiSummary.recommendedAction}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ERDashboard;