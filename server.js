import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ========== Cloudinary Config ==========
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME || "dvj0h4vkw",
  api_key: process.env.API_KEY || "938482952871232",
  api_secret: process.env.API_SECRET || "mVuK4bhXbzJB45Rq-BkGotoQft0",
});

// ========== MongoDB Connection ==========
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://Zapfix:Zapfix123@cluster0.lx3ihzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ========== Mongoose Schema ==========
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnail: String,
  video: String,
  createdAt: { type: Date, default: Date.now },
});

const Video = mongoose.model("Video", videoSchema);

// ========== Multer Cloudinary Setup ==========
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    let folder = "zapfix";
    let resource_type = "auto"; // handles both image/video
    return {
      folder,
      resource_type,
      public_id: file.originalname.split(".")[0],
    };
  },
});

const upload = multer({ storage });

// ========== API ROUTES ==========

// ➤ Upload video and thumbnail
app.post("/upload", upload.fields([{ name: "video" }, { name: "thumbnail" }]), async (req, res) => {
  try {
    const { title, description } = req.body;
    const videoFile = req.files["video"]?.[0];
    const thumbFile = req.files["thumbnail"]?.[0];

    if (!videoFile || !thumbFile) {
      return res.status(400).json({ success: false, message: "Missing files" });
    }

    const newVideo = new Video({
      title,
      description,
      video: videoFile.path,
      thumbnail: thumbFile.path,
    });

    await newVideo.save();

    res.json({ success: true, message: "Uploaded successfully", video: newVideo });
  } catch (error) {
    console.error("❌ Upload error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ➤ Get all videos
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json({ success: true, videos });
  } catch (error) {
    console.error("❌ Fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ➤ Default route
app.get("/", (req, res) => {
  res.send("ZapFix Backend Running ✅");
});

// ========== Start Server ==========
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
