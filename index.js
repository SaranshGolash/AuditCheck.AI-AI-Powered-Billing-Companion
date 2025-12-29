require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const flash = require('connect-flash');
const OpenAI = require('openai');

const app = express();
const port = process.env.PORT || 3000;

const isProduction = process.env.NODE_ENV === 'production';

// Database Connection
const pool = new Pool({
    connectionString: isProduction ? process.env.DATABASE_URL : undefined,
    user: isProduction ? undefined : (process.env.DB_USER || 'postgres'),
    host: isProduction ? undefined : (process.env.DB_HOST || 'localhost'),
    database: isProduction ? undefined : (process.env.DB_NAME || 'healthflow'),
    password: isProduction ? undefined : (process.env.DB_PASS || 'password'),
    port: 5432,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Safe JSON Loading
let healthcareData = [];
try {
    healthcareData = require('./healthcare_pricing.json');
    console.log("SUCCESS: Loaded data from root.");
} catch (e1) {
    try {
        healthcareData = require('./data/healthcare_pricing.json');
        console.log("SUCCESS: Loaded data from data folder.");
    } catch (e2) {
        console.error("CRITICAL: Could not find healthcare_pricing.json in root or data folder.");
    }
}

//AI Configuration

let aiClient;
if (process.env.GROQ_API_KEY) {
    aiClient = new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1"
    });
    console.log("SUCCESS: Connected to Groq AI.");
} else {
    console.warn("WARNING: GROQ_API_KEY is missing in .env");
}

// View Engine Setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
// app.use(express.static('public'));
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
    // Capture 'state' and 'country' from the form body
    const { procedure, income_level, state, country } = req.body;

    try {
        // Fetch Procedure Details from DB
        const procQuery = await pool.query('SELECT * FROM procedures WHERE name ILIKE $1', [`%${procedure}%`]);
        
        if (procQuery.rows.length === 0) {
             return res.render('error', { 
                 message: `We couldn't find data for "${procedure}" yet. Try "Total Knee Replacement".`,
                 user: req.session.user 
             });
        }
        
        const procData = procQuery.rows[0];

        // Fetch Hidden Costs associated with this procedure
        const hiddenQuery = await pool.query('SELECT * FROM hidden_costs WHERE procedure_id = $1', [procData.id]);
        
        // Fetch Recommended Hospitals FILTERED BY STATE
        let hospitalQueryText = 'SELECT * FROM hospitals WHERE location ILIKE $1';
        const queryParams = [`%${state}%`];

        if (income_level === 'low' || income_level === 'middle') {
            hospitalQueryText += ' AND is_pmjay_empaneled = TRUE';
        }
        
        // Order by rating for better UX
        hospitalQueryText += ' ORDER BY rating DESC';

        const hospQuery = await pool.query(hospitalQueryText, queryParams);

        // Render the Pathway View
        res.render('pathway', {
            procedure: procData,
            hidden_costs: hiddenQuery.rows,
            hospitals: hospQuery.rows,
            income_level: income_level,
            user: req.session.user,
            selected_state: state,
            selected_country: country
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error: Unable to calculate pathway.");
    }
});

app.post('/api/ask-ai', ensureAuthenticated, async (req, res) => {
    try {
        const { question, contextData } = req.body;

        if (!aiClient) {
            return res.status(503).json({ answer: "AI service not configured." });
        }

        const completion = await aiClient.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are AuditCheck AI, a medical bill auditor. Provide short, helpful financial advice based on the context."
                },
                {
                    role: "user",
                    content: `Context: ${JSON.stringify(contextData || {})}\n\nQuestion: ${question}`
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.5,
        });

        const answer = completion.choices[0]?.message?.content || "I couldn't generate an answer.";
        
        res.json({ answer: answer });

    } catch (error) {
        console.error("Groq AI Error:", error);
        res.status(500).json({ 
            answer: "We are having trouble connecting to the AI right now. Please try again later." 
        });
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