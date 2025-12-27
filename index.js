require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

// Database Connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'healthflow',
    password: process.env.DB_PASS || 'password',
    port: 5432,
});

const rawData = fs.readFileSync(path.join(__dirname, 'healthcare_data.json'));
const healthcareData = JSON.parse(rawData);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Home Route
app.get('/', (req, res) => {
    res.render('index');
});

// Logic Route: Calculate Pathway
app.post('/check-pathway', async (req, res) => {
    const { procedure, income_level } = req.body;

    try {
        // 1. Fetch Procedure Details
        const procQuery = await pool.query('SELECT * FROM procedures WHERE name ILIKE $1', [`%${procedure}%`]);
        
        if (procQuery.rows.length === 0) {
            return res.render('error', { message: "Procedure not found in our database yet." });
        }
        
        const procData = procQuery.rows[0];

        // 2. Fetch Hidden Costs
        const hiddenQuery = await pool.query('SELECT * FROM hidden_costs WHERE procedure_id = $1', [procData.id]);
        
        // 3. Fetch Recommended Hospitals (Logic: If low income, show PMJAY only)
        let hospitalQueryText = 'SELECT * FROM hospitals';
        if (income_level === 'low' || income_level === 'middle') {
            hospitalQueryText += ' WHERE is_pmjay_empaneled = TRUE';
        }
        const hospQuery = await pool.query(hospitalQueryText);

        // 4. Render the Pathway View
        res.render('pathway', {
            procedure: procData,
            hidden_costs: hiddenQuery.rows,
            hospitals: hospQuery.rows,
            income_level: income_level
        });

    } catch (err) {
        console.error(err);
        res.send("Server Error");
    }
});

// API Endpoints

// Get All Countries
app.get('/api/countries', (req, res) => {
    const countries = healthcareData.map(c => c.country);
    res.json(countries);
});

// Get States for a Country
app.get('/api/states/:country', (req, res) => {
    const countryData = healthcareData.find(c => c.country.toLowerCase() === req.params.country.toLowerCase());
    if (!countryData) return res.status(404).json({ error: "Country not found" });
    
    const states = countryData.states.map(s => s.state_name);
    res.json(states);
});

// Get Full Procedure Details (The Core Feature)
app.get('/api/estimate', (req, res) => {
    const { country, state, procedure } = req.query;

    // Find Country
    const countryData = healthcareData.find(c => c.country.toLowerCase() === country.toLowerCase());
    if (!countryData) return res.status(404).json({ error: "Country not found" });

    // Find State
    const stateData = countryData.states.find(s => s.state_name.toLowerCase() === state.toLowerCase());
    if (!stateData) return res.status(404).json({ error: "State not found" });

    // Find Procedure
    const procedureData = stateData.procedures.find(p => p.name.toLowerCase().includes(procedure.toLowerCase()));
    
    if (!procedureData) {
        // Fallback: If state data is missing, return country average (Simulated)
        return res.json({
            note: "State-specific data missing, showing national average.",
            avg_cost: 200000, 
            currency: countryData.currency_symbol,
            hidden_costs: []
        });
    }

    res.json({
        currency: countryData.currency_symbol,
        data: procedureData,
        hospitals: stateData.hospitals
    });
});

app.listen(port, () => {
    console.log(`HealthFlow running on port ${port}`);
});