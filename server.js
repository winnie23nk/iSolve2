const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// MongoDB connection
mongoose
  .connect("mongodb://localhost:27017/carpool", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

let takerMatch = null;
let providerMatch = null;

// Schema & Model
const carpoolSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  contactNo: { type: String, required: true },
  source: { type: Object, required: true }, // Store coordinates as an object
  destination: { type: Object, required: true },
  vehicleType: { type: String, required: true },
  userType: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const Carpool = mongoose.model("Carpool", carpoolSchema);

// Routes
app.post("/find-ride", async (req, res) => {
  const { source, destination, vehicleType, userName, contactNo } = req.body;

  try {
    const newRequest = new Carpool({
      userName,
      contactNo,
      source,
      destination,
      vehicleType,
      userType: "serviceTaker",
    });
    await newRequest.save();
    const matchedProvider = await matchRide(newRequest);

    if (matchedProvider) {
      providerMatch = {
        userName: matchedProvider.userName,
        contactNo: matchedProvider.contactNo,
        source: matchedProvider.source,
        destination: matchedProvider.destination,
        vehicleType: matchedProvider.vehicleType,
        timestamp: matchedProvider.timestamp,
      };

      takerMatch = {
        userName,
        contactNo,
        source,
        destination,
        vehicleType,
      };

      res.status(200).send({ message: "Match found!" });
    } else {
      res
        .status(200)
        .send({ message: "No match found within the 10-minute window." });
    }
  } catch (err) {
    console.error("Error in find-ride:", err);
    res.status(500).send({ error: "Failed to submit request" });
  }
});

app.post("/provide-service", async (req, res) => {
  const { source, destination, vehicleType, userName, contactNo } = req.body;

  // Validate input
  if (!source || !destination || !vehicleType || !userName || !contactNo) {
    return res.status(400).send({ error: "All fields are required." });
  }

  try {
    const newService = new Carpool({
      userName,
      contactNo,
      source,
      destination,
      vehicleType,
      userType: "serviceProvider",
    });
    await newService.save();
    res.status(200).send({ message: "Service offer submitted successfully!" });
  } catch (err) {
    console.error("Error saving service offer:", err);
    res.status(500).send({ error: "Failed to submit service offer" });
  }
});

// Distance calculation using Haversine formula
const haversineDistance = (coords1, coords2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (coords2.lat - coords1.lat) * (Math.PI / 180);
  const dLon = (coords2.lng - coords1.lng) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coords1.lat * (Math.PI / 180)) *
      Math.cos(coords2.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
};

// Matching logic
const minutesToMilliseconds = (minutes) => minutes * 60 * 1000;

const matchRide = async (serviceTaker) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - minutesToMilliseconds(10));

    const providers = await Carpool.find({
      userType: "serviceProvider",
      timestamp: { $gte: tenMinutesAgo },
    });

    // Filter providers based on distance
    const matchedProvider = providers.find((provider) => {
      const distance = haversineDistance(serviceTaker.source, provider.source);
      return distance <= 5 && provider.vehicleType === serviceTaker.vehicleType; // Check if within 5 km and vehicle type matches
    });

    return matchedProvider;
  } catch (err) {
    console.error("Error matching ride:", err);
    return null;
  }
};

app.get("/get-taker-match", (req, res) => {
  if (takerMatch) {
    res.status(200).json(takerMatch);
  } else {
    res.status(404).json({ message: "No match found for taker." });
  }
});

// Route to get provider's match
app.get("/get-provider-match", (req, res) => {
  if (providerMatch) {
    res.status(200).json(providerMatch);
  } else {
    res.status(404).json({ message: "No match found for provider." });
  }
});

// Starting server
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
