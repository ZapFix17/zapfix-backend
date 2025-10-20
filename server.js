// server.js
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import jwt from "jsonwebtoken";
import bodyParser from "body-parser";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB connected"))
.catch(err => console.error("MongoDB error:", err));

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// Storage setup
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "ZapFix_upload",
    allowed_formats: ["jpg", "jpeg", "png", "mp4", "mov", "avi"],
    resource_type: "auto"
  }
});

const upload = multer({ storage });

// JWT Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if(!token) return res.status(401).json({ success: false, message: "Access denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch(err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Schemas
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnail: String,
  video: String,
  comments: [
    {
      name: String,
      text: String,
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

const Video = mongoose.model("Video", videoSchema);

// Routes

// Admin login
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  // Replace with your credentials
  if(username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS){
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: "1d" });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, message: "Invalid credentials" });
});

// Upload video (admin only)
app.post("/upload", verifyToken, upload.fields([{ name: "video" }, { name: "thumbnail" }]), async (req, res) => {
  try{
    const { title, description } = req.body;
    const videoFile = req.files["video"][0].path;
    const thumbFile = req.files["thumbnail"][0].path;

    const newVideo = new Video({
      title,
      description,
      video: videoFile,
      thumbnail: thumbFile
    });

    await newVideo.save();
    res.json({ success: true, video: videoFile, thumbnail: thumbFile });
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
});

// Get all videos
app.get("/videos", async (req, res) => {
  try{
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Cannot fetch videos" });
  }
});

// Delete video (admin)
app.delete("/videos/:id", verifyToken, async (req, res) => {
  try{
    await Video.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
});

// Update video title/description/thumbnail (admin)
app.put("/videos/:id", verifyToken, upload.single("thumbnail"), async (req, res) => {
  try{
    const updateData = {};
    if(req.body.title) updateData.title = req.body.title;
    if(req.body.description) updateData.description = req.body.description;
    if(req.file) updateData.thumbnail = req.file.path;

    const updatedVideo = await Video.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, video: updatedVideo });
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

// Add comment
app.post("/videos/:id/comment", async (req, res) => {
  try{
    const { name, text } = req.body;
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).json({ success: false, message: "Video not found" });

    video.comments.push({ name, text });
    await video.save();
    res.json({ success: true, comments: video.comments });
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Cannot add comment" });
  }
});

// Delete comment (admin)
app.delete("/videos/:videoId/comment/:commentId", verifyToken, async (req, res) => {
  try{
    const video = await Video.findById(req.params.videoId);
    if(!video) return res.status(404).json({ success: false, message: "Video not found" });

    video.comments = video.comments.filter(c => c._id.toString() !== req.params.commentId);
    await video.save();
    res.json({ success: true, comments: video.comments });
  } catch(err){
    console.error(err);
    res.status(500).json({ success: false, message: "Cannot delete comment" });
  }
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
