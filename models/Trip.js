// models/Trip.js
const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transportMode: { type: String, required: true, enum: ['car', 'bus', 'tram', 'metro', 'flight'] },
  distanceKm: { type: Number, default: 0, min: 0},
  durationSec: { type: Number, default: 0, min: 0},
  emissionKg: { type: Number, default: 0, min: 0},
  status: { type: String, enum: ['in-progress', 'completed', 'cancelled'], default: 'in-progress' },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date }
});

tripSchema.index({ userId: 1, startTime: -1 });
module.exports = mongoose.model('Trip', tripSchema);