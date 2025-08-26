const express = require('express');
const router = express.Router();
const tripController = require('../controllers/tripController');
const auth = require('../middleware/authMiddleware'); // Make sure this middleware exists

// All trip routes require authentication
router.use(auth);

router.post('/start', tripController.startTrip);
router.post('/end', tripController.endTrip);
router.get('/:id', tripController.getTripById);
router.get('/', tripController.getTrips);

module.exports = router;