// routes/emissions.js
const express = require('express');
const router = express.Router();
const Emission = require('../models/Emission');
const auth = require('../middleware/authMiddleware');
const axios = require('axios');

router.get('/car/makes', async (req, res) => {
    try {
        // Check if API key is loaded
        if (!process.env.CARBON_INTERFACE_API_KEY) {
            console.error("? Carbon Interface API key is MISSING!");
            return res.status(500).json({ error: "Server missing Carbon Interface API key" });
        }
        console.log("? Carbon Interface API key is loaded");

        // Call Carbon Interface API
        const response = await axios.get(
            'https://www.carboninterface.com/api/v1/vehicle_makes',
            {
                headers: { Authorization: `Bearer ${process.env.CARBON_INTERFACE_API_KEY}` }
            }
);

// Log and return the data
console.log("? Carbon Interface returned makes:", response.data);
res.json(response.data);

    } catch (err) {
    if (err.response) {
        console.error("? Carbon Interface API error:", err.response.status, err.response.data);
        return res.status(err.response.status).json({
            error: err.response.data || "Carbon Interface API error"
        });
    } else {
        console.error("? Server error calling Carbon Interface:", err.message);
        return res.status(500).json({ error: err.message });
    }
}
});

// 2. Get all models for a make
router.get('/car/models/:makeId', async (req, res) => {
    try {
        const { makeId } = req.params;
        const response = await axios.get(
            `https://www.carboninterface.com/api/v1/vehicle_makes/${makeId}/vehicle_models`,
            {
                headers: { Authorization: `Bearer ${process.env.CARBON_INTERFACE_API_KEY}` }
            }
        );
        res.json(response.data.data);
    } catch (err) {
        console.error('Carbon Interface models error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to fetch vehicle models' });
    }
});

// 3. Calculate emissions (preview only)
router.post('/car/emissions', async (req, res) => {
    try {
        const { vehicleModelId, distanceKm } = req.body;
        const response = await axios.post(
            'https://www.carboninterface.com/api/v1/estimates',
            {
                type: 'vehicle',
                distance_unit: 'km',
                distance_value: distanceKm,
                vehicle_model_id: vehicleModelId
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.CARBON_INTERFACE_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json(response.data);
    } catch (err) {
        console.error('Carbon Interface emission calc error:', err.message);
        res.status(500).json({ error: 'Failed to calculate vehicle emissions' });
    }
});
// Log new emission
router.post('/log', auth, async (req, res) => {
    try {
        const { transportMode, distanceKm, metadata } = req.body;

        // Emission factor logic (basic fallback)
        let emissionKg = 0;
        let record;
        const userId = req.user.id;
        const base = {
            userId,
            transportMode,
            distanceKm,
            date: new Date()
        };

        if (transportMode === 'car') {
            try {
                const carbonRes = await axios.post(
                    'https://carboninterface.com/api/v1/estimates',
                    {
                        type: 'vehicle',
                        distance_unit: 'km',
                        distance_value: distanceKm,
                        vehicle_model_id: req.body.vehicleModelId
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.CARBON_INTERFACE_API_KEY}`,
                            'Content-Type': 'application/json'
                        }

                    }
                );

                emissionKg = carbonRes.data.data.attributes.carbon_kg;
            
            }
            catch (err) {
                console.error('Carbon Interface error:', err.response?.data || err.message);
                return res.status(500).json({ error: 'Failed to fetch car emissions' });
            }
            /*const fuelEff = metadata?.fuelEfficiency || 7.5;
            const factor = metadata?.factor || 2.31;
            emissionKg = (fuelEff / 100) * distanceKm * factor;*/
        } else if (transportMode === 'flight') {
            const ef = metadata?.airlineFactor || 0.09;
            const multiplier = metadata?.classMultiplier || 1;
            emissionKg = metadata?.flights * metadata?.hours * ef * multiplier * 1000;
        } else {
            // fallback for public transport
            const fallbackFactors = {
                bus: 0.0001,
                tram: 0.00007,
                metro: 0.00006
            };
            emissionKg = distanceKm * (fallbackFactors[transportMode.toLowerCase()] || 0);
        }

        const newEmission = new Emission({
            userId: req.user.id,
            transportMode,
            distanceKm,
            metadata,
            emissionKg,
            date: new Date()
        });

        await newEmission.save();
        res.json({ message: 'Emission log saved' });
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
router.post('/flightinfo', async (req, res) => {
    const { flightCode, flightDate } = req.body;

    if (!flightCode || !flightDate) {
        return res.status(400).json({ message: 'Flight code and date are required.' });
    }

    try {
        /*const [carrier, number] = flightCode.match(/[A-Za-z]+|[0-9]+/g);*/
        console.log('API KEY:', process.env.AERODATABOX_API_KEY); // should NOT be undefined
        const response = await axios.get(
            `https://aerodatabox.p.rapidapi.com/flights/number/${flightCode}/${flightDate}`,
            {
                headers: {
                    'X-RapidAPI-Key': process.env.AERODATABOX_KEY,
                    'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
                }
            }
        );

        const flight = response.data[0]; // usually array of flights
        console.log(flight);
        console.log(response);
        if (!flight) return res.status(404).json({ message: 'Flight not found' });

        const duration =
            (new Date(flight.arrival.scheduledTime.utc) -
                new Date(flight.departure.scheduledTime.utc)) /
            (1000 * 60 * 60);

        res.json({
            duration: parseFloat(duration.toFixed(2)),
            airline: flight.airline.name
        });
    } catch (err) {
        console.error('Flight API Error:', err.message);
        res.status(500).json({ message: 'Error fetching flight info' });
    }
});
module.exports = router;