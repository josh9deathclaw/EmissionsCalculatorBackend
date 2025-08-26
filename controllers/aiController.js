// controllers/aiController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration for AI microservice
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8001';

// File path for saving incoming sensor payloads (for dataset building)
const LOG_FILE = path.join(__dirname, '../logs/sensor_payloads.json');

// Ensure logs folder exists
if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

class AIController {
  
  // Predict transport mode from sensor data
  static async predictTransportMode(req, res) {
    try {
      const { accelerometer, gyroscope, gps } = req.body;
      
      // Validate required sensor data
      if (!accelerometer || !gyroscope || !gps) {
        return res.status(400).json({
          success: false,
          message: 'Missing required sensor data (accelerometer, gyroscope, gps)'
        });
      }

      //Log the incoming payload for dataset collection
      try {
        const entry = {
          timestamp: new Date().toISOString(),
          accelerometer,
          gyroscope,
          gps
        };

        let existingLogs = [];
        if (fs.existsSync(LOG_FILE)) {
          existingLogs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
        }
        existingLogs.push(entry);
        fs.writeFileSync(LOG_FILE, JSON.stringify(existingLogs, null, 2));
      } catch (logErr) {
        console.error("⚠️ Failed to log sensor payload:", logErr.message);
      }

      //MOCK MODE (set MOCK_AI=true in env to enable)
      if (process.env.MOCK_AI === 'true') {
        console.log("📡 Mock AI responding to sensor payload");
        return res.json({
          success: true,
          prediction: {
            mode: "car",
            confidence: 0.82,
            needsVerification: false,
            alternatives: ["bus", "bike"],
            processingTime: 3
          }
        });
      }

      //Call AI microservice
      const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, {
        accelerometer,
        gyroscope,
        gps
      }, {
        timeout: 5000, // 5 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const prediction = aiResponse.data;
      
      // Log prediction for debugging
      console.log('✅ AI Prediction:', prediction);

      // Return prediction with additional metadata
      res.json({
        success: true,
        prediction: {
          mode: prediction.predicted_mode,
          confidence: prediction.confidence,
          needsVerification: prediction.needs_user_check,
          alternatives: prediction.alternative_modes || [],
          processingTime: prediction.processing_time_ms
        }
      });

    } catch (error) {
      console.error('❌ AI Service Error:', error.message);
      
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

  // Batch predict for historical data analysis
  static async batchPredict(req, res) {
    try {
      const { sensorDataArray } = req.body;
      
      if (!Array.isArray(sensorDataArray) || sensorDataArray.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid sensor data array'
        });
      }

      const predictions = [];
      
      // Process in batches to avoid overwhelming the AI service
      for (const sensorData of sensorDataArray) {
        try {
          const aiResponse = await axios.post(`${AI_SERVICE_URL}/predict`, sensorData);
          predictions.push({
            success: true,
            prediction: aiResponse.data
          });
        } catch (error) {
          predictions.push({
            success: false,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        predictions,
        totalProcessed: predictions.length
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Batch prediction failed',
        error: error.message
      });
    }
  }
}

module.exports = AIController;