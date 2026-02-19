import React, { useState, useEffect, useRef } from 'react';
import './ERDashboard.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ambulanceIcon from '../ambulance.png';
import patientIcon from '../patient.png';
import emergencyRoomBg from '../emergency.png';

const HOSPITAL_LOCATION = { lat: 41.400, lng: 2.100 }; // Barcelona - Hospital Clínic area
const MAP_CENTER = { lat: 41.3850, lng: 2.050 }; // Shifted west to show incoming ambulances

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

  const [showAttribution, setShowAttribution] = useState(false);

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
      {/* Fullscreen Static Image Background */}
      <div 
        className="video-background"
        style={{
          backgroundImage: 'url(/ER_Back.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      ></div>
      
      {/* Attribution Button */}
      <button
        onClick={() => setShowAttribution(!showAttribution)}
        style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '4px',
          padding: '5px 10px',
          fontSize: '0.7rem',
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        ℹ️ Image Attribution
      </button>

      {/* Attribution Popup */}
      {showAttribution && (
        <div
          style={{
            position: 'fixed',
            bottom: '50px',
            left: '10px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '2px solid #007bff',
            borderRadius: '8px',
            padding: '15px',
            maxWidth: '350px',
            zIndex: 11,
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
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Image Source:</div>
          <div style={{ marginBottom: '10px' }}>AI-generated using OpenAI DALL·E</div>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Generation Method:</div>
          <div style={{ marginBottom: '10px' }}>Created from a custom prompt describing a photorealistic hospital emergency room management environment designed for UI overlay demonstrations.</div>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Content Note:</div>
          <div>The image is fully synthetic and created for internal demonstration and visualization purposes.</div>
        </div>
      )}
      
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
                        {/* First patient card - always real patient (Joe Bloggs) if exists */}
                        <div 
                          key={sortedPatients[0].id} 
                          className={`patient-card ${sortedPatients[0].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[0].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[0].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPatient(sortedPatients[0]);
                            setShowDetailCard(true);
                          }}
                          style={{ borderLeftColor: getESIColor(sortedPatients[0].esi) }}
                        >
                          <div className="patient-header">
                            <div className="patient-info">
                              <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
                                <span>{sortedPatients[0].name} ({sortedPatients[0].age})</span>
                                {sortedPatients[0].id && <span style={{ fontSize: '0.7em', color: '#666' }}>| ID: {sortedPatients[0].id}</span>}
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
                                    style={{ fontSize: '0.5em', padding: '1px 4px', borderRadius: '2px', border: '1px solid #28a745', background: '#28a745', color: 'white', lineHeight: '1.2', cursor: 'pointer' }}
                                  >
                                    Check-In ✓
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
                        {sortedPatients.length > 1 && (
                          <div 
                            key={sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id} 
                            className={`patient-card ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi === 1 ? 'pulse-animation' : ''} ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'CHECKED_IN' ? 'checked-in' : ''} ${sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatient(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex]);
                              setShowDetailCard(true);
                            }}
                            style={{ borderLeftColor: getESIColor(sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].esi) }}
                          >
                            <div className="patient-header">
                              <div className="patient-info">
                                <h3 style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '3px' }}>
                                  <span>{sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].name} ({sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].age})</span>
                                  {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id && <span style={{ fontSize: '0.7em', color: '#666' }}>| ID: {sortedPatients[currentPatientIndex === 0 ? 1 : currentPatientIndex].id}</span>}
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
                                      style={{ fontSize: '0.5em', padding: '1px 4px', borderRadius: '2px', border: '1px solid #28a745', background: '#28a745', color: 'white', lineHeight: '1.2', cursor: 'pointer' }}
                                    >
                                      Check-In ✓
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
                    <div ref={mapRef} style={{ height: window.innerWidth >= 1400 ? '300px' : '250px', width: '100%', borderRadius: '4px' }}></div>
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
                fontSize: window.innerWidth >= 1400 ? '1.2rem' : '1rem',
                cursor: 'pointer',
                color: '#666',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>
            
            <h2 style={{ marginTop: 0, color: '#000', fontSize: window.innerWidth >= 1400 ? '1rem' : '0.8rem', fontWeight: 'bold', textShadow: '0 0 2px rgba(0,0,0,0.8)' }}>{selectedPatient.name} ({selectedPatient.age})</h2>
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                  <div>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold', display: 'block' }}>ESI Level:</strong>
                    <p style={{ backgroundColor: '#ffe6e6', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: getESIColor(selectedPatient.esi || 3) }}>
                      ESI-{selectedPatient.esi || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold', display: 'block' }}>Status:</strong>
                    <p style={{ backgroundColor: '#e3f2fd', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: getStatusBadge(selectedPatient.status || 'UNKNOWN') }}>
                      {selectedPatient.status || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold', display: 'block' }}>ETA:</strong>
                    <p style={{ backgroundColor: '#fff3e0', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.eta || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold', display: 'block' }}>Distance:</strong>
                    <p style={{ backgroundColor: '#f3e5f5', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.distance || 'N/A'}
                    </p>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold', display: 'block' }}>Transport:</strong>
                    <p style={{ backgroundColor: '#e8f5e9', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.transport || 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold' }}>Chief Complaint:</strong>
                  <p style={{ backgroundColor: '#f8f9fa', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                    {selectedPatient.complaint || 'N/A'}
                  </p>
                </div>
                
                <div style={{ marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold' }}>Vitals:</strong>
                  <p style={{ backgroundColor: '#e8f4f8', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                    {selectedPatient.vitals || 'N/A'}
                  </p>
                </div>
              </div>
              
              <div style={{ flex: 1 }}>
                {selectedPatient.medicalHistory && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold' }}>Medical History:</strong>
                    <p style={{ backgroundColor: '#fff3cd', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.medicalHistory}
                    </p>
                  </div>
                )}
                
                {selectedPatient.specialistsNeeded && selectedPatient.specialistsNeeded.length > 0 && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold' }}>Specialists Required:</strong>
                    <p style={{ backgroundColor: '#e1f5fe', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
                      {selectedPatient.specialistsNeeded.join(', ')}
                    </p>
                  </div>
                )}
                
                {selectedPatient.equipmentNeeded && selectedPatient.equipmentNeeded.length > 0 && (
                  <div style={{ marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', color: '#000', fontWeight: 'bold' }}>Equipments Required:</strong>
                    <p style={{ backgroundColor: '#fce4ec', padding: '0.2rem', borderRadius: '3px', margin: '0.1rem 0', fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', fontWeight: 'normal', color: '#000' }}>
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
                        fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem', 
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
                          fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem',
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                        }}>Diagnosis:</strong>
                        <p style={{ 
                          margin: '0.05rem 0 0 0', 
                          fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', 
                          fontWeight: 'normal', 
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                        }}>
                          {selectedPatient.aiSummary.diagnosis}
                        </p>
                      </div>
                      <div>
                        <strong style={{ 
                          fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.55rem',
                          color: '#fff',
                          textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                        }}>Recommended Action:</strong>
                        <p style={{ 
                          margin: '0.05rem 0 0 0', 
                          fontSize: window.innerWidth >= 1400 ? '0.75rem' : '0.5rem', 
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
    </div>
  );
};

export default ERDashboard;