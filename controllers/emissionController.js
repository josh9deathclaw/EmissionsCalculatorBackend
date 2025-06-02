const Emission = require("../models/Emission");

exports.logEmission = async (req, res) => {
    try {
        const { transportMode } = req.body;
        const userId = req.user.id;

        const base = {
            userId,
            transportMode,
            emissionKg: req.body.emissionKg,
            distanceKm: req.body.distanceKm,
            date: new Date()
        };

        let record;

        if (transportMode === "car") {
            record = new Emission({
                ...base,
                brand: req.body.brand,
                fuel: req.body.fuel,  // ? FUEL TYPE CAPTURED
                trips: req.body.trips,
                extraLoad: req.body.extraLoad
            });
        } else if (transportMode === "flight") {
            record = new Emission({
                ...base,
                flights: req.body.flights,
                hoursPerFlight: req.body.hoursPerFlight,
                airline: req.body.airline,
                flightClass: req.body.flightClass
            });
        } else {
            record = new Emission(base);
        }

        await record.save();
        res.status(201).json({ message: 'Emission recorded successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to record emission.' });
    }
};