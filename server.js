// server.js - Node.js Backend for 104 Medical Helpline Call Center

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express App
const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuration
const PORT = process.env.PORT || 3000;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+1234567890';

// Initialize Twilio Client (only if valid credentials provided)
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_ACCOUNT_SID !== 'your_twilio_sid' && TWILIO_AUTH_TOKEN !== 'your_twilio_token') {
    twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

// Database Configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medical_callcenter',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create Database Connection Pool
const pool = mysql.createPool(dbConfig);

// Database Initialization
async function initializeDatabase() {
    try {
        // First, connect without database to create it if needed
        const tempConfig = { ...dbConfig };
        delete tempConfig.database;
        const tempConnection = await mysql.createConnection(tempConfig);
        await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'medical_callcenter'}`);
        await tempConnection.end();
        
        const connection = await pool.getConnection();
        
        // Create tables if they don't exist
        await connection.query(`
            CREATE TABLE IF NOT EXISTS agents (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                phone VARCHAR(20),
                status ENUM('online', 'offline', 'busy', 'away') DEFAULT 'offline',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                email VARCHAR(100),
                address TEXT,
                medical_history TEXT,
                priority ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
                last_contact TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS calls (
                id INT AUTO_INCREMENT PRIMARY KEY,
                call_id VARCHAR(50) UNIQUE NOT NULL,
                patient_id INT,
                agent_id INT,
                phone_number VARCHAR(20) NOT NULL,
                call_type ENUM('emergency', 'consultation', 'followup', 'general') DEFAULT 'general',
                duration INT DEFAULT 0,
                status ENUM('initiated', 'ringing', 'connected', 'completed', 'failed', 'missed') DEFAULT 'initiated',
                recording_url VARCHAR(255),
                notes TEXT,
                call_start TIMESTAMP,
                call_end TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS call_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                call_id INT NOT NULL,
                event_type VARCHAR(50) NOT NULL,
                event_data JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
            )
        `);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                patient_id INT NOT NULL,
                agent_id INT,
                appointment_date DATETIME NOT NULL,
                type VARCHAR(50),
                status ENUM('scheduled', 'completed', 'cancelled', 'rescheduled') DEFAULT 'scheduled',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
                FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
            )
        `);

        connection.release();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Initialize database on startup
initializeDatabase();

// ==================== API ROUTES ====================

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: '104 Medical Helpline CRM',
        timestamp: new Date().toISOString()
    });
});

// Agent Routes
app.post('/api/agents/login', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        const [rows] = await pool.query(
            'SELECT * FROM agents WHERE email = ?',
            [email]
        );

        let agent;
        if (rows.length === 0) {
            // Create new agent
            const [result] = await pool.query(
                'INSERT INTO agents (name, email, status) VALUES (?, ?, ?)',
                [name, email, 'online']
            );
            agent = { id: result.insertId, name, email, status: 'online' };
        } else {
            agent = rows[0];
            // Update status to online
            await pool.query(
                'UPDATE agents SET status = ? WHERE id = ?',
                ['online', agent.id]
            );
        }

        res.json({ success: true, agent });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/logout/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.query(
            'UPDATE agents SET status = ? WHERE id = ?',
            ['offline', id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Patient Routes
app.get('/api/patients', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM patients ORDER BY created_at DESC'
        );
        res.json({ success: true, patients: rows });
    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/patients', async (req, res) => {
    try {
        const { name, phone, email, address, medical_history, priority } = req.body;
        
        // Generate patient ID
        const [countResult] = await pool.query('SELECT COUNT(*) as count FROM patients');
        const patientId = 'P' + String(countResult[0].count + 1).padStart(4, '0');

        const [result] = await pool.query(
            `INSERT INTO patients (patient_id, name, phone, email, address, medical_history, priority, last_contact) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [patientId, name, phone, email, address, medical_history, priority]
        );

        res.json({ 
            success: true, 
            patient: {
                id: result.insertId,
                patient_id: patientId,
                name,
                phone,
                email,
                address,
                medical_history,
                priority
            }
        });
    } catch (error) {
        console.error('Create patient error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            'SELECT * FROM patients WHERE id = ? OR patient_id = ?',
            [id, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        res.json({ success: true, patient: rows[0] });
    } catch (error) {
        console.error('Get patient error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/patients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address, medical_history, priority } = req.body;

        await pool.query(
            `UPDATE patients SET name = ?, phone = ?, email = ?, address = ?, 
             medical_history = ?, priority = ? WHERE id = ?`,
            [name, phone, email, address, medical_history, priority, id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Update patient error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Call Routes - VoIP Integration
app.post('/api/calls/initiate', async (req, res) => {
    try {
        if (!twilioClient) {
            return res.status(500).json({ success: false, error: 'Twilio not configured. Please set up Twilio credentials in .env file.' });
        }

        const { to, from, agentId, callType } = req.body;

        // Generate call ID
        const callId = 'C' + Date.now();

        // Initiate call using Twilio
        const call = await twilioClient.calls.create({
            url: `${process.env.BASE_URL}/api/calls/twiml`,
            to: to,
            from: from || TWILIO_PHONE_NUMBER,
            statusCallback: `${process.env.BASE_URL}/api/calls/status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
            record: true
        });

        // Save call to database
        const [result] = await pool.query(
            `INSERT INTO calls (call_id, agent_id, phone_number, call_type, status, call_start) 
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [callId, agentId, to, callType, 'initiated']
        );

        // Emit socket event
        io.emit('call_initiated', {
            callId: callId,
            twilioSid: call.sid,
            to: to,
            status: 'initiated'
        });

        res.json({ 
            success: true, 
            callId: callId,
            twilioSid: call.sid,
            status: call.status 
        });
    } catch (error) {
        console.error('Call initiation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/calls/twiml', (req, res) => {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say voice="alice">Hello, you have reached 104 Medical Helpline. Please hold while we connect you to an agent.</Say>
        <Dial>
            <Number>${process.env.AGENT_PHONE || '+1234567890'}</Number>
        </Dial>
    </Response>`;
    
    res.type('text/xml');
    res.send(twiml);
});

app.post('/api/calls/status', async (req, res) => {
    try {
        const { CallSid, CallStatus, CallDuration } = req.body;

        // Update call status in database
        await pool.query(
            'UPDATE calls SET status = ?, duration = ? WHERE call_id = ?',
            [CallStatus, CallDuration || 0, CallSid]
        );

        // Log the event
        const [callRows] = await pool.query('SELECT id FROM calls WHERE call_id = ?', [CallSid]);
        if (callRows.length > 0) {
            await pool.query(
                'INSERT INTO call_logs (call_id, event_type, event_data) VALUES (?, ?, ?)',
                [callRows[0].id, 'status_update', JSON.stringify(req.body)]
            );
        }

        // Emit socket event
        io.emit('call_status_update', {
            callSid: CallSid,
            status: CallStatus,
            duration: CallDuration
        });

        res.sendStatus(200);
    } catch (error) {
        console.error('Status callback error:', error);
        res.sendStatus(500);
    }
});

app.post('/api/calls/end/:callSid', async (req, res) => {
    try {
        if (!twilioClient) {
            return res.status(500).json({ success: false, error: 'Twilio not configured. Please set up Twilio credentials in .env file.' });
        }

        const { callSid } = req.params;

        // End call using Twilio
        await twilioClient.calls(callSid).update({ status: 'completed' });

        // Update database
        await pool.query(
            'UPDATE calls SET status = ?, call_end = NOW() WHERE call_id = ?',
            ['completed', callSid]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('End call error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/calls/history', async (req, res) => {
    try {
        const { startDate, endDate, callType, agentId } = req.query;
        
        let query = 'SELECT c.*, p.name as patient_name, a.name as agent_name FROM calls c LEFT JOIN patients p ON c.patient_id = p.id LEFT JOIN agents a ON c.agent_id = a.id WHERE 1=1';
        const params = [];

        if (startDate) {
            query += ' AND c.call_start >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND c.call_start <= ?';
            params.push(endDate);
        }
        if (callType) {
            query += ' AND c.call_type = ?';
            params.push(callType);
        }
        if (agentId) {
            query += ' AND c.agent_id = ?';
            params.push(agentId);
        }

        query += ' ORDER BY c.call_start DESC';

        const [rows] = await pool.query(query, params);
        res.json({ success: true, calls: rows });
    } catch (error) {
        console.error('Get call history error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Statistics and Reports
app.get('/api/stats/dashboard', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [totalCalls] = await pool.query(
            'SELECT COUNT(*) as count FROM calls WHERE DATE(call_start) = ?',
            [today]
        );

        const [completedCalls] = await pool.query(
            'SELECT COUNT(*) as count FROM calls WHERE DATE(call_start) = ? AND status = ?',
            [today, 'completed']
        );

        const [emergencyCalls] = await pool.query(
            'SELECT COUNT(*) as count FROM calls WHERE DATE(call_start) = ? AND call_type = ?',
            [today, 'emergency']
        );

        const [avgDuration] = await pool.query(
            'SELECT AVG(duration) as avg FROM calls WHERE DATE(call_start) = ? AND status = ?',
            [today, 'completed']
        );

        res.json({
            success: true,
            stats: {
                totalCalls: totalCalls[0].count,
                completedCalls: completedCalls[0].count,
                emergencyCalls: emergencyCalls[0].count,
                avgDuration: Math.round(avgDuration[0].avg || 0)
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/reports/:type', async (req, res) => {
    try {
        const { type } = req.params;
        let startDate, endDate;

        const now = new Date();
        switch (type) {
            case 'daily':
                startDate = new Date(now.setHours(0, 0, 0, 0));
                endDate = new Date(now.setHours(23, 59, 59, 999));
                break;
            case 'weekly':
                startDate = new Date(now.setDate(now.getDate() - 7));
                endDate = new Date();
                break;
            case 'monthly':
                startDate = new Date(now.setMonth(now.getMonth() - 1));
                endDate = new Date();
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid report type' });
        }

        const [callStats] = await pool.query(
            `SELECT 
                COUNT(*) as total_calls,
                SUM(CASE WHEN call_type = 'emergency' THEN 1 ELSE 0 END) as emergency_calls,
                SUM(CASE WHEN call_type = 'consultation' THEN 1 ELSE 0 END) as consultation_calls,
                SUM(CASE WHEN call_type = 'followup' THEN 1 ELSE 0 END) as followup_calls,
                AVG(duration) as avg_duration,
                SUM(duration) as total_duration
             FROM calls 
             WHERE call_start BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const [patientStats] = await pool.query(
            'SELECT COUNT(*) as total, priority, COUNT(*) as count FROM patients GROUP BY priority'
        );

        res.json({
            success: true,
            report: {
                type: type,
                period: { startDate, endDate },
                calls: callStats[0],
                patients: patientStats
            }
        });
    } catch (error) {
        console.error('Generate report error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('agent_online', (data) => {
        socket.broadcast.emit('agent_status_change', {
            agentId: data.agentId,
            status: 'online'
        });
    });

    socket.on('agent_busy', (data) => {
        socket.broadcast.emit('agent_status_change', {
            agentId: data.agentId,
            status: 'busy'
        });
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// ==================== ERROR HANDLING ====================

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
    });
});

// ==================== START SERVER ====================

server.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════╗
    ║   104 Medical Helpline Call Center CRM Server        ║
    ║                                                       ║
    ║   Server running on: http://localhost:${PORT}         ║
    ║   Status: Ready to accept connections                ║
    ║                                                       ║
    ║   VoIP Provider: Twilio                              ║
    ║   Database: MySQL                                    ║
    ╚═══════════════════════════════════════════════════════╝
    `);
});

module.exports = { app, server, io };