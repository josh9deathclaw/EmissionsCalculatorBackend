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
        const { transportMode, vehicleMake, vehicleModel, distanceKm, trips, extraLoad, metadata } = req.body;
        let emissionKg = 0;
        const userId = req.user.id;
        const base = { userId, transportMode, distanceKm, date: new Date() };

        if (transportMode === 'car') {
            try {
                const carbonRes = await axios.post(
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

                emissionKg = (carbonRes.data.data.co2e_kg || 0); // g ? kg
                console.log(emissionKg);
                // Apply extra load % if needed
                const loadFactors = {
                    none: 0,
                    caravan: 10,
                    boat: 15,
                    'trailer-light': 5,
                    'trailer-medium': 10,
                    'trailer-heavy': 20
                };
                emissionKg *= (1 + (loadFactors[extraLoad] || 0) / 100);

            } catch (err) {
                console.error('CarbonSutra error:', err.response?.data || err.message);
                return res.status(500).json({ error: 'Failed to fetch car emissions' });
            }
        } else if (transportMode === 'flight') {
            const ef = metadata?.airlineFactor || 0.09;
            const multiplier = metadata?.classMultiplier || 1;
            emissionKg = metadata?.flights * metadata?.hours * ef * multiplier * 1000;
        } else {
            const fallbackFactors = { bus: 0.0001, tram: 0.00007, metro: 0.00006 };
            emissionKg = distanceKm * (fallbackFactors[transportMode.toLowerCase()] || 0);
        }

        const newEmission = new Emission({
            ...base,
            emissionKg,
            brand: vehicleMake,
            model: vehicleModel,
            trips,
            extraLoad,
            metadata
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
                from: fromAirport,
                to: toAirport,
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
/*router.post('/flightinfo', async (req, res) => {
    const { flightCode, flightDate } = req.body;

    if (!flightCode || !flightDate) {
        return res.status(400).json({ message: 'Flight code and date are required.' });
    }

    try {
        *//*const [carrier, number] = flightCode.match(/[A-Za-z]+|[0-9]+/g);*//*
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
});*/

module.exports = router;