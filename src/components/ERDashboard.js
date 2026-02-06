import React, { useState, useEffect, useRef } from 'react';
import './ERDashboard.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ambulanceIcon from '../ambulance.png';
import patientIcon from '../patient.png';
import emergencyRoomBg from '../emergency2.png';

const HOSPITAL_LOCATION = { lat: 47.4863, lng: 19.0792 };

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
    location: { lat: 47.516, lng: 19.079 },
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
    location: { lat: 47.486, lng: 19.049 },
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
    location: { lat: 47.466, lng: 19.109 },
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
  const [hospitalLocation, setHospitalLocation] = useState({ lat: 47.4863, lng: 19.0792 });
  const [showGeofenceCircle, setShowGeofenceCircle] = useState(false);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const channelRef = useRef(null);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Update ETAs in real-time (only for mock patients)
  useEffect(() => {
    const timer = setInterval(() => {
      setPatients(prev => prev.map(p => {
        // Skip ETA countdown for real patients (non-mock)
        if (!p.phoneNumber.startsWith('mock-')) return p;
        
        const etaMinutes = parseInt(p.eta);
        if (etaMinutes > 0) {
          return { ...p, eta: `${etaMinutes - 1} min` };
        }
        return p;
      }));
    }, 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  // Cross-window sync via BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('healthcare_demo_sync_v2');
    channelRef.current.onmessage = (event) => {
      const { type, data } = event.data;
      console.log('ER Dashboard received broadcast:', type, data);
      if (type === 'SET_HOSPITAL_LOCATION') {
        console.log('ER Dashboard received hospital location:', data);
        setHospitalLocation(data);
      } else if (type === 'PATIENT_ADMITTED') {
        console.log('ER Dashboard received PATIENT_ADMITTED:', data);
        setPatients(prev => {
          // Check if patient already exists
          const exists = prev.find(p => p.phoneNumber === data.phoneNumber);
          if (exists) {
            console.log('Patient already exists, updating:', data.phoneNumber);
            return prev.map(p => p.phoneNumber === data.phoneNumber ? { ...p, ...data } : p);
          }
          console.log('Adding new patient:', data.phoneNumber);
          return [...prev, data];
        });
      } else if (type === 'PATIENT_STATUS_UPDATE') {
        console.log('ER Dashboard received PATIENT_STATUS_UPDATE:', data);
        setPatients(prev => {
          const updated = prev.map(p => {
            if (p.phoneNumber === data.phoneNumber) {
              console.log('Updating patient:', p.phoneNumber, 'with data:', data);
              return { ...p, ...data };
            }
            return p;
          });
          console.log('Updated patients:', updated);
          return updated;
        });
      } else if (type === 'PATIENT_CHECKED_IN') {
        console.log('ER Dashboard received PATIENT_CHECKED_IN:', data);
        // Update patient status instead of removing
        setPatients(prev => prev.map(p => 
          p.phoneNumber === data.phoneNumber ? { ...p, status: data.status, eta: 'Arrived' } : p
        ));
        // Show geofencing circle when patient is checked in
        setShowGeofenceCircle(true);
      } else if (type === 'SHOW_GEOFENCE_CIRCLE') {
        console.log('ER Dashboard received SHOW_GEOFENCE_CIRCLE');
        setShowGeofenceCircle(true);
      }
    };
    return () => channelRef.current?.close();
  }, []);

  // Initialize map
  useEffect(() => {
    if (mapRef.current && !mapInstanceRef.current) {
      const map = L.map(mapRef.current).setView([hospitalLocation.lat, hospitalLocation.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);
      
      mapInstanceRef.current = map;
    }
  }, [hospitalLocation]);

  // Update patient markers on map
  useEffect(() => {
    if (mapInstanceRef.current && hospitalLocation && hospitalLocation.lat && hospitalLocation.lng) {
      const map = mapInstanceRef.current;
      
      console.log('ER Dashboard updating map with patients:', patients);
      console.log('Hospital location:', hospitalLocation);
      
      // Clear only markers, not tile layer
      map.eachLayer(layer => {
        if (layer instanceof L.Marker || layer instanceof L.Circle) {
          map.removeLayer(layer);
        }
      });
      
      // Always add hospital marker first
      const hospitalMarker = L.divIcon({
        html: '<div style="font-size: 48px; color: #FF0000; font-weight: bold; line-height: 1; text-align: center;">+</div>',
        className: 'hospital-marker',
        iconSize: [48, 48],
        iconAnchor: [24, 24],
        popupAnchor: [0, -24]
      });
      L.marker([hospitalLocation.lat, hospitalLocation.lng], { icon: hospitalMarker })
        .addTo(map)
        .bindPopup('<strong>Wellsoon Hospital</strong><br>Budapest');
      
      console.log('Hospital marker added at:', hospitalLocation);
      
      // Add hospital vicinity circle (100m radius) - always visible
      L.circle([hospitalLocation.lat, hospitalLocation.lng], {
        color: '#0066ff',
        fillColor: '#0066ff',
        fillOpacity: 0.1,
        weight: 2,
        radius: 100
      }).addTo(map).bindPopup('Hospital Check-in Area (100m)');
      
      // Add geofencing monitoring circle (500m radius) - only when patient checked in
      if (showGeofenceCircle) {
        L.circle([hospitalLocation.lat, hospitalLocation.lng], {
          color: '#ff0000',
          fillColor: '#ff0000',
          fillOpacity: 0.05,
          weight: 3,
          dashArray: '10, 10',
          radius: 500
        }).addTo(map).bindPopup('Geofencing Monitoring Zone (500m)');
        console.log('Geofencing circle added at:', hospitalLocation);
      }
      
      // Add patient ambulance markers (show all moving patients including LEFT_AMA)
      patients.forEach(patient => {
        if (patient.location && patient.status !== 'CHECKED_IN') {
          console.log(`Adding marker for ${patient.name} at`, patient.location, 'status:', patient.status);
          const iconUrl = patient.status === 'LEFT_AMA' ? patientIcon : ambulanceIcon;
          
          // Apply CSS filter based on ESI level for severity-based coloring
          let iconHtml = '';
          if (patient.status !== 'LEFT_AMA') {
            const filterStyle = patient.esi === 1 ? 'filter: hue-rotate(0deg) saturate(2) brightness(0.8);' : // Red
                               patient.esi === 2 ? 'filter: hue-rotate(20deg) saturate(1.5) brightness(1);' : // Orange
                               patient.esi === 3 ? 'filter: hue-rotate(40deg) saturate(1.2) brightness(1.2);' : // Yellow
                               ''; // Default for ESI 4-5
            iconHtml = `<img src="${iconUrl}" style="width: 32px; height: 32px; ${filterStyle}" />`;
          } else {
            iconHtml = `<img src="${iconUrl}" style="width: 32px; height: 32px;" />`;
          }
          
          const icon = L.divIcon({
            html: iconHtml,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: 'ambulance-marker'
          });
          
          L.marker([patient.location.lat, patient.location.lng], { icon })
            .addTo(map)
            .bindPopup(`${patient.name}<br>ESI-${patient.esi}<br>ETA: ${patient.eta}`);
          
          console.log(`Marker added for ${patient.name} at`, patient.location);
        } else {
          console.log(`Skipping marker for ${patient.name} - status: ${patient.status}, has location: ${!!patient.location}`);
        }
      });
    }
  }, [patients, hospitalLocation, showGeofenceCircle]);

  // Simulate mock patient movement towards hospital (but never reach)
  useEffect(() => {
    const interval = setInterval(() => {
      setPatients(prev => prev.map(patient => {
        // Don't move checked-in or arrived patients
        if (patient.status === 'CHECKED_IN' || patient.status === 'ARRIVED' || !patient.location) return patient;
        
        // Only move mock patients (real patient location comes from broadcasts)
        if (!patient.phoneNumber.startsWith('mock-')) {
          console.log(`Skipping movement for real patient: ${patient.name}`);
          return patient;
        }
        
        // Calculate movement towards hospital
        const hospitalLat = hospitalLocation.lat;
        const hospitalLng = hospitalLocation.lng;
        const currentLat = patient.location.lat;
        const currentLng = patient.location.lng;
        
        // Calculate distance to hospital
        const latDiff = hospitalLat - currentLat;
        const lngDiff = hospitalLng - currentLng;
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        
        // Keep mock patients at minimum distance from hospital (never arrive)
        if (distance < 0.015) {
          return patient; // Stop moving when close enough (~1.5km)
        }
        
        // Move slowly towards hospital (3% per update)
        const moveSpeed = 0.03;
        const newLat = currentLat + (latDiff * moveSpeed);
        const newLng = currentLng + (lngDiff * moveSpeed);
        
        return {
          ...patient,
          location: { lat: newLat, lng: newLng }
        };
      }));
    }, 3000); // Update every 3 seconds
    
    return () => clearInterval(interval);
  }, []);

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
      <div className="er-background" style={{ backgroundImage: `url(${emergencyRoomBg})` }}>
        <div className="er-overlay"></div>
      </div>
      
      <div className="er-content">
        <div className="er-header">
          <h1>🏥 ER Coordination Center</h1>
          <div className="er-stats">
            <div className="stat-item">
              <span className="stat-label">Current Time</span>
              <span className="stat-value" style={{ fontSize: '1.2rem' }}>{currentTime.toLocaleTimeString()}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Incoming</span>
              <span className="stat-value">{patients.filter(p => p.status !== 'CHECKED_IN' && p.status !== 'LEFT_AMA').length}</span>
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
              {patients.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <div style={{ fontSize: '3em', marginBottom: '10px' }}>🏥</div>
                  <div>No incoming patients</div>
                  <div style={{ fontSize: '0.9em', marginTop: '5px' }}>Waiting for ambulance arrivals...</div>
                </div>
              )}
              {patients.sort((a, b) => a.esi - b.esi).map(patient => (
                <div 
                  key={patient.id} 
                  className={`patient-card ${selectedPatient?.id === patient.id ? 'selected' : ''} ${patient.esi === 1 ? 'pulse-animation' : ''} ${patient.status === 'CHECKED_IN' ? 'checked-in' : ''} ${patient.status === 'LEFT_AMA' ? 'left-ama' : ''}`}
                  onClick={() => setSelectedPatient(selectedPatient?.id === patient.id ? null : patient)}
                  style={{ borderLeftColor: getESIColor(patient.esi) }}
                >
                  <div className="patient-header">
                    <div className="patient-info">
                      <h3>{patient.name}</h3>
                      <span className="patient-age">{patient.age} years</span>
                    </div>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusBadge(patient.status) }}
                    >
                      {patient.status === 'CHECKED_IN' ? 'In Treatment' : patient.status === 'LEFT_AMA' ? 'Left AMA' : patient.status}
                    </span>
                  </div>
                  
                  {patient.status === 'LEFT_AMA' && (
                    <div style={{ fontSize: '0.75em', color: '#FF6B35', marginTop: '4px' }}>
                      📞 {patient.phoneNumber}
                    </div>
                  )}
                  
                  <div className="patient-details">
                    <div className="detail-row">
                      <span className="label">ESI Level:</span>
                      <span className="value" style={{ color: getESIColor(patient.esi) }}>
                        <strong>ESI-{patient.esi}</strong>
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">ETA:</span>
                      <span className="value eta">{patient.eta}</span>
                      {patient.status !== 'CHECKED_IN' && (patient.eta === 'ARRIVED' || patient.status === 'ARRIVED') && (
                        <button 
                          className="checkin-btn-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCheckIn(patient);
                          }}
                        >
                          ✓ Check-in
                        </button>
                      )}
                    </div>
                    <div className="detail-row">
                      <span className="label">Distance:</span>
                      <span className="value">{patient.distance}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Transport:</span>
                      <span className="value">{patient.transport}</span>
                    </div>
                  </div>

                  <div className="patient-complaint">
                    <strong>Chief Complaint:</strong> {patient.complaint}
                  </div>

                  <div style={{ textAlign: 'center', padding: '8px 0', borderTop: '1px solid #eee', marginTop: '8px', cursor: 'pointer' }}>
                    <span style={{ fontSize: '0.9em', color: '#666', transition: 'transform 0.2s', display: 'inline-block', transform: selectedPatient?.id === patient.id ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                    <span style={{ fontSize: '0.85em', color: '#666', marginLeft: '8px' }}>{selectedPatient?.id === patient.id ? 'Hide Details' : 'Show More Details'}</span>
                  </div>

                  {selectedPatient?.id === patient.id && (
                    <>
                      <div className="patient-vitals">
                        <strong>Vitals:</strong> {patient.vitals}
                      </div>
                      {patient.medicalHistory && (
                        <div className="patient-vitals">
                          <strong>Medical History:</strong> {patient.medicalHistory}
                        </div>
                      )}
                      {patient.specialistsNeeded && patient.specialistsNeeded.length > 0 && (
                        <div className="patient-vitals">
                          <strong>Specialists Needed:</strong> {patient.specialistsNeeded.join(', ')}
                        </div>
                      )}
                      {patient.equipmentNeeded && patient.equipmentNeeded.length > 0 && (
                        <div className="patient-vitals">
                          <strong>Equipment Needed:</strong> {patient.equipmentNeeded.join(', ')}
                        </div>
                      )}
                      {patient.aiSummary && (
                        <div className="ai-summary">
                          <strong>🤖 AI Summary</strong>
                          <div className="ai-summary-content">
                            <div><strong>Diagnosis:</strong> {patient.aiSummary.diagnosis}</div>
                            <div><strong>Recommended Action:</strong> {patient.aiSummary.recommendedAction}</div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="er-sidebar">
            <div className="map-panel">
              <h3>Live Patient Tracking</h3>
              <div ref={mapRef} style={{ height: '300px', width: '100%', borderRadius: '8px' }}></div>
            </div>

            <div className="resource-panel">
              <h3>Resource Status</h3>
              <div className="resource-item">
                <span>🛏️ Trauma Rooms</span>
                <span className="resource-value available">2 Available</span>
              </div>
              <div className="resource-item">
                <span>🛏️ General Beds</span>
                <span className="resource-value available">5 Available</span>
              </div>
              <div className="resource-item">
                <span>🫁 Ventilators</span>
                <span className="resource-value limited">3 Available</span>
              </div>
              <div className="resource-item">
                <span>👨‍⚕️ Physicians</span>
                <span className="resource-value available">4 On Duty</span>
              </div>
              <div className="resource-item">
                <span>👩‍⚕️ Nurses</span>
                <span className="resource-value available">8 On Duty</span>
              </div>
            </div>

            <div className="alert-panel">
              <h3>⚠️ Priority Alerts</h3>
              {patients.filter(p => p.esi <= 2).length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No critical alerts</div>
              )}
              {patients.filter(p => p.esi === 1).map(patient => (
                <div key={patient.id} className="alert-item critical">
                  <strong>🚨 CRITICAL ARRIVAL</strong>
                  <p>{patient.name} - ESI-{patient.esi} - ETA {patient.eta}</p>
                  <p className="alert-action">⚠️ Prepare Trauma Room</p>
                </div>
              ))}
              {patients.filter(p => p.esi === 2).map(patient => (
                <div key={patient.id} className="alert-item urgent">
                  <strong>⚠️ URGENT ARRIVAL</strong>
                  <p>{patient.name} - ESI-{patient.esi} - ETA {patient.eta}</p>
                  <p className="alert-action">👉 Prepare treatment area</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ERDashboard;
