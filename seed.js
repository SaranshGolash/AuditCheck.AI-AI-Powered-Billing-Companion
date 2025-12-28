require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 1. Connect to Neon Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. Load the JSON Data
const rawData = fs.readFileSync(path.join(__dirname, 'data', 'healthcare_pricing.json'));
const countriesData = JSON.parse(rawData);

async function seedDatabase() {
    const client = await pool.connect();

    try {
        console.log("🌱 Starting Database Seed...");
        await client.query('BEGIN'); // Start Transaction

        // OPTIONAL: Clear existing data to avoid duplicates
        console.log("🧹 Clearing old data...");
        await client.query('TRUNCATE TABLE hidden_costs, procedures, hospitals RESTART IDENTITY CASCADE');

        // 3. Loop through the JSON Hierarchy
        for (const country of countriesData) {
            for (const state of country.states) {
                console.log(`Processing ${state.state_name}, ${country.country}...`);

                // --- INSERT HOSPITALS ---
                for (const hosp of state.hospitals) {
                    // Logic: If type is 'Government', assume PMJAY empaneled
                    const isPmjay = hosp.type === 'Government';
                    const location = `${hosp.city}, ${state.state_name}`; // Combine City & State

                    await client.query(
                        `INSERT INTO hospitals (name, location, is_pmjay_empaneled, rating) 
                         VALUES ($1, $2, $3, $4)`,
                        [hosp.name, location, isPmjay, hosp.rating]
                    );
                }

                // --- INSERT PROCEDURES & HIDDEN COSTS ---
                for (const proc of state.procedures) {
                    // Insert Procedure and GET THE ID (RETURNING id)
                    // Note: We use 'avg_cost_govt' as the 'pmjay_rate' for MVP alignment
                    const procResult = await client.query(
                        `INSERT INTO procedures (name, avg_private_cost, pmjay_rate, recovery_days) 
                         VALUES ($1, $2, $3, $4) 
                         RETURNING id`,
                        [proc.name, proc.avg_cost_private, proc.avg_cost_govt, 14] // Defaulting recovery to 14 days
                    );

                    const newProcedureId = procResult.rows[0].id;

                    // Insert Hidden Costs linked to this Procedure ID
                    if (proc.hidden_costs && proc.hidden_costs.length > 0) {
                        for (const cost of proc.hidden_costs) {
                            await client.query(
                                `INSERT INTO hidden_costs (procedure_id, item_name, avg_cost, description, is_avoidable) 
                                 VALUES ($1, $2, $3, $4, $5)`,
                                [newProcedureId, cost.item, cost.cost, cost.note, true] // Default is_avoidable to true
                            );
                        }
                    }
                }
            }
        }

        await client.query('COMMIT'); // Save changes
        console.log("✅ Database successfully seeded!");

    } catch (err) {
        await client.query('ROLLBACK'); // Undo changes if error
        console.error("❌ Seeding failed:", err);
    } finally {
        client.release();
        pool.end(); // Close connection
    }
}

seedDatabase();