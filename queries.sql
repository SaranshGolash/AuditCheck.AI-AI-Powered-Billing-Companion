CREATE TABLE procedures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    avg_private_cost INTEGER,
    pmjay_rate INTEGER,
    recovery_days INTEGER
);

CREATE TABLE hidden_costs (
    id SERIAL PRIMARY KEY,
    procedure_id INTEGER REFERENCES procedures(id),
    item_name VARCHAR(255),
    avg_cost INTEGER,
    description TEXT,
    is_avoidable BOOLEAN
);

CREATE TABLE hospitals (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    is_pmjay_empaneled BOOLEAN,
    rating DECIMAL(2,1)
);

-- SEED DATA (This makes your app work immediately)
INSERT INTO procedures (name, avg_private_cost, pmjay_rate, recovery_days)
VALUES ('Total Knee Replacement', 180000, 95000, 45);

INSERT INTO hidden_costs (procedure_id, item_name, avg_cost, description, is_avoidable)
VALUES 
(1, 'Consumables & Disposables', 15000, 'Gloves, masks, and syringes often charged at 500% markup.', TRUE),
(1, 'Post-Op Physiotherapy', 8000, 'Hospital physio is expensive; home physio is cheaper.', TRUE),
(1, 'Unnecessary Antibiotics', 5000, 'High-end antibiotics prescribed when generics suffice.', TRUE);

INSERT INTO hospitals (name, location, is_pmjay_empaneled, rating)
VALUES 
('City Ortho Care', 'Kolkata', TRUE, 4.2),
('Elite Private Hospital', 'Kolkata', FALSE, 4.5),
('Govt General Hospital', 'Kolkata', TRUE, 3.8);