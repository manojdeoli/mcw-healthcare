import axios from 'axios';
import authService from './auth';

const API_BASE_URL = 'https://network-as-code.p-eu.rapidapi.com/passthrough/camara/v1';
const API_KEY = 'a1dee25b3dmsh933c9f572c08b1cp1e7225jsna6c0a404fd8e';



const defaultHeaders = {
    'Content-Type': 'application/json',
    'authorization': 'Test',
    'x-rapidapi-host': 'network-as-code.nokia.rapidapi.com',
    'x-rapidapi-key': API_KEY
};

async function post(url, body, customHeaders = {}) {
    const headers = { ...defaultHeaders, ...customHeaders };
    const response = await axios.post(url, body, { headers });
    return response.data;
}

export function verifyPhoneNumber(phoneNumber) {
    return ensureValidToken().then(() => {
        const accessToken = authService.getAccessToken();
        return post(`${API_BASE_URL}/number-verification/number-verification/v0/verify`, { phoneNumber }, {
            'Authorization': `Bearer ${accessToken}`
        });
    });
}

async function ensureValidToken() {
    if (authService.isTokenValid()) {
        console.log('✅ Token is valid, no re-authentication needed');
        return Promise.resolve();
    }
    
    console.log('⚠️ Token expired or invalid, triggering silent re-authentication...');
    
    // Save comprehensive app state before re-authentication
    const appState = {
        activeScreen: document.querySelector('.btn-primary')?.textContent?.includes('Admin Console') ? 3 : 
                     document.querySelector('.btn-primary')?.textContent?.includes('Network API') ? 1 : 
                     localStorage.getItem('activeScreen') || '3',
        verifiedPhoneNumber: localStorage.getItem('verifiedPhoneNumber'),
        outpatientStatus: localStorage.getItem('outpatientStatus'),
        // Save form state from DOM and localStorage
        formState: {},
        // Save outpatient monitoring state
        monitoringState: {
            outpatientStatus: localStorage.getItem('outpatientStatus'),
            shouldResumeMonitoring: localStorage.getItem('shouldResumeMonitoring'),
            // Save current application state
            patientStatus: localStorage.getItem('patientStatus'),
            registrationStatus: localStorage.getItem('registrationStatus'),
            identityIntegrity: localStorage.getItem('identityIntegrity'),
            patientMedicalDetails: localStorage.getItem('patientMedicalDetails')
        },
        timestamp: Date.now()
    };
    
    // Capture current form values from DOM
    const formFields = ['name', 'email', 'address', 'birthdate'];
    formFields.forEach(field => {
        const element = document.getElementById(field);
        if (element) {
            appState.formState[field] = element.value;
        }
    });
    
    // Save current phone input value
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        appState.phoneNumber = phoneInput.value;
    }
    
    authService.saveAppState(appState);
    
    // Get phone number for re-authentication
    const phoneNumber = localStorage.getItem('verifiedPhoneNumber') || '+99999991000';
    
    // Trigger re-authentication (will redirect)
    await authService.authenticate(phoneNumber);
    
    // This line won't be reached due to redirect, but needed for promise chain
    return new Promise(() => {});
}

export function kycMatch(data, logApiInteraction) {
    const requestBody = {
        phoneNumber: data.phoneNumber,
        name: data.name,
        address: data.address,
        birthdate: data.birthdate,
        email: data.email
    };
    
    return post(`${API_BASE_URL}/kyc-match/kyc-match/v0.3/match`, requestBody).then(response => {
        if (logApiInteraction) {
            logApiInteraction('KYC Match', 'POST', '/kyc-match/kyc-match/v0.3/match', requestBody, response);
        }
        return response;
    }).catch(error => {
        console.warn('KYC Match API call failed, using mock implementation:', error.message);
        
        const stored = storedKycFillData[data.phoneNumber];
        if (!stored) {
            const response = {
                nameMatch: 'not_available',
                addressMatch: 'not_available',
                birthdateMatch: 'not_available',
                emailMatch: 'not_available'
            };
            if (logApiInteraction) {
                logApiInteraction('KYC Match (Mock)', 'POST', '/kyc-match/kyc-match/v0.3/match', requestBody, response);
            }
            return response;
        }
        const response = {
            nameMatch: data.name === stored.name ? 'true' : 'false',
            addressMatch: data.address === stored.address ? 'true' : 'false',
            birthdateMatch: data.birthdate === stored.birthdate ? 'true' : 'false',
            emailMatch: data.email === stored.email ? 'true' : 'false'
        };
        if (logApiInteraction) {
            logApiInteraction('KYC Match (Mock)', 'POST', '/kyc-match/kyc-match/v0.3/match', requestBody, response);
        }
        return response;
    });
}

export function simSwap(phoneNumber) {
    const requestBody = {
        phoneNumber: phoneNumber,
        maxAge: 240
    };
    return post(`${API_BASE_URL}/sim-swap/sim-swap/v0/check`, requestBody).then(response => {
        const demoResponse = { swapped: false };
        return demoResponse;
    }).catch(error => {
        console.warn('SIM Swap API call failed, using demo response:', error.message);
        const demoResponse = { swapped: false };
        return demoResponse;
    });
}

export function deviceSwap(phoneNumber) {
    const requestBody = {
        phoneNumber: phoneNumber,
        maxAge: 240
    };
    return post(`${API_BASE_URL}/device-swap/device-swap/v1/check`, requestBody).then(response => {
        const demoResponse = { swapped: false };
        return demoResponse;
    }).catch(error => {
        console.warn('Device Swap API call failed, using demo response:', error.message);
        const demoResponse = { swapped: false };
        return demoResponse;
    });
}

export function numberRecycling(phoneNumber) {
    // return post(`${API_BASE_URL}/number-recycling/number-recycling/v0/check`, { phoneNumber });
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                recycled: false
            });
        }, 500);
    });
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  var R = 6371e3; // Radius of the earth in m
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in m
  return d;
}

function generateAISummary(chiefComplaint) {
    const complaint = chiefComplaint.toLowerCase();
    
    if (complaint.includes('chest') || complaint.includes('cardiac') || complaint.includes('heart')) {
        return {
            diagnosis: '🩺 Suspected Acute Coronary Syndrome (ACS) - Possible STEMI',
            recommendedAction: '⚡ Immediate cardiac catheterization lab activation | Administer aspirin, nitroglycerin, and heparin | Continuous cardiac monitoring'
        };
    } else if (complaint.includes('abdominal') || complaint.includes('abdomen')) {
        return {
            diagnosis: '🫀 Suspected Acute Appendicitis',
            recommendedAction: '💉 Surgical consult | NPO status | IV antibiotics | CT abdomen with contrast'
        };
    } else if (complaint.includes('fracture') || complaint.includes('broken')) {
        return {
            diagnosis: '🦴 Suspected Compound Fracture',
            recommendedAction: '💊 Orthopedic consult | Pain management | X-ray imaging | Prepare for surgical reduction'
        };
    } else if (complaint.includes('laceration') || complaint.includes('cut') || complaint.includes('wound')) {
        return {
            diagnosis: '🩹 Deep Laceration Requiring Sutures',
            recommendedAction: '🧵 Wound irrigation and debridement | Tetanus prophylaxis | Suture kit preparation'
        };
    } else {
        return {
            diagnosis: '💔 Acute Medical Emergency',
            recommendedAction: '👨‍⚕️ Immediate physician assessment | Full vital signs monitoring | Prepare for diagnostic workup'
        };
    }
}

const mockKycData = {
    '61400500800': { name: 'Michael Jackson', address: '242 Exhibition St, Melbourne', birthdate: '1958-08-29', email: 'michael.hehe@gmail.com' },
    '61400500801': { name: 'Maria Fernanda González', address: '12 Collins St, Melbourne VIC 3000', birthdate: '1968-02-08', email: 'gonzalez02081968@example.com' },
    '61400500802': { name: 'John Smith', address: '85 George St, Sydney NSW 2000', birthdate: '1979-12-20', email: 'john20121979@outlook.com' },
    '61400500803': { name: 'Aisha Mohammed Al-Farsi', address: '7 Adelaide Terrace, Perth WA 6000', birthdate: '1950-03-13', email: 'aishaal-farsi13031950@example.com' },
    '61400500804': { name: 'Chen Wei', address: '23 North Terrace, Adelaide SA 5000', birthdate: '1979-03-22', email: 'chen22031979@example.com' },
    '61400500805': { name: 'Priya Ramesh Kumar', address: '45 Margaret St, Brisbane QLD 4000', birthdate: '1974-04-12', email: 'priyak12041974@gmail.com' },
    '61400500806': { name: 'Jean-Pierre Dubois', address: '18 Macquarie St, Hobart TAS 7000', birthdate: '1957-05-30', email: 'user3674@yahoo.com' },
    '61400500807': { name: 'Anna Ivanova', address: '9 London Circuit, Canberra ACT 2601', birthdate: '2000-08-22', email: 'anna.22@outlook.com' },
    '61400500808': { name: 'David Oluwaseun Adeyemi', address: '56 Cavenagh St, Darwin NT 0800', birthdate: '1974-01-24', email: 'david.adeyemi24@gmail.com' },
    '61400500809': { name: 'Sofia Rossi', address: '101 Swanston St, Melbourne VIC 3000', birthdate: '1981-12-29', email: '.sofia@yahoo.com' },
    '61400500810': { name: 'Ahmed Hassan', address: '220 Pitt St, Sydney NSW 2000', birthdate: '2002-09-01', email: 'ahmed.hassan.@yahoo.com' },
    '61400500811': { name: 'Yuki Tanaka', address: '33 St Georges Terrace, Perth WA 6000', birthdate: '1967-12-23', email: 'yuki.23@outlook.com' },
    '61400500812': { name: 'Isabella Maria Costa', address: '14 King William St, Adelaide SA 5000', birthdate: '1996-06-16', email: 'isabella.maria.costa@gmail.com' },
    '61400500813': { name: 'Thabo Mokoena', address: '67 Queen St, Brisbane QLD 4000', birthdate: '1998-07-02', email: 'thabo.mokoena.@yahoo.com' },
    '61400500814': { name: 'Emily Grace Johnson', address: '5 Elizabeth St, Hobart TAS 7000', birthdate: '1957-09-05', email: 'emily.johnson09@gmail.com' },
    '61400500815': { name: 'Fatima Zahra El Amrani', address: '2 Akuna St, Canberra ACT 2601', birthdate: '1997-06-29', email: 'fatima.zahra.elamrani@example.com' },
    '61400500816': { name: 'Lars Eriksson', address: '88 Mitchell St, Darwin NT 0800', birthdate: '2002-12-16', email: 'lars@outlook.com' },
    '61400500817': { name: 'Olga Petrovna Sokolova', address: '77 Bourke St, Melbourne VIC 3000', birthdate: '1958-06-14', email: 'user4635@yahoo.com' },
    '61400500818': { name: 'Lucas Martín Pérez', address: '150 Castlereagh St, Sydney NSW 2000', birthdate: '1983-09-02', email: 'perez02091983@example.com' },
    '61400500819': { name: 'Siti Nurhaliza', address: '21 Hay St, Perth WA 6000', birthdate: '1968-09-16', email: 'user5786@yahoo.com' },
    '61400500820': { name: 'Michael James O\'Connor', address: '39 Grote St, Adelaide SA 5000', birthdate: '1976-05-17', email: 'michael.james.oconnor@gmail.com' },
    '61400500821': { name: 'Alejandro Javier Morales', address: '12 Ann St, Brisbane QLD 4000', birthdate: '1985-08-12', email: 'alejandrom12081985@yahoo.com' },
    '61400500822': { name: 'Grace Nia Williams', address: '30 Davey St, Hobart TAS 7000', birthdate: '1992-05-30', email: 'williamsgrace@yahoo.com' },
    '61400500823': { name: 'Kwame Kofi Mensah', address: '11 Marcus Clarke St, Canberra ACT 2601', birthdate: '1972-01-19', email: 'kwamem19011972@gmail.com' },
    '61400500824': { name: 'Mei Ling Zhang', address: '60 Smith St, Darwin NT 0800', birthdate: '1999-01-02', email: 'mei.zhang02@yahoo.com' },
    '61400500825': { name: 'Samuel Oluwafemi Okoro', address: '200 Lonsdale St, Melbourne VIC 3000', birthdate: '1971-03-30', email: 'okorosamuel@gmail.com' },
    '61400500826': { name: 'Anna Maria Schmidt', address: '300 George St, Sydney NSW 2000', birthdate: '1984-12-24', email: 'annaschmidt24121984@gmail.com' },
    '61400500827': { name: 'Hassan Ali Rahman', address: '8 William St, Perth WA 6000', birthdate: '2003-09-30', email: 'hassan30092003@example.com' },
    '61400500828': { name: 'Sofia Elena Petrova', address: '25 Pulteney St, Adelaide SA 5000', birthdate: '1962-11-04', email: 'sofia.petrova@example.com' },
    '61400500829': { name: 'Lucas Daniel Ferreira', address: '55 Turbot St, Brisbane QLD 4000', birthdate: '1985-01-14', email: 'lucas.ferreira@yahoo.com' },
    '61400500830': { name: 'Amira Noor Al-Mansouri', address: '22 Murray St, Hobart TAS 7000', birthdate: '1964-12-24', email: 'al-mansouri24121964@yahoo.com' },
    '61400500831': { name: 'Ethan James O\'Leary', address: '4 London Cct, Canberra ACT 2601', birthdate: '1989-05-22', email: 'ethano22051989@example.com' },
    '61400500832': { name: 'Isabella Sofia Romano', address: '15 Daly St, Darwin NT 0800', birthdate: '1968-02-05', email: 'isabellar05021968@example.com' },
    '61400500833': { name: 'Rajesh Kumar Singh', address: '19 Flinders St, Melbourne VIC 3000', birthdate: '1958-09-27', email: 'rajesh27091958@example.com' },
    '61400500834': { name: 'Chloe Mae Evans', address: '400 Kent St, Sydney NSW 2000', birthdate: '1953-12-29', email: 'evanschloe@yahoo.com' },
    '61400500835': { name: 'Leila Fatemeh Hosseini', address: '12 Barrack St, Perth WA 6000', birthdate: '1956-04-19', email: 'leila.hosseini@outlook.com' },
    '61400500836': { name: 'Daniel George Papadopoulos', address: '17 Wakefield St, Adelaide SA 5000', birthdate: '1953-11-29', email: 'daniel.george.papadopoulos@yahoo.com' },
    '61400500837': { name: 'Amina Binta Diallo', address: '80 Roma St, Brisbane QLD 4000', birthdate: '1971-02-15', email: 'aminadiallo15021971@example.com' },
    '61400500838': { name: 'Tomasz Marek Nowak', address: '9 Bathurst St, Hobart TAS 7000', birthdate: '1984-08-31', email: 'nowak.tomasz@example.com' },
    '61400500839': { name: 'Siti Aisyah Binti Ahmad', address: '7 Allara St, Canberra ACT 2601', birthdate: '1956-10-21', email: 'sitibinti.ahmad21101956@outlook.com' },
    '61400500840': { name: 'Jacob Müller', address: '25 Bennett St, Darwin NT 0800', birthdate: '1986-12-02', email: 'jacob@example.com' },
    '61400500841': { name: 'Maria Luisa Hernández', address: '250 Spencer St, Melbourne VIC 3000', birthdate: '1978-12-05', email: 'maria.hernandez@yahoo.com' },
    '61400500842': { name: 'Benjamin Lee Chen', address: '500 Elizabeth St, Sydney NSW 2000', birthdate: '1964-08-26', email: 'chen26081964@example.com' },
    '61400500843': { name: 'Sara Fatima Rahimi', address: '6 Murray St, Perth WA 6000', birthdate: '1979-10-12', email: 'rahimi12101979@outlook.com' },
    '61400500844': { name: 'Peter Andreas Müller', address: '13 Franklin St, Adelaide SA 5000', birthdate: '1961-05-02', email: 'peter.muller@example.com' },
    '61400500845': { name: 'Lucia Beatriz Silva', address: '90 Albert St, Brisbane QLD 4000', birthdate: '1987-01-29', email: 'user3411@example.com' },
    '61400500846': { name: 'Omar Khaled Al-Sayed', address: '16 Liverpool St, Hobart TAS 7000', birthdate: '1975-04-13', email: 'al-sayedomar@outlook.com' },
    '61400500847': { name: 'Julia Annabelle Fischer', address: '3 Constitution Ave, Canberra ACT 2601', birthdate: '1993-10-30', email: 'julia.fischer@example.com' },
    '61400500848': { name: 'Nia Thandeka Dlamini', address: '40 Cavenagh St, Darwin NT 0800', birthdate: '1972-12-07', email: 'niadlamini07121972@example.com' },
    '61400500849': { name: 'Andrej Nikolaevich Ivanov', address: '60 Exhibition St, Melbourne VIC 3000', birthdate: '1964-11-08', email: 'ivanov08111964@yahoo.com' },
    '61400500850': { name: 'Gabriela Sofia Torres', address: '600 Sussex St, Sydney NSW 2000', birthdate: '1987-05-25', email: 'user8021@outlook.com' },
    '61400500851': { name: 'Hassan Youssef El-Sayed', address: '10 Wellington St, Perth WA 6000', birthdate: '1993-07-11', email: 'el-sayedhassan@gmail.com' },
    '61400500852': { name: 'Emily Rose Parker', address: '21 Currie St, Adelaide SA 5000', birthdate: '1986-01-17', email: 'emilyparker17011986@example.com' },
    '61400500853': { name: 'Daniel Alejandro Vargas', address: '100 Edward St, Brisbane QLD 4000', birthdate: '1969-11-25', email: 'danielv25111969@example.com' },
    '61400500854': { name: 'Aisha Fatoumata Traoré', address: '8 Collins St, Hobart TAS 7000', birthdate: '1986-09-12', email: 'traore.aisha@outlook.com' },
    '61400500855': { name: 'Samuel David Kim', address: '5 National Circuit, Canberra ACT 2600', birthdate: '1999-06-19', email: 'samuel.kim19@yahoo.com' },
    '61400500856': { name: 'Isabella Grace Moretti', address: '12 Woods St, Darwin NT 0800', birthdate: '1954-09-08', email: 'isabellam08091954@gmail.com' },
    '61400500857': { name: 'Ahmed Samir Mahmoud', address: '15 La Trobe St, Melbourne VIC 3000', birthdate: '1969-05-22', email: 'mahmoud22051969@gmail.com' },
    '61400500858': { name: 'Anna Viktoria Johansson', address: '700 George St, Sydney NSW 2000', birthdate: '1981-08-05', email: 'johansson05081981@gmail.com' },
    '61400500859': { name: 'Juan Carlos Ramirez', address: '14 Milligan St, Perth WA 6000', birthdate: '1953-02-06', email: 'juan.ramirez@yahoo.com' },
    '61400500860': { name: 'Leila Yasmin Farouk', address: '27 King William St, Adelaide SA 5000', birthdate: '1976-01-22', email: 'leilaf22011976@example.com' },
    '61400500861': { name: 'Michael Andrew Brown', address: '120 Charlotte St, Brisbane QLD 4000', birthdate: '1988-05-03', email: 'michael.andrew.brown@example.com' },
    '61400500862': { name: 'Priya Suresh Patel', address: '20 Argyle St, Hobart TAS 7000', birthdate: '1962-09-22', email: 'patel.priya@outlook.com' },
    '61400500863': { name: 'Sofia Maria Dimitriou', address: '6 London Circuit, Canberra ACT 2601', birthdate: '1954-11-24', email: 'sofia.maria.dimitriou@outlook.com' },
    '61400500864': { name: 'David Emmanuel Mensah', address: '18 Knuckey St, Darwin NT 0800', birthdate: '1974-04-01', email: 'user1937@gmail.com' },
    '61400500865': { name: 'Yuki Haruto Nakamura', address: '80 Bourke St, Melbourne VIC 3000', birthdate: '1986-10-20', email: 'user4443@outlook.com' },
    '61400500866': { name: 'Fatima Noor Siddiqui', address: '800 Pitt St, Sydney NSW 2000', birthdate: '1975-05-17', email: 'fatima17051975@example.com' },
    '61400500867': { name: 'Lucas Gabriel Oliveira', address: '16 St Georges Terrace, Perth WA 6000', birthdate: '1995-10-24', email: 'user4224@example.com' },
    '61400500868': { name: 'Chloe Isabelle Martin', address: '31 Grenfell St, Adelaide SA 5000', birthdate: '1959-01-05', email: 'chloe05011959@outlook.com' },
    '61400500869': { name: 'Rajiv Prakash Mehra', address: '130 Mary St, Brisbane QLD 4000', birthdate: '1967-10-03', email: 'mehra03101967@example.com' },
    '61400500870': { name: 'Maria Teresa Santos', address: '24 Macquarie St, Hobart TAS 7000', birthdate: '1999-11-29', email: 'maria29111999@outlook.com' },
    '61400500871': { name: 'Ethan William Harris', address: '8 Marcus Clarke St, Canberra ACT 2601', birthdate: '1985-06-07', email: 'ethanharris07061985@example.com' },
    '61400500872': { name: 'Amira Layla Hassan', address: '22 Mitchell St, Darwin NT 0800', birthdate: '1953-03-13', email: 'amira.hassan13@outlook.com' },
    '61400500873': { name: 'Tomasz Piotr Zielinski', address: '90 Collins St, Melbourne VIC 3000', birthdate: '1973-04-11', email: 'tomasz.zielinski@outlook.com' },
    '61400500874': { name: 'Anna Katarzyna Nowak', address: '900 George St, Sydney NSW 2000', birthdate: '1970-09-22', email: 'nowak22091970@yahoo.com' },
    '61400500875': { name: 'Samuel Kwabena Boateng', address: '18 Pier St, Perth WA 6000', birthdate: '1999-05-28', email: 'samuel28051999@outlook.com' },
    '61400500876': { name: 'Isabella Lucia Romano', address: '35 King William St, Adelaide SA 5000', birthdate: '1973-08-24', email: 'user2067@gmail.com' },
    '61400500877': { name: 'Ahmed Tariq Al-Mansoori', address: '140 Creek St, Brisbane QLD 4000', birthdate: '1970-07-31', email: 'user9458@outlook.com' },
    '61400500878': { name: 'Emily Charlotte Davies', address: '28 Elizabeth St, Hobart TAS 7000', birthdate: '1963-07-07', email: 'daviesemily@yahoo.com' },
    '61400500879': { name: 'Daniel Sebastian Weber', address: '10 Allara St, Canberra ACT 2601', birthdate: '1985-11-25', email: 'user4052@outlook.com' },
    '61400500880': { name: 'Sofia Elena Popescu', address: '30 Cavenagh St, Darwin NT 0800', birthdate: '2004-03-11', email: 'sofia.popescu11@gmail.com' },
    '61400500881': { name: 'Hassan Omar Abdallah', address: '100 Flinders St, Melbourne VIC 3000', birthdate: '1956-10-05', email: 'hassan.abdallah@example.com' },
    '61400500882': { name: 'Priya Anjali Sharma', address: '1000 Pitt St, Sydney NSW 2000', birthdate: '1989-03-27', email: 'priya27031989@yahoo.com' },
    '61400500883': { name: 'Lucas Rafael Costa', address: '20 Hay St, Perth WA 6000', birthdate: '1984-07-20', email: 'lucas20071984@gmail.com' },
    '61400500884': { name: 'Chloe Amelia Thompson', address: '41 Currie St, Adelaide SA 5000', birthdate: '1972-04-13', email: 'chloethompson13041972@example.com' },
    '61400500885': { name: 'Rajesh Anand Kumar', address: '150 Ann St, Brisbane QLD 4000', birthdate: '1963-12-04', email: 'kumar04121963@example.com' },
    '61400500886': { name: 'Maria Clara Souza', address: '32 Murray St, Hobart TAS 7000', birthdate: '1985-05-22', email: 'souzamaria@gmail.com' },
    '61400500887': { name: 'Ethan Joseph Murphy', address: '12 National Circuit, Canberra ACT 2600', birthdate: '1991-07-29', email: 'murphyethan@gmail.com' },
    '61400500888': { name: 'Leila Yasmin Rahman', address: '35 Woods St, Darwin NT 0800', birthdate: '1970-03-04', email: 'rahman04031970@outlook.com' },
    '61400500889': { name: 'Tomasz Andrzej Kowalski', address: '110 Bourke St, Melbourne VIC 3000', birthdate: '1952-01-16', email: 'tomaszkowalski16011952@yahoo.com' },
    '61400500890': { name: 'Anna Maria Petrova', address: '1100 George St, Sydney NSW 2000', birthdate: '1966-04-21', email: 'anna.petrova@example.com' },
    '61400500891': { name: 'Samuel Oluwaseyi Adeyemi', address: '22 Wellington St, Perth WA 6000', birthdate: '1955-03-16', email: 'samuel.oluwaseyi.adeyemi@yahoo.com' },
    '61400500892': { name: 'Isabella Sofia Costa', address: '43 Franklin St, Adelaide SA 5000', birthdate: '1962-11-22', email: 'isabella.costa22@outlook.com' },
    '61400500893': { name: 'Ahmed Karim El-Sayed', address: '160 Edward St, Brisbane QLD 4000', birthdate: '1957-04-30', email: 'ahmed.el-sayed30@outlook.com' },
    '61400500894': { name: 'Emily Grace Robinson', address: '36 Collins St, Hobart TAS 7000', birthdate: '1976-04-12', email: 'emilyrobinson12041976@example.com' },
    '61400500895': { name: 'Daniel George Papadopoulos', address: '14 Constitution Ave, Canberra ACT 2600', birthdate: '1955-07-19', email: 'papadopoulos19071955@gmail.com' },
    '61400500896': { name: 'Sofia Maria Rossi', address: '50 Knuckey St, Darwin NT 0800', birthdate: '1957-08-16', email: 'rossi.sofia@yahoo.com' },
    '61400500897': { name: 'Hassan Ali Rahman', address: '120 Exhibition St, Melbourne VIC 3000', birthdate: '1989-01-06', email: 'rahman.hassan@yahoo.com' },
    '61400500898': { name: 'Priya Ramesh Kumar', address: '1200 Pitt St, Sydney NSW 2000', birthdate: '1962-07-03', email: 'priyak03071962@outlook.com' },
    '61400500899': { name: 'Lucas Daniel Ferreira', address: '24 Barrack St, Perth WA 6000', birthdate: '1979-11-01', email: 'lucas01111979@outlook.com' },
    '61400500900': { name: 'Chloe Mae Evans', address: '45 Pulteney St, Adelaide SA 5000', birthdate: '1980-01-20', email: 'chloe.evans20@outlook.com' },
};

const defaultKycData = {
    name: 'Michael Jackson',
    address: '242 Exhibition St, Melbourne',
    email: 'michael.hehe@gmail.com',
    birthdate: '1958-08-29'
};

// Store KYC Fill data for validation
let storedKycFillData = {};

// Convert date from dd/mm/yyyy to yyyy-mm-dd format for HTML date inputs
function convertDateFormat(dateString) {
    if (!dateString) return '';
    
    // Check if already in yyyy-mm-dd format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
    }
    
    // Convert from dd/mm/yyyy to yyyy-mm-dd
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateString; // Return as-is if format not recognized
}

export async function kycFill(phoneNumber) {
    const response = await post(`${API_BASE_URL}/kyc-fill-in/kyc-fill-in/v0.4/fill-in`, { phoneNumber });
    const kycData = {
        phoneNumber: response.phoneNumber,
        idDocument: response.idDocument,
        name: response.name || '',
        address: response.address || '',
        email: response.email || '',
        birthdate: convertDateFormat(response.birthdate) || ''
    };
    storedKycFillData[phoneNumber] = kycData;
    return kycData;
}

export function locationRetrieval(phoneNumber, mockCoordinates) {
    // Use real API to showcase Network API capabilities
    return post('https://network-as-code.p-eu.rapidapi.com/location-retrieval/v0/retrieve', {
        device: {
            phoneNumber
        },
        maxAge: 60
    });
}

export function locationVerification(data, mockResult = "TRUE") {
    // Real API call
    return post('https://network-as-code.p-eu.rapidapi.com/location-verification/v1/verify', data);
    
    // Mock implementation (commented out)
    // return new Promise(resolve => {
    //     setTimeout(() => {
    //         const response = {
    //             verificationResult: mockResult
    //         };
    //         resolve(response);
    //     }, 500);
    // });
}

export function createGeofencingSubscription(phoneNumber, latitude, longitude, radius) {
    return post('https://network-as-code.p-eu.rapidapi.com/geofencing-subscriptions/v0.3/subscriptions', {
        protocol: "HTTP",
        sink: "https://notificationSendServer12.supertelco.com",
        types: ["org.camaraproject.geofencing-subscriptions.v0.area-entered"],
        config: {
            subscriptionDetail: {
                device: { phoneNumber },
                area: {
                    areaType: "CIRCLE",
                    center: { latitude, longitude },
                    radius
                }
            },
            initialEvent: true,
            subscriptionMaxEvents: 10,
            subscriptionExpireTime: "2045-03-22T05:40:58.469Z"
        }
    });
    /* return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                subscriptionId: "sub-geo-" + Math.floor(Math.random() * 10000),
                startsAt: new Date().toISOString(),
                expiresAt: "2026-03-20T05:40:58.469Z"
            });
        }, 500);
    }); */
}

export function deleteGeofencingSubscription(subscriptionId) {
    return axios.delete(`https://network-as-code.p-eu.rapidapi.com/geofencing-subscriptions/v0.3/subscriptions/${subscriptionId}`, { headers: defaultHeaders })
        .then(response => response.data || { status: "deleted" })
        .catch(error => {
            throw error;
        });
}

export function carrierBilling(phoneNumber) {
    // Mocking Carrier Billing API
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                paymentId: "tx-" + Math.floor(Math.random() * 100000),
                amountTransaction: {
                    phoneNumber: phoneNumber,
                    clientCorrelator: "visit-20260122-OPD-8392",
                    paymentAmount: {
                        chargingInformation: {
                            amount: 450.00,
                            currency: "EUR",
                            description: "Hospital checkout charges (Consultation + Lab tests)"
                        }
                    },
                    referenceCode: "ref-hosp-OPD-8392-20260122"
                },
                paymentStatus: "succeeded",
                paymentCreationDate: new Date().toISOString()
            });
        }, 1000);
    });
}


export async function completeCheckIn(phoneNumber, hospitalLocation, addMessage, setPatientStatus, logApi, broadcast) {
    addMessage("Doctor confirmed check-in. Completing check-in process...");
    setPatientStatus("Checked In");
    addMessage("Welcome to CityCare Hospital Barcelona!");
    addMessage("Patient check-in complete.");

    // Broadcast to ER Dashboard to update patient status (not remove)
    if (broadcast) {
        broadcast('PATIENT_CHECKED_IN', { phoneNumber, status: 'CHECKED_IN' });
    }

    addMessage("Creating Geofencing Subscription for patient monitoring...");
    const geoSub = await createGeofencingSubscription(phoneNumber, hospitalLocation.lat, hospitalLocation.lng, 1000);
    
    // Broadcast to ER Dashboard to show geofencing circle
    if (broadcast) {
        broadcast('SHOW_GEOFENCE_CIRCLE', { radius: 1000 });
    }
    if (logApi) logApi('Create Geofencing Subscription', 'POST', '/geofencing-subscriptions/v0.3/subscriptions', {
        protocol: "HTTP",
        sink: "https://notificationSendServer12.supertelco.com",
        types: ["org.camaraproject.geofencing-subscriptions.v0.area-entered"],
        config: {
            subscriptionDetail: {
                device: { phoneNumber },
                area: {
                    areaType: "CIRCLE",
                    center: { latitude: hospitalLocation.lat, longitude: hospitalLocation.lng },
                    radius: 1000
                }
            },
            initialEvent: true,
            subscriptionMaxEvents: 10,
            subscriptionExpireTime: "2026-03-20T05:40:58.469Z"
        }
    }, geoSub);
    const subId = geoSub.id || geoSub.subscriptionId;
    addMessage(`Geofencing Subscription Created: ID ${subId}`);

    return subId;
}

export async function startMedicalTransportSequence(phoneNumber, initialUserLocation, hospitalLocation, addMessage, setLocation, setUserGps, setPatientStatus, setPatientMedicalDetails, generateRoute, setArtificialTime, logApi, broadcast, patientData) {
    addMessage("Starting Medical Transport sequence...");

    await new Promise(resolve => setTimeout(resolve, 1000));
    setPatientMedicalDetails({
        patientId: patientData.id, // Use the CIP-SNS ID from patientData
        alert: 'INCOMING PATIENT - High-level symptoms: Chest pains and intermittent consciousness',
        esi: 'Level 2 (Emergency)',
        vitals: '♥ HR: 120 bpm | 🩸 BP: 160/110 mmHg | 🫁 O₂: 93% | 🌡 T: 37.2°C',
        complaint: 'Acute chest pain with radiation to left arm',
        eta: 'Calculating...',
        medicalHistory: '',
        treatmentNeeds: { specialists: [], equipment: [] },
    });

    await new Promise(resolve => setTimeout(resolve, 1000));
    addMessage("Patient transport initiated.");

    const d = new Date();
    const datePrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const route = generateRoute(initialUserLocation, hospitalLocation, 6);
    const timeSteps = [
        { time: `${datePrefix}T14:30:00`, delay: 2000 }, // 30 mins
        { time: `${datePrefix}T14:35:00`, delay: 2000 }, // 25 mins
        { time: `${datePrefix}T14:40:00`, delay: 2000 }, // 20 mins
        { time: `${datePrefix}T14:45:00`, delay: 2000 }, // 15 mins
        { time: `${datePrefix}T14:50:00`, delay: 2000 }, // 10 mins
        { time: `${datePrefix}T14:55:00`, delay: 2000 }, // 5 mins
        { time: `${datePrefix}T15:00:00`, delay: 2000 }, // 0 mins
    ];

    for (let i = 0; i < route.length; i++) {
        const step = timeSteps[i] || timeSteps[timeSteps.length - 1];
        const currentLocation = route[i];
        const totalSteps = route.length -1;
        const stepsRemaining = totalSteps - i;
        const durationMinutes = Math.round(5 * stepsRemaining); // 5 mins per step
        
        // Set artificial time first
        setArtificialTime(new Date(step.time));
        
        // Calculate ETA based on artificial time
        const etaString = `${durationMinutes} min`;
        
        // Log API Interaction
        const locReq = { device: { phoneNumber } };
        const locRes = await locationRetrieval(phoneNumber, currentLocation);
        if (logApi) logApi('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', locReq, locRes);

        setLocation(locRes);
        setUserGps(currentLocation);
        
        // Broadcast location update to ER Dashboard
        if (broadcast && patientData) {
            const updatedDistance = getDistanceFromLatLonInMeters(currentLocation.lat, currentLocation.lng, hospitalLocation.lat, hospitalLocation.lng);
            const updatedDistanceKm = (updatedDistance / 1000).toFixed(1);
            const updateData = {
                phoneNumber: patientData.phoneNumber,
                location: currentLocation,
                distance: `${updatedDistanceKm} km`,
                eta: etaString
            };
            console.log('Broadcasting PATIENT_STATUS_UPDATE:', updateData);
            broadcast('PATIENT_STATUS_UPDATE', updateData);
        }
        
        addMessage(`Patient location: ${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)} | ETA: ${etaString}`);
        
        let newVitals = null;
        let medicalHistory = null;
        let specialistsNeeded = null;
        let equipmentNeeded = null;
        
        if (i === 1) {
            medicalHistory = 'Hypertension (diagnosed 2018), Type 2 Diabetes (controlled), Previous MI (2020)';
            setPatientMedicalDetails(prev => ({
                ...prev,
                medicalHistory
            }));
            // Update vitals at step 1
            newVitals = '♥ HR: 115 bpm | 🩸 BP: 158/108 mmHg | 🫁 O₂: 94% | 🌡 T: 37.1°C';
        } else if (i === 2) {
            specialistsNeeded = ['Cardiologist', 'Emergency Physician'];
            setPatientMedicalDetails(prev => ({
                ...prev,
                treatmentNeeds: {
                    specialists: specialistsNeeded,
                    equipment: []
                }
            }));
            await new Promise(resolve => setTimeout(resolve, 1500));
            equipmentNeeded = ['Defibrillator', 'ECG', 'Cardiac Monitor', 'Oxygen Supply'];
            setPatientMedicalDetails(prev => ({
                ...prev,
                treatmentNeeds: {
                    ...prev.treatmentNeeds,
                    equipment: equipmentNeeded
                }
            }));
        } else if (i === 4) {
            newVitals = '♥ HR: 105 bpm | 🩸 BP: 145/100 mmHg | 🫁 O₂: 97% | 🌡 T: 36.9°C';
            
            // Generate AI summary when patient is about to reach (10 min ETA)
            if (broadcast && patientData && patientData.chiefComplaint) {
                const aiSummary = generateAISummary(patientData.chiefComplaint);
                broadcast('PATIENT_STATUS_UPDATE', {
                    phoneNumber: patientData.phoneNumber,
                    aiSummary
                });
            }
        }

        setPatientMedicalDetails(prev => ({ ...prev, eta: etaString, ...(newVitals ? { vitals: newVitals } : {}) }));
        
        // Broadcast medical updates to ER Dashboard
        if (broadcast && patientData && (newVitals || medicalHistory || specialistsNeeded || equipmentNeeded)) {
            const medicalUpdate = {
                phoneNumber: patientData.phoneNumber,
                ...(newVitals && { vitals: newVitals }),
                ...(medicalHistory && { medicalHistory }),
                ...(specialistsNeeded && { specialistsNeeded }),
                ...(equipmentNeeded && { equipmentNeeded })
            };
            console.log('Broadcasting PATIENT_STATUS_UPDATE (medical):', medicalUpdate);
            broadcast('PATIENT_STATUS_UPDATE', medicalUpdate);
        }
        await new Promise(resolve => setTimeout(resolve, step.delay));
    }

    addMessage("Patient has arrived within the hospital vicinity.");

    await new Promise(resolve => setTimeout(resolve, 1500));
    await new Promise(resolve => setTimeout(resolve, 1500));

    const locationVerificationData = {
        device: { phoneNumber: phoneNumber },
        area: {
            areaType: "CIRCLE",
            center: { latitude: hospitalLocation.lat, longitude: hospitalLocation.lng },
            radius: 10000  // 10km radius for verification
        }
    };

    const verification = await locationVerification(locationVerificationData);
    if (logApi) logApi('Location Verification', 'POST', '/location-verification/v1/verify', locationVerificationData, verification);

    if (verification.verificationResult === "TRUE" || verification.verificationResult === true || (verification.matchRate && verification.matchRate > 80)) {
        addMessage("Location verified - Patient arrived at hospital!");
        addMessage("Waiting for doctor to confirm check-in...");
        
        setPatientStatus("Awaiting Check-in");
        
        // Broadcast arrival status to ER Dashboard
        if (broadcast && patientData) {
            broadcast('PATIENT_STATUS_UPDATE', {
                phoneNumber: patientData.phoneNumber,
                eta: 'ARRIVED',
                status: 'ARRIVED'
            });
        }
        
        // Return verification status for manual check-in
        return { verified: true, hospitalLocation };

    } else {
        addMessage("Location verification failed.");
        return { verified: false };
    }
}

export async function startPatientAbscondmentSequence(phoneNumber, initialUserLocation, hospitalLocation, addMessage, setLocation, setUserGps, setPatientStatus, setPatientMedicalDetails, generateRoute, setArtificialTime, guestName, logApi, setPaymentStatus, geofencingSubscriptionId, broadcast) {
    addMessage("Starting Patient Abscondment sequence...");
    
    // Ensure patient is at hospital initially
    setUserGps(hospitalLocation);
    
    // Broadcast initial hospital location to ER Dashboard with CHECKED_IN status and patient name
    if (broadcast) {
        broadcast('PATIENT_STATUS_UPDATE', {
            phoneNumber: phoneNumber,
            name: guestName,
            location: hospitalLocation,
            status: 'CHECKED_IN'
        });
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    const d = new Date();
    d.setDate(d.getDate() + 1);
    const datePrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const checkoutTime = new Date(`${datePrefix}T10:45:00`);
    setArtificialTime(checkoutTime);
    
    // Generate route moving away from hospital (move farther - south-east direction)
    const destination = {
        lat: hospitalLocation.lat - 0.04,
        lng: hospitalLocation.lng + 0.055
    };

    const route = generateRoute(hospitalLocation, destination, 4); // Fewer steps for faster movement
    const geofenceRadius = 1000; // Increased to 1000m to match ER Dashboard geofence circle
    let geofenceBreached = false;

    for (let i = 0; i < route.length; i++) {
        const currentLocation = route[i];
        const stepTime = new Date(checkoutTime.getTime() + i * 1 * 60000);
        setArtificialTime(stepTime);
        
        // Log API Interaction
        const locReq = { device: { phoneNumber } };
        const locRes = await locationRetrieval(phoneNumber, currentLocation);
        if (logApi) logApi('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', locReq, locRes);

        setLocation(locRes);
        setUserGps(currentLocation);
        addMessage(`Patient location: ${currentLocation.lat.toFixed(4)}, ${currentLocation.lng.toFixed(4)}`);

        // Broadcast location update to ER Dashboard with patient name
        if (broadcast) {
            broadcast('PATIENT_STATUS_UPDATE', {
                phoneNumber: phoneNumber,
                name: guestName,
                location: currentLocation
            });
        }

        // Check Geofence - only change status after step 2 (patient has moved significantly away)
        const distance = getDistanceFromLatLonInMeters(hospitalLocation.lat, hospitalLocation.lng, currentLocation.lat, currentLocation.lng);
        
        if (!geofenceBreached && distance > geofenceRadius && i >= 2) {
            geofenceBreached = true;
            addMessage(`Alert! Patient ${guestName} has left the premises. Contact at ${phoneNumber}`);
            setPatientMedicalDetails({ patientId: '', alert: `Alert! Patient ${guestName} has left the premises. Contact at ${phoneNumber}`, esi: '', vitals: '', complaint: '', eta: '', medicalHistory: '', treatmentNeeds: { specialists: [], equipment: [] } });
            
            // Broadcast LEFT_AMA status to ER Dashboard with patient name
            if (broadcast) {
                broadcast('PATIENT_STATUS_UPDATE', {
                    phoneNumber: phoneNumber,
                    name: guestName,
                    status: 'LEFT_AMA',
                    eta: 'Absconding'
                });
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    addMessage("Patient has left the premises.");
    
    const locationVerificationData = {
        device: { phoneNumber: phoneNumber },
        area: {
            areaType: "CIRCLE",
            center: { latitude: hospitalLocation.lat, longitude: hospitalLocation.lng }, 
            radius: geofenceRadius 
        }
    };
    const verRes = await locationVerification(locationVerificationData, "FALSE");
    if (logApi) logApi('Location Verification', 'POST', '/location-verification/v1/verify', locationVerificationData, verRes);

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Carrier Billing Logic
    const billingReq = {
        "amountTransaction": {
            "phoneNumber": phoneNumber,
            "clientCorrelator": "visit-20260122-OPD-8392",
            "paymentAmount": {
                "chargingInformation": {
                    "amount": 450.00,
                    "currency": "EUR",
                    "description": "Hospital checkout charges (Consultation + Lab tests)",
                    "isTaxIncluded": true
                },
                "chargingMetaData": {
                    "merchantName": "CityCare Hospital",
                    "merchantIdentifier": "citycare-7221",
                    "purchaseCategoryCode": "healthcare",
                    "channel": "inperson",
                    "serviceId": "OPD-checkout",
                    "productId": "OPD-8392"
                },
                "paymentDetails": [
                    {
                        "id": "consult-001",
                        "amount": 300,
                        "currency": "EUR",
                        "description": "Doctor Consultation"
                    },
                    {
                        "id": "lab-102",
                        "amount": 150,
                        "currency": "INR",
                        "description": "Blood Test Panel"
                    }
                ]
            },
            "referenceCode": "ref-hosp-OPD-8392-20260122"
        },
        "webhook": {
            "notificationUrl": "https://hospital.example.com/api/billing/callback",
            "notificationCorrelationId": "cb-hosp-OPD-8392"
        }
    };

    //const billingRes = await carrierBilling(phoneNumber);
    // if (logApi) logApi('Carrier Billing', 'POST', '/carrier-billing/payment/v1/charge', billingReq, billingRes);

    /*if (billingRes.paymentStatus === 'succeeded') {
        addMessage("Carrier Billing Successful. Amount: 450.00 EUR");
        if (setPaymentStatus) setPaymentStatus("Paid");
    } else {
        addMessage("Carrier Billing Failed.");
    }*/

    addMessage(`Patient ${guestName} has left the premises. Contact at ${phoneNumber}`);
    setPatientStatus("Checked Out");

    // Remove patient from ER Dashboard after 30 seconds
    setTimeout(() => {
        if (broadcast) {
            broadcast('REMOVE_PATIENT', { phoneNumber });
            addMessage(`Patient record removed from ER Dashboard.`);
        }
    }, 30000);

    if (geofencingSubscriptionId) {
        try {
            const delRes = await deleteGeofencingSubscription(geofencingSubscriptionId);
            if (logApi) logApi('Delete Geofencing Subscription', 'DELETE', `/geofencing-subscriptions/v0.3/subscriptions/${geofencingSubscriptionId}`, {}, delRes);
        } catch (error) {
            const errorResponse = error.response ? { status: error.response.status, data: error.response.data } : { error: error.message };
            if (logApi) logApi('Delete Geofencing Subscription', 'DELETE', `/geofencing-subscriptions/v0.3/subscriptions/${geofencingSubscriptionId}`, {}, errorResponse);
        }
    }
}

export function deviceStatus(phoneNumber) {
    // return post(`${API_BASE_URL}/device-status/device-reachability-status/v1/retrieve`, { device: { phoneNumber } });
    // Mocking Device Status API
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                reachable: 'true',
                connectivity: ['DATA'],
                lastStatusTime: new Date()
            });
        }, 500);
    });
}

export function deviceConnectivity(phoneNumber) {
    // return post(`https://network-as-code.p-eu.rapidapi.com/device-status/v0/connectivity`, { device: { phoneNumber } });
    // Mocking Device Connectivity API
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                connectivityStatus: "CONNECTED_DATA"
            });
        }, 500);
    });
}

export function createDeviceReachabilitySubscription(phoneNumber) {
    // return post(`${API_BASE_URL}/device-status/device-reachability-status-subscriptions/v0.7/subscriptions`, {
    //     protocol: "HTTPS",
    //     sink: "https://client-app.com/callback",
    //     types: ["org.camara.device-reachability-status.v0.reachability-status-change"],
    //     config: {
    //         subscriptionDetail: {
    //             device: { phoneNumber }
    //         },
    //         initialEvent: true,
    //         subscriptionExpireTime: "2025-12-31T23:59:59Z",
    //         subscriptionMaxEvents: 10
    //     }
    // });
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                subscriptionId: "sub-reach-" + Math.floor(Math.random() * 10000),
                startsAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 86400000).toISOString()
            });
        }, 500);
    });
}

export function deleteDeviceReachabilitySubscription(subscriptionId) {
    // return axios.delete(`${API_BASE_URL}/device-status/device-reachability-status-subscriptions/v0.7/subscriptions/${subscriptionId}`, { headers: defaultHeaders });
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                status: "deleted"
            });
        }, 500);
    });
}

export function scamSignal(phoneNumber) {
    // NOTE: 'scam-signal' is NOT a standard CAMARA API.
    // The endpoint below is hypothetical and constructed based on the project's API naming conventions for demo purposes.
    // return post(`${API_BASE_URL}/scam-signal/scam-signal/v0/check`, { phoneNumber });
    // Mocking Scam Signal API
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({
                scamDetected: false,
                riskLevel: 'Low'
            });
        }, 500);
    });
}

export async function startOutpatientMonitoringSequence(phoneNumber, initialUserLocation, addMessage, setLocation, setUserGps, setOutpatientStatus, setArtificialTime, logApi) {
    addMessage("Starting Outpatient Monitoring Sequence...");
    setOutpatientStatus("Monitoring Active");

    // 0. Phone Number Verification (for each outpatient)
    addMessage("Step 0: Verifying Phone Number for Outpatient...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const phoneVerifyRes = await verifyPhoneNumber(phoneNumber);
    if (logApi) logApi('Number Verification', 'POST', '/number-verification/number-verification/v0/verify', { phoneNumber }, phoneVerifyRes);
    
    if (phoneVerifyRes.devicePhoneNumberVerified !== true) {
        addMessage("Phone number verification failed for outpatient monitoring.");
        setOutpatientStatus("Phone Verification Failed");
        return;
    }
    addMessage("Phone number verified for outpatient monitoring.");

    // 1. Identity Verification
    addMessage("Step 1: Verifying Patient Identity & Integrity...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const verifyRes = await verifyPhoneNumber(phoneNumber);
    if (logApi) logApi('Number Verification', 'POST', '/number-verification/number-verification/v0/verify', { phoneNumber }, verifyRes);

    const simCheck = await simSwap(phoneNumber);
    if (logApi) logApi('SIM Swap', 'POST', '/sim-swap/sim-swap/v0/check', { phoneNumber, maxAge: 240 }, simCheck);

    const deviceCheck = await deviceSwap(phoneNumber);
    if (logApi) logApi('Device Swap', 'POST', '/device-swap/device-swap/v0.1/check', { phoneNumber, maxAge: 240 }, deviceCheck);
    
    const recyclingCheck = await numberRecycling(phoneNumber);
    if (logApi) logApi('Number Recycling', 'POST', '/number-recycling/v1/check', { phoneNumber }, recyclingCheck);

    if (simCheck.swapped || deviceCheck.swapped || recyclingCheck.recycled) {
        addMessage("Warning: Identity Integrity issue detected (SIM/Device Swap or Number Recycled).");
    } else {
        addMessage("Identity Integrity Verified: SIM, Device and Number OK.");
    }

    // 1.5 Establish Baseline Location
    addMessage("Establishing Baseline Location...");
    const baselineLocRes = await locationRetrieval(phoneNumber);
    if (logApi) logApi('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', { device: { phoneNumber } }, baselineLocRes);
    
    if (baselineLocRes.area && baselineLocRes.area.center) {
        initialUserLocation = { 
            lat: baselineLocRes.area.center.latitude, 
            lng: baselineLocRes.area.center.longitude 
        };
        setUserGps(initialUserLocation);
        addMessage(`Baseline Location: ${initialUserLocation.lat.toFixed(4)}, ${initialUserLocation.lng.toFixed(4)}`);
    }

    // 2. Create Subscription
    addMessage("Step 2: Creating Device Reachability Subscription...");
    const sub = await createDeviceReachabilitySubscription(phoneNumber);
    if (logApi) logApi('Create Subscription', 'POST', '/device-reachability-status/v0/subscriptions', {
        protocol: "HTTPS",
        sink: "https://client-app.com/callback",
        types: ["org.camara.device-reachability-status.v0.reachability-status-change"],
        config: {
            subscriptionDetail: {
                device: { phoneNumber }
            },
            initialEvent: true
        }
    }, sub);

    const subId = sub.subscriptionId || sub.id;
    addMessage(`Subscription Created: ID ${subId}`);
    addMessage("Subscription active. Listening for reachability events...");

    // 3. Monitoring Loop
    addMessage("Step 3: Initiating Periodic Monitoring (Simulating Event Stream)...");
    
    const monitoringSteps = [
        { timeOffset: 0, note: "Baseline check. Status Normal." },
        { timeOffset: 15, note: "Routine check. No movement detected (Stationary)." },
        { timeOffset: 30, note: "Routine check. Anomaly detection..." }
    ];

    for (let i = 0; i < monitoringSteps.length; i++) {
        const step = monitoringSteps[i];
        const now = new Date();
        now.setMinutes(now.getMinutes() + step.timeOffset);
        setArtificialTime(now);
        
        addMessage(`--- Monitoring Cycle [T+${step.timeOffset}m] ---`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // a. Location
        addMessage("[Polling API] Calling Location Retrieval...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const locRes = await locationRetrieval(phoneNumber);
        // Log API Interaction
        if (logApi) logApi('Location Retrieval', 'POST', '/location-retrieval/v0/retrieve', { device: { phoneNumber } }, locRes);

        setLocation(locRes);
        
        if (locRes.area && locRes.area.center) {
            const currentLoc = { lat: locRes.area.center.latitude, lng: locRes.area.center.longitude };
            setUserGps(currentLoc);
            addMessage(`Location: ${currentLoc.lat.toFixed(4)}, ${currentLoc.lng.toFixed(4)}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        // b. Device Status (Subscription Notification)
        // In a real scenario, this is a webhook event pushed to us, not a call we make.
        if (subId) {
            addMessage(`[Async Event] Reachability Update via Sub ${subId}: Connected (5G)`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

        // c. Scam Signal
        // Commented out as Scam Signal is not yet supported by CAMARA
        /* addMessage("[Polling API] Calling Scam Signal Check...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        let scamRes = await scamSignal(phoneNumber);
        if (logApi) logApi('Scam Signal', 'POST', '/scam-signal/scam-signal/v0/check', { phoneNumber }, scamRes);
        
        // Simulate Anomaly in the last step
        if (i === monitoringSteps.length - 1) {
            scamRes = { scamDetected: true, riskLevel: 'High' };
        }

        if (scamRes.scamDetected) {
                addMessage("!!! ANOMALY DETECTED: Scam Signal Positive !!!");
                addMessage(`Risk Level: ${scamRes.riskLevel}`);
                setOutpatientStatus("Anomaly: Scam Suspected");
                addMessage("Action Triggered: Initiating patient reach-out protocol (Phone Call/Visit).");
                
                addMessage(`Deleting Subscription ${subId}...`);
                await deleteDeviceReachabilitySubscription(subId);
                if (logApi) logApi('Delete Subscription', 'DELETE', `/device-reachability-status/v0/subscriptions/${subId}`, {}, { status: "deleted" });
                return; 
        } else {
            addMessage("Scam Signal: Negative.");
        } */

        // c. Device Status (Reachability) & Connectivity
        addMessage("[Polling API] Calling Device Status & Connectivity Check...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        let devRes = await deviceStatus(phoneNumber);
        let connRes = await deviceConnectivity(phoneNumber);
        
        // Simulate Anomaly in the last step
        if (i === monitoringSteps.length - 1) {
            devRes = { reachable: 'false', connectivity: [], lastStatusTime: new Date() };
            connRes = { connectivityStatus: "NOT_CONNECTED" };
        }

        if (logApi) logApi('Device Status', 'POST', '/device-status/device-reachability-status/v1/retrieve', { device: { phoneNumber } }, devRes);

        if (devRes.reachable === 'false' || connRes.connectivityStatus === 'NOT_CONNECTED') {
                addMessage("!!! ANOMALY DETECTED: Device Unreachable / Not Connected !!!");
                setOutpatientStatus("Anomaly: Device Unreachable");
                addMessage("Action Triggered: Initiating patient reach-out protocol (Phone Call/Visit).");
                
                addMessage(`Deleting Subscription ${subId}...`);
                await deleteDeviceReachabilitySubscription(subId);
                if (logApi) logApi('Delete Subscription', 'DELETE', `/device-reachability-status/v0/subscriptions/${subId}`, {}, { status: "deleted" });
                return; 
        } else {
            addMessage(`Device Status: Reachable. Connectivity: ${connRes.connectivityStatus}`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    addMessage(`Deleting Subscription ${subId}...`);
    await deleteDeviceReachabilitySubscription(subId);
    if (logApi) logApi('Delete Subscription', 'DELETE', `/device-reachability-status/v0/subscriptions/${subId}`, {}, { status: "deleted" });
    setOutpatientStatus("Monitoring Cycle Complete");
}

