const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");   
const User = require("../models/User");
const bcrypt = require("bcryptjs");

router.post("/register", register);
router.post("/login", login);
// Change password (user must be logged in)
router.post("/change-password", auth, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);

        if (!user) return res.status(404).json({ error: "User not found" });

        // Check old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: "Old password is incorrect" });

        // Update to new password
        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;
        await user.save();

        res.json({ message: "Password updated successfully" });
    } catch (err) {
        console.error("Change password error:", err.message);
        res.status(500).json({ error: "Failed to change password" });
    }
});
module.exports = router;
