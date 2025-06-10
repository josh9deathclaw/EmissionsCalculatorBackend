// routes/emissions.js
const express = require('express');
const router = express.Router();
const Emission = require('../models/Emission');
const auth = require('../middleware/authMiddleware');
const axios = require('axios');

// Log new emission
router.post('/log', auth, async (req, res) => {
    try {
        const { transportMode, distanceKm, metadata } = req.body;

        // Emission factor logic (basic fallback)
        let emissionKg = 0;

        if (transportMode === 'car') {
            const fuelEff = metadata?.fuelEfficiency || 7.5;
            const factor = metadata?.factor || 2.31;
            emissionKg = (fuelEff / 100) * distanceKm * factor;
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

        const response = await axios.get(
            `https://aerodatabox.p.rapidapi.com/flights/number/${flightCode}/${flightDate}`,
            {
                headers: {
                    'X-RapidAPI-Key': process.env.AERODATABOX_API_KEY,
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