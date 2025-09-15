// controllers/aiController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const SensorLog = require('../models/SensorLog');

// Configuration for AI microservice
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// File path for saving incoming sensor payloads (for dataset building)
const LOG_FILE = path.join(__dirname, '../logs/sensor_payloads.json');

// Ensure logs folder exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

class AIController {
  
  // Predict transport mode from sensor data, taken in 1-minute windows (600 samples at 10hz)
  static async predictTransportMode(req, res) {
    try {
      const { sensorDataArray, tripId, userId } = req.body;

      // Validate input
      if (!Array.isArray(sensorDataArray) || sensorDataArray.length !== 600) {
        return res.status(400).json({
          success: false,
          message: `Expected exactly 600 sensor samples for 1-minute prediction, got ${sensorDataArray?.length || 0}`
        });
      }

      if (!tripId) {
        return res.status(400).json({
          success: false,
          message: 'Trip ID is required'
        });
      }
      
      // Validate sensor data format
      const firstSample = sensorDataArray[0];
      if (!firstSample.accelerometer || !firstSample.gyroscope || !firstSample.gps) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sensor data format - missing accelerometer, gyroscope, or gps'
        });
      }

      // Log the batch for dataset collection
      try {
        const batchEntry = {
          timestamp: new Date().toISOString(),
          tripId,
          userId,
          sampleCount: sensorDataArray.length,
          data: sensorDataArray
      };

        let existingLogs = [];
        if (fs.existsSync(LOG_FILE)) {
          existingLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        }
        existingLogs.push(batchEntry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(existingLogs, null, 2));
      } catch (logErr) {
        console.error("⚠️ Failed to log sensor payload:", logErr.message);
      }

      //MOCK MODE (set MOCK_AI=true in env to enable)
      if (process.env.MOCK_AI === 'true') {
        console.log("Mock AI responding to sensor payload");
        return res.json({
          success: true,
          prediction: {
            mode: "car",
            confidence: 0.82,
            needsVerification: false,
            alternatives: ["bus", "bike"],
            processingTime: 45,
            samplesProcessed: 600
          }
        });
      }

       // Transform data for AI microservice (match expected format)
      const transformedData = sensorDataArray.map(sample => ({
        accelerometer: {
          x: sample.accelerometer.x,
          y: sample.accelerometer.y, 
          z: sample.accelerometer.z
        },
        gyroscope: {
          x: sample.gyroscope.alpha,  // Map alpha to x
          y: sample.gyroscope.beta,   // Map beta to y
          z: sample.gyroscope.gamma   // Map gamma to z
        },
        gps: {
          speed: sample.gps.speed || 0,
          altitude: sample.gps.altitude || 0,
          lat: sample.gps.lat,
          lon: sample.gps.lon
        }
      }));

      //Call AI microservice with Batch Data
      console.log(`🤖 Sending ${transformedData.length} samples to AI service...`);

      const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, {
        sensor_data_array: transformedData,
        trip_id: tripId
      }, {
        timeout: 30000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const prediction = aiResponse.data;
      
      // Log prediction for debugging
      console.log('AI Prediction:', prediction);

      // Store sensor data in MongoDB for future training
      try {
        const sensorLogs = sensorDataArray.map(sample => ({
          userId: userId || null,
          tripId,
          timestamp: new Date(sample.timestamp),
          accelerometer: sample.accelerometer,
          gyroscope: sample.gyroscope,
          gps: sample.gps
        }));

        await SensorLog.insertMany(sensorLogs);
        console.log(`💾 Stored ${sensorLogs.length} sensor readings in MongoDB`);
      } catch (dbError) {
        console.error('Database storage error:', dbError.message);
        // Don't fail the request if DB storage fails
      }

      // Return prediction with additional metadata
      res.json({
        success: true,
        prediction: {
          mode: prediction.predicted_mode,
          confidence: prediction.confidence,
          needsVerification: prediction.needs_user_check,
          alternatives: prediction.alternative_modes || [],
          processingTime: prediction.processing_time_ms,
          samplesProcessed: sensorDataArray.length,
          window_duration_seconds: 60
        }
      });

    } catch (error) {
      console.error('AI Service Error:', error.message);
      
      // Handle different error types
      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          message: 'AI service unavailable',
          fallback: 'manual_selection'
        });
      }
      
      if (error.response && error.response.status === 400) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sensor data format'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Prediction service error',
        fallback: 'manual_selection'
      });
    }
  }

  // User feedback for prediction correction
  static async submitPredictionFeedback(req, res) {
    try {
      const { tripId, predictedMode, actualMode, confidence, timestamp } = req.body;

      if (!tripId || !actualMode) {
        return res.status(400).json({
          success: false,
          message: 'Trip ID and actual mode are required'
        });
      }

      // Log feedback for model retraining
      const feedbackEntry = {
        timestamp: timestamp || new Date().toISOString(),
        tripId,
        predictedMode,
        actualMode,
        confidence,
        corrected: predictedMode !== actualMode
      };

      const feedbackFile = path.join(__dirname, '../logs/prediction_feedback.json');
      let existingFeedback = [];
      
      if (fs.existsSync(feedbackFile)) {
        existingFeedback = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
      }
      
      existingFeedback.push(feedbackEntry);
      fs.writeFileSync(feedbackFile, JSON.stringify(existingFeedback, null, 2));

      console.log(`📝 Prediction feedback logged: ${predictedMode} → ${actualMode}`);

      res.json({
        success: true,
        message: 'Feedback recorded successfully'
      });

    } catch (error) {
      console.error('Feedback logging error:', error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to record feedback'
      });
    }
  }

  // Health check for AI service
  static async checkAIHealth(req, res) {
    try {
      const response = await axios.get(`${AI_SERVICE_URL}/health`, {
        timeout: 3000
      });
      
      res.json({
        aiServiceStatus: 'healthy',
        response: response.data
      });
    } catch (error) {
      res.status(503).json({
        aiServiceStatus: 'unhealthy',
        error: error.message
      });
    }
  }
}

module.exports = AIController;