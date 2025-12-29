# Contribution Rules & Guidelines

To prevent conflicts and security issues, we strictly enforce boundaries on what contributors can modify.

## ✅ Green Zone: What You Can Edit

### 1. Healthcare Data (High Priority)
We always need more hospital and procedure data. You are encouraged to add new entries to our dataset.
* **File to Edit:** `data/healthcare_pricing.json`.
* **Action:** Add new objects to the array. Do NOT delete existing data unless correcting an error.
* **Format Requirement:**
    ```json
    [
  {
    "country": "India",
    "currency_symbol": "₹",
    "states": [
      {
        "state_name": "West Bengal",
        "hospitals": [
          {
            "name": "Apollo Gleneagles Hospitals",
            "city": "Kolkata",
            "type": "Private",
            "rating": 4.5,
            "hidden_charge_risk": "High"
          }
        ],
        "procedures": [
          {
            "name": "Total Knee Replacement",
            "avg_cost_private": 250000,
            "avg_cost_govt": 125000,
            "hidden_costs": [
              { "item": "Implant Markup", "cost": 45000, "note": "Hospitals often charge MRP." },
              { "item": "Consumables", "cost": 12000, "note": "Gloves/Masks billed per item." }
            ]
          }
        ]
      }
    ]
  }
    ```

### 2. Frontend & UI/UX
You are welcome to improve the look and feel of the application.
* **Files to Edit:**
    * `views/*.ejs` (HTML/Layout structure)
    * `public/css/*.css` (Styles)
    * `public/js/*.js` (Client-side animations/interactions)
* **Guideline:** Ensure the "Ask AuditAI" button and forms remain functional. Do not remove the `id` attributes used by the backend scripts.

---

## ⛔ Red Zone: Do Not Touch

**PRs including changes to these files will be rejected:**

1.  **`index.js` / Server Entry Point:**
    * Do not modify API routes (`/api/ask-ai`, `/login`, etc.).
    * Do not change authentication middleware.
2.  **Database Configuration:**
    * Do not modify `seed.js`, `index.js` or connection pools.
3.  **Environment Variables:**
    * Do not commit `.env` files.
    * Do not alter how `GROQ_API_KEY` or `DATABASE_URL` are handled.
4.  **Backend Logic:**
    * No changes to the AI prompt engineering or session management logic.

## 🧪 Testing Your Contribution

Before submitting, run the app locally:
1.  Run `npm start`.
2.  Navigate to `http://localhost:3000`.
3.  **If you added data:** Search for the new hospital/procedure to ensure it appears in the results.
4.  **If you changed UI:** Ensure the layout is responsive on mobile screens.

Thank you for helping us make healthcare costs transparent!