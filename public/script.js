// Global Variables
let currentCall = null;
let callTimer = null;
let callDuration = 0;
let patients = [];
let callHistory = [];
let isMuted = false;
let isOnHold = false;
let isRecording = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadDashboardData();
    loadPatients();
    loadCallHistory();
    setCurrentDate();
});

// Initialize Application
function initializeApp() {
    console.log('104 Medical Helpline CRM Initialized');
    updateStats();
}

// Tab Switching
function switchTab(tabName) {
    // Hide all tabs
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Remove active class from all nav items
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    
    // Add active class to clicked nav item
    event.target.classList.add('active');
}

// Dashboard Functions
function loadDashboardData() {
    // Simulate loading dashboard data
    const stats = {
        totalCalls: Math.floor(Math.random() * 100) + 50,
        resolvedCalls: Math.floor(Math.random() * 80) + 40,
        avgTime: Math.floor(Math.random() * 120) + 30,
        emergencyCalls: Math.floor(Math.random() * 20) + 5
    };
    
    updateStats(stats);
}

function updateStats(stats = {}) {
    document.getElementById('totalCalls').textContent = stats.totalCalls || 0;
    document.getElementById('resolvedCalls').textContent = stats.resolvedCalls || 0;
    document.getElementById('avgTime').textContent = (stats.avgTime || 0) + 's';
    document.getElementById('emergencyCalls').textContent = stats.emergencyCalls || 0;
}

// Phone Dialer Functions
function dialNumber(num) {
    const phoneInput = document.getElementById('phoneNumber');
    phoneInput.value += num;
}

function clearNumber() {
    document.getElementById('phoneNumber').value = '';
}

function initiateCall() {
    const phoneNumber = document.getElementById('phoneNumber').value;
    
    if (!phoneNumber) {
        alert('Please enter a phone number');
        return;
    }
    
    // Initiate real call via API
    fetch('/api/calls/initiate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            to: phoneNumber,
            agentId: 1, // Default agent
            callType: 'general'
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentCall = {
                number: phoneNumber,
                startTime: new Date(),
                status: 'connecting',
                callId: data.callId
            };
            
            updateCallStatus('Connecting...');
            showActiveCall();
        } else {
            alert('Failed to initiate call: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error initiating call:', error);
        alert('Error initiating call. Check console for details.');
    });
}

function endCall() {
    if (!currentCall) {
        alert('No active call');
        return;
    }
    
    // End call via API
    fetch(`/api/calls/end/${currentCall.callId}`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Stop timer
            stopCallTimer();
            
            // Save to call history
            saveCallToHistory();
            
            // Reset call state
            currentCall = null;
            updateCallStatus('Call Ended');
            
            // Clear timer display after 2 seconds
            setTimeout(() => {
                updateCallStatus('Ready');
                document.getElementById('callTimer').textContent = '00:00:00';
                clearActiveCallsList();
            }, 2000);
        } else {
            alert('Failed to end call: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error ending call:', error);
        alert('Error ending call. Check console for details.');
    });
}

function updateCallStatus(status) {
    document.getElementById('callStatus').textContent = status;
}

function startCallTimer() {
    callDuration = 0;
    callTimer = setInterval(() => {
        callDuration++;
        updateCallTimerDisplay();
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
}

function updateCallTimerDisplay() {
    const hours = Math.floor(callDuration / 3600);
    const minutes = Math.floor((callDuration % 3600) / 60);
    const seconds = callDuration % 60;
    
    const display = 
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
    
    document.getElementById('callTimer').textContent = display;
}

function showActiveCall() {
    const callsList = document.getElementById('activeCallsList');
    callsList.innerHTML = `
        <div class="active-call-item">
            <h4>Active Call</h4>
            <p><strong>Number:</strong> ${currentCall.number}</p>
            <p><strong>Status:</strong> ${currentCall.status}</p>
            <p><strong>Duration:</strong> <span id="activeCallDuration">00:00</span></p>
        </div>
    `;
}

function clearActiveCallsList() {
    const callsList = document.getElementById('activeCallsList');
    callsList.innerHTML = '<p class="no-calls">No active calls</p>';
}

function toggleMute() {
    isMuted = !isMuted;
    const btn = event.target;
    btn.textContent = isMuted ? '🔊' : '🔇';
    btn.style.background = isMuted ? '#e3f2fd' : '#f5f7fa';
    updateCallStatus(isMuted ? 'Muted' : 'Connected');
}

function toggleHold() {
    isOnHold = !isOnHold;
    const btn = event.target;
    btn.textContent = isOnHold ? '▶️' : '⏸';
    btn.style.background = isOnHold ? '#e3f2fd' : '#f5f7fa';
    updateCallStatus(isOnHold ? 'On Hold' : 'Connected');
}

function transferCall() {
    if (!currentCall) {
        alert('No active call to transfer');
        return;
    }
    
    const transferTo = prompt('Enter extension or agent name to transfer:');
    if (transferTo) {
        alert(`Call transferred to ${transferTo}`);
        endCall();
    }
}

function recordCall() {
    isRecording = !isRecording;
    const btn = event.target;
    btn.style.background = isRecording ? '#ffebee' : '#f5f7fa';
    btn.style.color = isRecording ? '#c62828' : '#333';
    alert(isRecording ? 'Recording started' : 'Recording stopped');
}

// Patient Management Functions
function loadPatients() {
    // Simulate loading patients
    patients = [
        {
            id: 'P001',
            name: 'John Smith',
            phone: '+1234567890',
            lastContact: '2024-12-15',
            priority: 'medium',
            email: 'john.smith@email.com',
            address: '123 Main St, City',
            medicalHistory: 'Hypertension, Diabetes Type 2'
        },
        {
            id: 'P002',
            name: 'Sarah Johnson',
            phone: '+1234567891',
            lastContact: '2024-12-14',
            priority: 'high',
            email: 'sarah.j@email.com',
            address: '456 Oak Ave, City',
            medicalHistory: 'Asthma, Allergies'
        },
        {
            id: 'P003',
            name: 'Michael Brown',
            phone: '+1234567892',
            lastContact: '2024-12-13',
            priority: 'low',
            email: 'mbrown@email.com',
            address: '789 Pine Rd, City',
            medicalHistory: 'None reported'
        }
    ];
    
    displayPatients(patients);
}

function displayPatients(patientsToDisplay) {
    const tbody = document.getElementById('patientsTable');
    
    if (patientsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-data">No patients found</td></tr>';
        return;
    }
    
    tbody.innerHTML = patientsToDisplay.map(patient => `
        <tr>
            <td>${patient.id}</td>
            <td>${patient.name}</td>
            <td>${patient.phone}</td>
            <td>${patient.lastContact}</td>
            <td><span class="priority-badge priority-${patient.priority}">${patient.priority.toUpperCase()}</span></td>
            <td>
                <button class="btn btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="viewPatient('${patient.id}')">View</button>
                <button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="callPatient('${patient.phone}')">Call</button>
            </td>
        </tr>
    `).join('');
}

function searchPatients() {
    const searchTerm = document.getElementById('patientSearch').value.toLowerCase();
    const filtered = patients.filter(patient => 
        patient.name.toLowerCase().includes(searchTerm) ||
        patient.phone.includes(searchTerm) ||
        patient.id.toLowerCase().includes(searchTerm)
    );
    displayPatients(filtered);
}

function viewPatient(patientId) {
    const patient = patients.find(p => p.id === patientId);
    if (patient) {
        alert(`Patient Details:\n\nID: ${patient.id}\nName: ${patient.name}\nPhone: ${patient.phone}\nEmail: ${patient.email}\nAddress: ${patient.address}\nMedical History: ${patient.medicalHistory}\nPriority: ${patient.priority.toUpperCase()}`);
    }
}

function callPatient(phone) {
    document.getElementById('phoneNumber').value = phone;
    switchTab('calls');
    // Trigger the calls tab
    document.querySelectorAll('.nav-item')[1].click();
}

function addPatient() {
    document.getElementById('patientModal').classList.add('active');
    document.getElementById('patientForm').reset();
}

function closeModal() {
    document.getElementById('patientModal').classList.remove('active');
}

function savePatient(event) {
    event.preventDefault();
    
    const newPatient = {
        id: 'P' + String(patients.length + 1).padStart(3, '0'),
        name: document.getElementById('patientNameInput').value,
        phone: document.getElementById('patientPhoneInput').value,
        email: document.getElementById('patientEmailInput').value,
        address: document.getElementById('patientAddressInput').value,
        medicalHistory: document.getElementById('patientHistoryInput').value,
        priority: document.getElementById('patientPriorityInput').value,
        lastContact: new Date().toISOString().split('T')[0]
    };
    
    patients.push(newPatient);
    displayPatients(patients);
    closeModal();
    alert('Patient added successfully!');
}

// Call History Functions
function loadCallHistory() {
    // Simulate call history
    callHistory = [
        {
            id: 'C001',
            patientName: 'John Smith',
            phone: '+1234567890',
            type: 'emergency',
            duration: '00:05:23',
            datetime: '2024-12-16 10:30:00',
            status: 'completed'
        },
        {
            id: 'C002',
            patientName: 'Sarah Johnson',
            phone: '+1234567891',
            type: 'consultation',
            duration: '00:12:45',
            datetime: '2024-12-16 09:15:00',
            status: 'completed'
        },
        {
            id: 'C003',
            patientName: 'Michael Brown',
            phone: '+1234567892',
            type: 'followup',
            duration: '00:08:10',
            datetime: '2024-12-15 16:45:00',
            status: 'completed'
        }
    ];
    
    displayCallHistory(callHistory);
}

function displayCallHistory(historyToDisplay) {
    const tbody = document.getElementById('historyTable');
    
    if (historyToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No call history</td></tr>';
        return;
    }
    
    tbody.innerHTML = historyToDisplay.map(call => `
        <tr>
            <td>${call.id}</td>
            <td>${call.patientName}</td>
            <td>${call.phone}</td>
            <td><span class="priority-badge priority-${call.type === 'emergency' ? 'critical' : 'low'}">${call.type.toUpperCase()}</span></td>
            <td>${call.duration}</td>
            <td>${call.datetime}</td>
            <td>${call.status}</td>
        </tr>
    `).join('');
}

function saveCallToHistory() {
    const call = {
        id: 'C' + String(callHistory.length + 1).padStart(3, '0'),
        patientName: 'Unknown',
        phone: currentCall.number,
        type: 'consultation',
        duration: document.getElementById('callTimer').textContent,
        datetime: new Date().toLocaleString(),
        status: 'completed'
    };
    
    callHistory.unshift(call);
    displayCallHistory(callHistory);
}

function filterHistory() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const callType = document.getElementById('callType').value;
    
    let filtered = callHistory;
    
    if (callType) {
        filtered = filtered.filter(call => call.type === callType);
    }
    
    // Additional date filtering can be added here
    
    displayCallHistory(filtered);
}

// Report Functions
function generateReport(type) {
    const reportContent = document.getElementById('reportContent');
    
    let reportHTML = `
        <h3>${type.charAt(0).toUpperCase() + type.slice(1)} Report</h3>
        <div style="margin-top: 2rem;">
            <h4>Call Statistics</h4>
            <p><strong>Total Calls:</strong> ${callHistory.length}</p>
            <p><strong>Emergency Calls:</strong> ${callHistory.filter(c => c.type === 'emergency').length}</p>
            <p><strong>Consultations:</strong> ${callHistory.filter(c => c.type === 'consultation').length}</p>
            <p><strong>Follow-ups:</strong> ${callHistory.filter(c => c.type === 'followup').length}</p>
            
            <h4 style="margin-top: 2rem;">Patient Statistics</h4>
            <p><strong>Total Patients:</strong> ${patients.length}</p>
            <p><strong>Critical Priority:</strong> ${patients.filter(p => p.priority === 'critical').length}</p>
            <p><strong>High Priority:</strong> ${patients.filter(p => p.priority === 'high').length}</p>
            <p><strong>Medium Priority:</strong> ${patients.filter(p => p.priority === 'medium').length}</p>
            <p><strong>Low Priority:</strong> ${patients.filter(p => p.priority === 'low').length}</p>
        </div>
    `;
    
    reportContent.innerHTML = reportHTML;
}

function exportReport() {
    let csv = 'Call ID,Patient Name,Phone,Type,Duration,Date Time,Status\n';
    
    callHistory.forEach(call => {
        csv += `${call.id},${call.patientName},${call.phone},${call.type},${call.duration},${call.datetime},${call.status}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// Utility Functions
function setCurrentDate() {
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = document.getElementById('dateFrom');
    const dateTo = document.getElementById('dateTo');
    
    if (dateFrom) dateFrom.value = today;
    if (dateTo) dateTo.value = today;
}

function makeCall() {
    switchTab('calls');
    document.querySelectorAll('.nav-item')[1].click();
}

function viewQueue() {
    alert('Call queue feature coming soon!');
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        alert('Logged out successfully!');
        // Redirect to login page or clear session
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('patientModal');
    if (event.target === modal) {
        closeModal();
    }
}