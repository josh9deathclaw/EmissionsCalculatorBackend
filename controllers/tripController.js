// controllers/tripController.js
const Trip = require('../models/Trip');
const { calculateEmission } = require('../utils/emissionsCalculator');

exports.startTrip = async (req, res) => {
  console.log('📍 Trip start endpoint hit');
  try {
    console.log('startTrip called with body:', req.body);
    console.log('User from token:', req.user);

    const { transportMode } = req.body;

    if (!transportMode) {
      return res.status(400).json({ error: 'Transport mode is required' });
    }

    const userId = req.user.id || req.user._id;

    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }
    
    const trip = new Trip({
      userId,
      transportMode,
      status: 'in-progress'
    });
    
    await trip.save();
    console.log('✅ Trip created successfully:', trip._id);
    
    res.json({ 
      tripId: trip._id,
      message: 'Trip started successfully'
    });
  } catch (error) {
    console.error('startTrip error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.endTrip = async (req, res) => {
  try {
    const { tripId, distanceKm, durationSeconds } = req.body;

    if (!tripId) {
      return res.status(400).json({ error: 'Trip ID is required' });
    }
    
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Verify the trip belongs to the authenticated user
    const userId = req.user.id || req.user._id;
    if (trip.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied to this trip' });
    }
    
    // Calculate emissions
    let emissionKg = 0;
    if (distanceKm && typeof calculateEmission === 'function') {
      try {
        emissionKg = calculateEmission({
          transportMode: trip.transportMode,
          distanceKm
        });
      } catch (calcError) {
        console.warn('Emission calculation failed:', calcError.message);
        // Continue without emission calculation
      }
    }
    
    // Update trip
    trip.distanceKm = distanceKm;
    trip.durationSec = durationSeconds;
    trip.emissionKg = emissionKg;
    trip.status = 'completed';
    trip.endTime = new Date();
    
    await trip.save();
    
    res.json({ 
      trip,
      message: 'Trip completed successfully'
    });
  } catch (error) {
    console.error('endTrip error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTripById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Trip ID is required' });
    }

    const trip = await Trip.findById(id);
    
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Verify the trip belongs to the authenticated user
    const userId = req.user.id || req.user._id;
    if (trip.userId.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Access denied to this trip' });
    }
    
    res.json({ trip });
  } catch (error) {
    console.error('getTripById error:', error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTrips = async (req, res) => {
  try {
    const userId = req.user.id;

    const trips = await Trip.find({ userId }).sort({ startTime: -1 });

    res.json({ 
      trips,
      count: trips.length
    });
  } catch (error) {
    console.error('getTrips error:', error);
    res.status(500).json({ error: error.message });
  }
};