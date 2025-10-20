// server.js
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// ===== MONGOOSE MODELS =====
const videoSchema = new mongoose.Schema({
  title: String,
  description: String,
  thumbnail: String,
  video: String,
  comments: [{ name: String, text: String }]
});
const Video = mongoose.model('Video', videoSchema);

const adminSchema = new mongoose.Schema({
  username: String,
  password: String
});
const Admin = mongoose.model('Admin', adminSchema);

// ===== CLOUDINARY CONFIG =====
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'zapfix',
    allowed_formats: ['jpg','png','mp4'],
    resource_type: 'auto'
  }
});

const upload = multer({ storage });

// ===== MONGODB CONNECT =====
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error("❌ MONGO_URI is undefined! Set it in .env or Render environment.");
  process.exit(1);
}

mongoose.connect(mongoUri)
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("MongoDB connection error:", err));

// ===== ADMIN LOGIN =====
app.post('/admin/login', async (req,res)=>{
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if(!admin) return res.status(401).json({ success:false, message:"Invalid credentials" });
  const match = await bcrypt.compare(password, admin.password);
  if(!match) return res.status(401).json({ success:false, message:"Invalid credentials" });

  const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn:'7d' });
  res.json({ success:true, token });
});

// ===== MIDDLEWARE =====
const authMiddleware = (req,res,next)=>{
  const token = req.headers['authorization']?.split(' ')[1];
  if(!token) return res.status(401).json({ success:false, message:"No token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id;
    next();
  } catch(err){
    return res.status(401).json({ success:false, message:"Invalid token" });
  }
};

// ===== VIDEO ROUTES =====

// Upload video + thumbnail
app.post('/upload', upload.fields([{name:'video', maxCount:1},{name:'thumbnail', maxCount:1}]), async (req,res)=>{
  try {
    const { title, description } = req.body;
    const videoFile = req.files['video'][0];
    const thumbFile = req.files['thumbnail'][0];

    const newVideo = await Video.create({
      title,
      description,
      video: videoFile.path,
      thumbnail: thumbFile.path,
      comments:[]
    });

    res.json({ success:true, video:newVideo.video, thumbnail:newVideo.thumbnail });
  } catch(err){
    console.error(err);
    res.status(500).json({ success:false, message:"Upload failed" });
  }
});

// Get all videos
app.get('/videos', async (req,res)=>{
  try {
    const videos = await Video.find();
    res.json(videos);
  } catch(err){
    res.status(500).json({ success:false, message:"Failed to fetch videos" });
  }
});

// Add comment
app.post('/videos/:id/comment', async (req,res)=>{
  const { name, text } = req.body;
  try {
    const video = await Video.findById(req.params.id);
    video.comments.push({ name, text });
    await video.save();
    res.json({ success:true, comments:video.comments });
  } catch(err){
    res.status(500).json({ success:false, message:"Failed to add comment" });
  }
});

// ===== ADMIN PANEL =====

// Delete video
app.delete('/admin/video/:id', authMiddleware, async (req,res)=>{
  try {
    await Video.findByIdAndDelete(req.params.id);
    res.json({ success:true });
  } catch(err){
    res.status(500).json({ success:false});
  }
});

// Edit video (title/description + optional thumbnail)
app.put('/admin/video/:id', authMiddleware, upload.single('thumbnail'), async (req,res)=>{
  try {
    const { title, description } = req.body;
    const updateData = { title, description };
    if(req.file) updateData.thumbnail = req.file.path;
    const video = await Video.findByIdAndUpdate(req.params.id, updateData, { new:true });
    res.json({ success:true, video });
  } catch(err){
    res.status(500).json({ success:false });
  }
});

// Delete comment
app.delete('/admin/comment/:videoId/:commentIndex', authMiddleware, async (req,res)=>{
  try {
    const video = await Video.findById(req.params.videoId);
    video.comments.splice(req.params.commentIndex,1);
    await video.save();
    res.json({ success:true });
  } catch(err){
    res.status(500).json({ success:false });
  }
});

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, 'public')));

// ===== START SERVER =====
const port = process.env.PORT || 5000;
app.listen(port, ()=>console.log(`🚀 Server running on port ${port}`));
