# Manual Check-in Implementation

## Changes Required:

### 1. App.js - Add state for awaiting check-in
After line with `const [patientStatus, setPatientStatus] = useState('Not Checked In');`
Add:
```javascript
const [awaitingCheckIn, setAwaitingCheckIn] = useState(false);
```

### 2. App.js - Add broadcast case
In the broadcast switch statement, after the SET_PATIENT_STATUS case, add:
```javascript
case 'SET_AWAITING_CHECKIN':
  setAwaitingCheckIn(data);
  break;
```

### 3. App.js - Add sync wrapper
After `const syncSetPatientStatus = ...` line, add:
```javascript
const syncSetAwaitingCheckIn = (val) => { setAwaitingCheckIn(val); broadcast('SET_AWAITING_CHECKIN', val); };
```

### 4. App.js - Update handlePatientSequence
Replace the lines:
```javascript
const subId = await api.startMedicalTransportSequence(...);
if (subId) syncSetGeofencingSubscriptionId(subId);
```
With:
```javascript
const result = await api.startMedicalTransportSequence(...);
if (result && result.verified) {
  syncSetAwaitingCheckIn(true);
}
```

### 5. App.js - Add handleConfirmCheckIn function
Before `const handlePatientSequence = async (mode) => {`, add:
```javascript
const handleConfirmCheckIn = async () => {
  const phone = getVerifiedNumber();
  if (!phone || !hospitalLocation) return;
  
  addMessage("Doctor confirming patient check-in...");
  syncSetPatientStatus("Checked In");
  syncSetAwaitingCheckIn(false);
  addMessage("Patient check-in confirmed by doctor.");
  
  addMessage("Creating Geofencing Subscription for patient monitoring...");
  const geoSub = await api.createGeofencingSubscription(phone, hospitalLocation.lat, hospitalLocation.lng, 500);
  logApiInteraction('Create Geofencing Subscription', 'POST', '/geofencing-subscriptions/v0.3/subscriptions', {
    protocol: "HTTP",
    sink: "https://notificationSendServer12.supertelco.com",
    types: ["org.camaraproject.geofencing-subscriptions.v0.area-entered"],
    config: {
      subscriptionDetail: {
        device: { phoneNumber: phone },
        area: {
          areaType: "CIRCLE",
          center: { latitude: hospitalLocation.lat, longitude: hospitalLocation.lng },
          radius: 500
        }
      },
      initialEvent: true,
      subscriptionMaxEvents: 10,
      subscriptionExpireTime: "2026-03-20T05:40:58.469Z"
    }
  }, geoSub);
  const subId = geoSub.id || geoSub.subscriptionId;
  addMessage(`Geofencing Subscription Created: ID ${subId}`);
  syncSetGeofencingSubscriptionId(subId);
};
```

### 6. App.js - Update Patient Status display (Tab 2)
Replace:
```javascript
<li><strong>Patient Status:</strong> <span style={{ color: patientStatus === 'Checked In' ? 'green' : 'red' }}>{patientStatus}</span></li>
```
With:
```javascript
<li><strong>Patient Status:</strong> <span style={{ color: patientStatus === 'Checked In' ? 'green' : 'red' }}>{patientStatus}</span>
  {awaitingCheckIn && <button className="btn btn-success" style={{ marginLeft: '10px' }} onClick={handleConfirmCheckIn}>Confirm Check-in</button>}
</li>
```

### 7. App.js - Update Patient Status display (Tab 3)
Same change as #6 for the Tab 3 section

### 8. App.js - Reset awaitingCheckIn on departure
In the departure reset section, after `syncSetKycMatchResponse(null);`, add:
```javascript
syncSetAwaitingCheckIn(false);
```

## Summary:
- Patient arrives at hospital → Status changes to "Awaiting Check-in"
- Doctor sees "Confirm Check-in" button
- Doctor clicks button → Status changes to "Checked In" and geofencing subscription is created
