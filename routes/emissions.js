// routes/emissions.js
const express = require('express');
const router = express.Router();
const Emission = require('../models/Emission');
const auth = require('../middleware/authMiddleware');
const axios = require('axios');
const CARBONSUTRA_HOST = 'carbonsutra1.p.rapidapi.com';
const CARBONSUTRA_KEY = process.env.AERODATABOX_KEY;

router.get('/car/makes', async (req, res) => {
    try {
        
        const response = await axios.get(
            `https://${CARBONSUTRA_HOST}/vehicle_makes`,
            {
                headers: {
                    'x-rapidapi-host':CARBONSUTRA_HOST,
                    'x-rapidapi-key': CARBONSUTRA_KEY
                }
            }
);


res.json(response.data);

    } catch (err) {
        console.error("CarbonSutra Makes Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch vehicle makes' });
    }
});

// 2. Get all models for a make
router.get('/car/models/:make', async (req, res) => {
    try {
        const { make } = req.params;
        const response = await axios.get(
            `https://${CARBONSUTRA_HOST}/vehicle_makes/${make}/vehicle_models`,
            {
                headers: {
                    'x-rapidapi-host': CARBONSUTRA_HOST,
                    'x-rapidapi-key': CARBONSUTRA_KEY
                }
            }
        );
        res.json(response.data);
    } catch (err) {
        console.error("CarbonSutra Makes Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch vehicle makes' });
    }
});

// 3. Calculate emissions (preview only)
router.post('/car/emissions', async (req, res) => {
    try {
        const { vehicleMake, vehicleModel, distanceKm } = req.body;
        const response = await axios.post(
            `https://${CARBONSUTRA_HOST}/vehicle_estimate_by_model`,
            new URLSearchParams({
                vehicle_make: vehicleMake,
                vehicle_model: vehicleModel,
                distance_value: distanceKm.toString(),
                distance_unit: 'km'
            }),
            {
                headers: {
                    'x-rapidapi-host': CARBONSUTRA_HOST,
                    'x-rapidapi-key': CARBONSUTRA_KEY,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        res.json(response.data);
    } catch (err) {
        console.error("CarbonSutra Emission Calc Error:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to calculate vehicle emissions' });
    }
});
// Log new emission
router.post('/log', auth, async (req, res) => {
    try {
        const {
            transportMode,
            distanceKm,
            emissionKg,       // <-- directly sent from frontend
            vehicleMake,
            vehicleModel,
            trips,
            extraLoad,
            fromAirport,
            toAirport,
            metadata
        } = req.body;

        const userId = req.user.id;

        // Build new emission record (no API call here)
        const newEmission = new Emission({
            userId,
            transportMode,
            distanceKm,
            emissionKg,       // <-- save what frontend calculated
            brand: vehicleMake,
            model: vehicleModel,
            trips,
            extraLoad,
            fromAirport,
            toAirport,
            metadata,
            date: new Date()
        });

        await newEmission.save();
        res.json({ message: 'Emission log saved', emissionKg });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to log emission' });
    }
});

// Fetch history
router.get('/history', auth, async (req, res) => {
    try {
        const records = await Emission.find({ userId: req.user.id }).sort({ date: -1 });
        res.json({ records });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// Leaderboard route
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const leaderboard = await Emission.aggregate([
            {
                $group: {
                    _id: '$userId',
                    totalEmission: { $sum: '$emissionKg' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    userId: '$_id',
                    totalEmission: 1,
                    name: '$userInfo.name'
                }
            },
            { $sort: { totalEmission: -1 } }
        ]);

        res.json({ leaderboard });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});
router.get('/air/airports', async (req, res) => {
    try {
        const { keyword } = req.query;
        if (!keyword) {
            return res.status(400).json({ error: "keyword is required" });
        }

        const response = await axios.get(
            `https://carbonsutra1.p.rapidapi.com/airports-by-keyword`,
            {
                params: { keyword },
                headers: {
                    'x-rapidapi-host': CARBONSUTRA_HOST,
                    'x-rapidapi-key': CARBONSUTRA_KEY
                }
            }
        );

        res.json(response.data);
    }
    catch (err) {
        console.error("CarbonSutra Airport Search Error:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to fetch airports" });
    }
});
// Flight emission estimate using CarbonSutra
router.post('/flight/emissions', auth, async (req, res) => {
    try {
        const {
            fromAirport,
            toAirport,
            passengers = 1,
            flightClass = "economy",  // CarbonSutra expects "Average", "Economy", "Business", "First"
            roundTrip = false
        } = req.body;

        if (!fromAirport || !toAirport) {
            return res.status(400).json({ error: "From and To airports are required." });
        }

        const response = await axios.post(
            `https://carbonsutra1.p.rapidapi.com/flight_estimate`,
            new URLSearchParams({
                iata_airport_from: fromAirport,
                iata_airport_to: toAirport,
                number_of_passengers: passengers.toString(),
                flight_class: flightClass,
                round_trip: roundTrip ? "Y" : "N",   // ? round trip support
                add_rf: "Y",                         // ? include radiative forcing
                include_wtt: "Y"                     // ? include well-to-tank emissions
            }),
            {
                headers: {
                    'x-rapidapi-host': CARBONSUTRA_HOST,
                    'x-rapidapi-key': CARBONSUTRA_KEY,
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        res.json(response.data);
    } catch (err) {
        console.error("CarbonSutra Flight Estimate Error:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to calculate flight emissions" });
    }
});
// Calculate bus emissions
router.post('/bus/emissions', async (req, res) => {
    try {
        const { distanceKm } = req.body;
        if (!distanceKm) {
            return res.status(400).json({ error: "distanceKm is required" });
        }

        // Bus emission factor (kg CO2 per km)
        const factor = 0.0001; // adjust if needed
        const emissionKg = distanceKm * factor;

        res.json({ emissionKg });
    } catch (err) {
        console.error("Bus emission calc error:", err.message);
        res.status(500).json({ error: "Failed to calculate bus emissions" });
    }
});
router.post('/metro/emissions', async (req, res) => {
    try {
        const { distanceKm } = req.body;
        if (!distanceKm) {
            return res.status(400).json({ error: "distanceKm is required" });
        }

        // Bus emission factor (kg CO2 per km)
        const factor = 0.00006; // adjust if needed
        const emissionKg = distanceKm * factor;

        res.json({ emissionKg });
    } catch (err) {
        console.error("Bus emission calc error:", err.message);
        res.status(500).json({ error: "Failed to calculate bus emissions" });
    }
});
router.post('/tram/emissions', async (req, res) => {
    try {
        const { distanceKm } = req.body;
        if (!distanceKm) {
            return res.status(400).json({ error: "distanceKm is required" });
        }

        // Bus emission factor (kg CO2 per km)
        const factor = 0.00007; // adjust if needed
        const emissionKg = distanceKm * factor;

        res.json({ emissionKg });
    } catch (err) {
        console.error("Bus emission calc error:", err.message);
        res.status(500).json({ error: "Failed to calculate bus emissions" });
    }
});
module.exports = router;