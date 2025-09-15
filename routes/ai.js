// routes/ai.js
const express = require('express');
const router = express.Router();
const AIController = require('../controllers/aiController');
const authMiddleware = require('../middleware/authMiddleware');

// Predict transport mode from sensor data
router.post('/predict', authMiddleware, AIController.predictTransportMode);

// Check AI service health
router.get('/health', AIController.checkAIHealth);

// Batch prediction for analysis
// router.post('/batch-predict', authMiddleware, AIController.batchPredict);

module.exports = router;