const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const emissionRoutes = require("./routes/emissions");
const tripRoutes = require("./routes/trips"); 
const aiRoutes = require('./routes/ai');

dotenv.config();

const app = express();
app.use(cors({
    origin: [
        "https://emissionscalculator.duckdns.org", // your frontend domain
        "http://localhost:5173" // keep for local dev
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error(err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/emissions", emissionRoutes);
app.use("/api/trips", tripRoutes);
app.use('/api/ai', aiRoutes);

// Basic health check route
app.get('/', (req, res) => {
    res.json({ message: 'Emissions Calculator API is running!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));