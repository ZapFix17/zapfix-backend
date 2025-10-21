import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import cors from "cors";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { Readable } from "stream";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

// Multer setup (store file in memory)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB error:", err));

// Video schema with likes and comments
const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  thumbnail: { type: String, required: true },
  video: { type: String, required: true },
  likes: { type: Number, default: 0 },
  comments: [{
    name: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Video = mongoose.model("Video", videoSchema);

// Helper function to upload buffer to Cloudinary
const uploadToCloudinary = (buffer, resourceType, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { 
        resource_type: resourceType,
        folder: folder
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    
    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
};

// ==================== PUBLIC ROUTES ====================

// Upload video route
app.post("/upload", upload.fields([{ name: "video" }, { name: "thumbnail" }]), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!req.files || !req.files.video || !req.files.thumbnail) {
      return res.status(400).json({ success: false, message: "Files missing" });
    }

    console.log("📤 Uploading files to Cloudinary...");

    // Upload thumbnail
    const thumbnailResult = await uploadToCloudinary(
      req.files.thumbnail[0].buffer,
      "image",
      "zapfix"
    );
    console.log("✅ Thumbnail uploaded");

    // Upload video
    const videoResult = await uploadToCloudinary(
      req.files.video[0].buffer,
      "video",
      "zapfix"
    );
    console.log("✅ Video uploaded");

    // Save to MongoDB
    const newVideo = await Video.create({
      title,
      description,
      thumbnail: thumbnailResult.secure_url,
      video: videoResult.secure_url
    });

    res.json({ 
      success: true, 
      video: newVideo.video, 
      thumbnail: newVideo.thumbnail,
      videoId: newVideo._id
    });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ success: false, message: "Upload failed", error: err.message });
  }
});

// Get all videos
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find({}).sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch videos" });
  }
});

// Get single video by ID
app.get("/videos/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }
    res.json({ success: true, video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch video" });
  }
});

// Like a video
app.post("/videos/:id/like", async (req, res) => {
  try {
    const video = await Video.findByIdAndUpdate(
      req.params.id,
      { $inc: { likes: 1 } },
      { new: true }
    );
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }
    res.json({ success: true, likes: video.likes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to like video" });
  }
});

// Post a comment
app.post("/videos/:id/comments", async (req, res) => {
  try {
    const { name, text } = req.body;
    
    if (!name || !text) {
      return res.status(400).json({ success: false, message: "Name and text required" });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    video.comments.push({ name, text, createdAt: new Date() });
    await video.save();

    res.json({ success: true, comments: video.comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to post comment" });
  }
});

// ==================== ADMIN ROUTES ====================

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Admin login
app.post("/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check credentials against environment variables
    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Compare password (you should hash it in production!)
    if (password !== process.env.ADMIN_PASS) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { email: email },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

// Get all videos (admin)
app.get("/admin/videos", verifyToken, async (req, res) => {
  try {
    const videos = await Video.find({}).sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch videos" });
  }
});

// Update video (admin)
app.put("/admin/video/:id", verifyToken, upload.single("thumbnail"), async (req, res) => {
  try {
    const { title, description } = req.body;
    const updateData = { title, description };

    // If new thumbnail uploaded
    if (req.file) {
      const thumbnailResult = await uploadToCloudinary(
        req.file.buffer,
        "image",
        "zapfix"
      );
      updateData.thumbnail = thumbnailResult.secure_url;
    }

    const video = await Video.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    res.json({ success: true, video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update video" });
  }
});

// Delete video (admin)
app.delete("/admin/video/:id", verifyToken, async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    res.json({ success: true, message: "Video deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete video" });
  }
});

// Delete comment (admin)
app.delete("/admin/video/:videoId/comment/:commentId", verifyToken, async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);
    
    if (!video) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }

    video.comments = video.comments.filter(
      comment => comment._id.toString() !== req.params.commentId
    );
    
    await video.save();

    res.json({ success: true, message: "Comment deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete comment" });
  }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Backend URL: http://localhost:${PORT}`);
});
