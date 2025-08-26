// models/SensorLog.js
const mongoose = require('mongoose');

const SensorLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip' },
  timestamp: { type: Date, default: Date.now },
  accelerometer: {
    x: Number,
    y: Number,
    z: Number
  },
  gyroscope: {
    alpha: Number,
    beta: Number,
    gamma: Number
  },
  gps: {
    lat: Number,
    lon: Number,
    speed: Number,
    accuracy: Number,
    altitude: Number
  }
});

module.exports = mongoose.model('SensorLog', SensorLogSchema);
