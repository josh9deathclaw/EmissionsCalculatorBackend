// routes/emissions.js
const express = require('express');
const router = express.Router();
const Emission = require('../models/Emission');
const auth = require('../middleware/authMiddleware');

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

module.exports = router;