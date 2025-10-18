import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Connect to MongoDB
mongoose.connect("mongodb+srv://Zapfix:Zapfix123@cluster0.lx3ihzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

// ✅ Setup Cloudinary
cloudinary.config({
  cloud_name: "dvj0h4vkw",
  api_key: "938482952871232",
  api_secret: "mVuK4bhXbzJB45Rq-BkGotoQft0",
});

// ✅ Setup Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    let folder = "ZapFix_upload";
    let resource_type = file.mimetype.startsWith("video/") ? "video" : "image";

    return {
      folder,
      resource_type,
      allowed_formats: ["mp4", "jpg", "jpeg", "png"],
      public_id: `${Date.now()}-${file.originalname}`,
    };
  },
});

const upload = multer({ storage });

// ✅ Define Video Schema
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnailUrl: String,
  videoUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const Video = mongoose.model("Video", videoSchema);

// ✅ Upload API
app.post("/upload", upload.fields([{ name: "thumbnail" }, { name: "video" }]), async (req, res) => {
  try {
    const { title, description } = req.body;
    const thumbnail = req.files["thumbnail"] ? req.files["thumbnail"][0].path : null;
    const video = req.files["video"] ? req.files["video"][0].path : null;

    if (!video || !thumbnail) {
      return res.status(400).json({ error: "Thumbnail and video required!" });
    }

    const newVideo = new Video({
      title,
      description,
      thumbnailUrl: thumbnail,
      videoUrl: video,
    });

    await newVideo.save();
    res.status(200).json({ message: "✅ Upload successful!" });
  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Upload failed!" });
  }
});

// ✅ Fetch All Videos
app.get("/videos", async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: "Error fetching videos" });
  }
});

// ✅ Root route
app.get("/", (req, res) => {
  res.send("🚀 ZapFix Backend is Running Successfully!");
});

// ✅ Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
