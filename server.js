const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const emissionRoutes = require("./routes/emissions");

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

app.use("/api/auth", authRoutes);
app.use("/api/emissions", emissionRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${ PORT }`));