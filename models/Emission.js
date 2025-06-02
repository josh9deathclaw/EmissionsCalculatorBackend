const mongoose = require('mongoose');

const emissionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    transportMode: { type: String, required: true },
    distanceKm: Number,
    emissionKg: Number,
    date: { type: Date, default: Date.now },

    // Car-specific
    brand: String,
    fuel: String,
    trips: Number,
    extraLoad: String,

    // Flight-specific
    flights: Number,
    hoursPerFlight: Number,
    airline: String,
    flightClass: String
});

module.exports = mongoose.model('Emission', emissionSchema);