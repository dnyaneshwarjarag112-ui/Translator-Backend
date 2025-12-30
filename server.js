require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const User = require("./models/user");
const authenticateToken = require("./middleware/auth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// middleware
app.use(cors());
app.use(express.json());

// =======================
// MongoDB Connection
// =======================
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));

// =======================
// Schema (DAY WISE)
// =======================
const TranslationItemSchema = new mongoose.Schema({
    fromText: String,
    toText: String,
    fromLang: String,
    toLang: String,
    time: String
});

const DaySchema = new mongoose.Schema({
    date: { type: String },   
    
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    translations: [TranslationItemSchema]
});


const DayTranslate = mongoose.model("DayTranslate", DaySchema);
// =======================
// SIGNUP API
// =======================
app.post("/api/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            name,
            email,
            password: hashedPassword
        });

        res.json({ message: "Signup successful" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// =======================
// LOGIN API
// =======================
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({ token });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// =======================
// SAVE TRANSLATION API
// =======================
app.post("/api/save", authenticateToken, async (req, res) => {

    try {
        const { fromText, toText, fromLang, toLang } = req.body;

        if (!fromText || !toText) {
            return res.status(400).json({ message: "Invalid data" });
        }

        // today's date
        const today = new Date().toISOString().split("T")[0];
        const time = new Date().toLocaleTimeString();

       let dayDoc = await DayTranslate.findOne({
       date: today,
       userId: req.user.userId
});


        if (dayDoc) {
            // same day → push inside array
            dayDoc.translations.push({
                fromText,
                toText,
                fromLang,
                toLang,
                time
            });
            await dayDoc.save();
        } else {
            // new day document
            await DayTranslate.create({
                date: today,
                userId: req.user.userId,
                translations: [{
                    fromText,
                    toText,
                    fromLang,
                    toLang,
                    time
                }]
            });
        }

        // 🔥 Sliding window: max 30 DAYS
        const totalDays = await DayTranslate.countDocuments();

        if (totalDays > 30) {
            const oldestDay = await DayTranslate.findOne().sort({ date: 1 });
            if (oldestDay) {
                await DayTranslate.deleteOne({ _id: oldestDay._id });
            }
        }

        res.json({ message: "Saved successfully" });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =======================
// GET HISTORY API (ADDED)
// =======================
app.get("/api/history", authenticateToken, async (req, res) => {

    try {
       const days = await DayTranslate.find({
       userId: req.user.userId
      }).sort({ date: -1 });


        const history = [];

        days.forEach(day => {
            day.translations.forEach(item => {
                history.push({
                    date: day.date,
                    time: item.time,
                    fromText: item.fromText,
                    toText: item.toText,
                    fromLang: item.fromLang,
                    toLang: item.toLang
                });
            });
        });

        res.json(history);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =======================
// TEST ROUTE
// =======================
app.get("/", (req, res) => {
    res.send("Backend is running 🚀");
});

// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
