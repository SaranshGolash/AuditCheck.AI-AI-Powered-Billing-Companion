require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const flash = require('connect-flash');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// AI Configuration
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Database Connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS,
    port: process.env.DB_PORT || 5432,
});

const rawData = fs.readFileSync(path.join(__dirname, 'data', 'healthcare_pricing.json'));
const healthcareData = JSON.parse(rawData);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Added for AI JSON requests

// Session Middleware
app.use(session({
    secret: 'healthflow_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

app.use(flash());

// Global Variables Middleware (for EJS)
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error'); // Passport/Login errors
    next();
});

// Auth Routes

// Register Page
app.get('/register', (req, res) => res.render('register'));

// Register Logic
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
            [username, email, hashedPassword]
        );
        req.flash('success_msg', 'You are now registered and can log in');
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        req.flash('error_msg', 'Error registering. Email or Username might be taken.');
        res.redirect('/register');
    }
});

// Login Page
app.get('/login', (req, res) => res.render('login'));

// Login Logic
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (await bcrypt.compare(password, user.password)) {
                req.session.user = { id: user.id, username: user.username, email: user.email };
                res.redirect('/');
            } else {
                req.flash('error_msg', 'Password incorrect');
                res.redirect('/login');
            }
        } else {
            req.flash('error_msg', 'No user found with that email');
            res.redirect('/login');
        }
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.log(err);
        res.redirect('/login');
    });
});

// Middleware to Protect Routes
function ensureAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    req.flash('error_msg', 'Please log in to access this resource');
    res.redirect('/login');
}

// App Routes

app.get('/', (req, res) => {
    res.render('landing');
});

app.get('/search', ensureAuthenticated, (req, res) => {
    res.render('get-response');
});

// Logic Route: Calculate Pathway
app.post('/check-pathway', ensureAuthenticated, async (req, res) => {
    const { procedure, income_level } = req.body;
    try {
        const procQuery = await pool.query('SELECT * FROM procedures WHERE name ILIKE $1', [`%${procedure}%`]);
        
        // Handle "Procedure not found" gracefully
        let procData = procQuery.rows[0];
        let hiddenCosts = [];
        
        if (!procData) {
             // Fallback dummy data if DB is empty for MVP demo
             procData = { name: procedure, avg_private_cost: 0, pmjay_rate: 0, recovery_days: 0 };
        } else {
             const hiddenQuery = await pool.query('SELECT * FROM hidden_costs WHERE procedure_id = $1', [procData.id]);
             hiddenCosts = hiddenQuery.rows;
        }

        let hospitalQueryText = 'SELECT * FROM hospitals';
        if (income_level === 'low' || income_level === 'middle') {
            hospitalQueryText += ' WHERE is_pmjay_empaneled = TRUE';
        }
        const hospQuery = await pool.query(hospitalQueryText);

        res.render('pathway', {
            procedure: procData,
            hidden_costs: hiddenCosts,
            hospitals: hospQuery.rows,
            income_level: income_level
        });

    } catch (err) {
        console.error(err);
        res.send("Server Error");
    }
});

// AI-Powered Question Answering Endpoint
app.post('/api/ask-ai', ensureAuthenticated, async (req, res) => {
    const { question, contextData } = req.body;
    
    try {
        const prompt = `
            You are an expert medical bill auditor named AuditCheck AI. 
            User Context: ${JSON.stringify(contextData)}
            User Question: ${question}
            
            Provide a short, punchy, and financial-focused advice. 
            Warn them about specific hidden charges if applicable.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        res.json({ answer: text });
    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: "I'm having trouble connecting to the audit servers right now." });
    }
});

// API Endpoints for Dropdowns
app.get('/api/countries', (req, res) => {
    const countries = healthcareData.map(c => c.country);
    res.json(countries);
});

app.get('/api/states/:country', (req, res) => {
    const countryData = healthcareData.find(c => c.country.toLowerCase() === req.params.country.toLowerCase());
    if (!countryData) return res.status(404).json({ error: "Country not found" });
    const states = countryData.states.map(s => s.state_name);
    res.json(states);
});

app.listen(port, () => {
    console.log(`AuditCheck.AI running on port ${port}`);
});