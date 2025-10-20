// server.js
// ZapFix backend with Admin (signup/login) + upload + videos + comments + admin endpoints
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json()); // JSON bodies

// ---------- CONFIG (use env vars in production) ----------
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://Zapfix:Zapfix123@cluster0.lx3ihzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const CLOUD_NAME = process.env.CLOUD_NAME || "dvj0h4vkw";
const CLOUD_API_KEY = process.env.CLOUD_API_KEY || "938482952871232";
const CLOUD_API_SECRET = process.env.CLOUD_API_SECRET || "mVuK4bhXbzJB45Rq-BkGotoQft0";
const JWT_SECRET = process.env.JWT_SECRET || "zapfix_admin_secret_change_this"; // change in production

// ---------- Cloudinary ----------
cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: CLOUD_API_KEY,
  api_secret: CLOUD_API_SECRET,
});

// ---------- Mongoose ----------
mongoose.connect(MONGO_URI)
  .then(()=> console.log("✅ MongoDB connected"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ---------- Schemas ----------
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
const Admin = mongoose.model('Admin', AdminSchema);

const CommentSchema = new mongoose.Schema({
  name: String,
  text: String,
  createdAt: { type: Date, default: Date.now }
});

const VideoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  thumbnail: String,      // secure_url
  thumbnail_public_id: String,
  video: String,          // secure_url
  video_public_id: String,
  likes: { type: Number, default: 0 },
  comments: { type: [CommentSchema], default: [] },
  createdAt: { type: Date, default: Date.now }
});
const Video = mongoose.model('Video', VideoSchema);

// ---------- multer storage for cloudinary ----------
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video');
    const folder = isVideo ? 'zapfix/videos' : 'zapfix/thumbnails';
    return {
      folder,
      resource_type: isVideo ? 'video' : 'image',
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`
    };
  }
});
const upload = multer({ storage, limits: { fileSize: 300 * 1024 * 1024 } }); // 300MB limit

// ---------- helper: auth middleware ----------
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  if(!auth.startsWith('Bearer ')) return res.status(401).json({ success:false, message:'Unauthorized' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload; // { id, username }
    return next();
  } catch(err) {
    return res.status(401).json({ success:false, message:'Invalid token' });
  }
}

// ---------- PUBLIC ROUTES ----------
// root
app.get('/', (req, res) => res.json({ success:true, message:'ZapFix backend running' }));

// Upload (multipart) - used by upload.html
// expects fields: title, description, thumbnail (file), video (file)
app.post('/upload', upload.fields([{ name: 'thumbnail', maxCount: 1 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, description } = req.body;
    if(!title || !req.files || !req.files.thumbnail || !req.files.video) {
      return res.status(400).json({ success:false, message: 'Missing fields (title + thumbnail + video required)' });
    }
    const thumbFile = req.files.thumbnail[0];
    const videoFile = req.files.video[0];

    // Save video with public IDs (filename provided by Cloudinary storage)
    const newVideo = new Video({
      title: title.trim(),
      description: (description||'').trim(),
      thumbnail: thumbFile.path,
      thumbnail_public_id: thumbFile.filename || thumbFile.public_id || '',
      video: videoFile.path,
      video_public_id: videoFile.filename || videoFile.public_id || ''
    });
    await newVideo.save();
    return res.json({ success:true, message:'Upload saved', video: newVideo });
  } catch(err) {
    console.error('Upload error', err);
    return res.status(500).json({ success:false, message:'Upload failed', error: err.message || String(err) });
  }
});

// GET all videos (feed)
app.get('/videos', async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    return res.json({ success:true, videos });
  } catch(err) {
    console.error('Get videos error', err);
    return res.status(500).json({ success:false, message:'Failed to fetch videos' });
  }
});

// GET single video by id
app.get('/videos/:id', async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if(!v) return res.status(404).json({ success:false, message:'Video not found' });
    return res.json({ success:true, video: v });
  } catch(err) {
    console.error('Get video error', err);
    return res.status(500).json({ success:false, message:'Failed to fetch video' });
  }
});

// POST comment (public)
app.post('/videos/:id/comments', async (req, res) => {
  try {
    const { name, text } = req.body || {};
    if(!name || !text) return res.status(400).json({ success:false, message:'Name and text required' });
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).json({ success:false, message:'Video not found' });
    video.comments.push({ name: name.trim(), text: text.trim() });
    await video.save();
    return res.json({ success:true, comments: video.comments });
  } catch(err) {
    console.error('Add comment error', err);
    return res.status(500).json({ success:false, message:'Failed to add comment' });
  }
});

// POST like (public)
app.post('/videos/:id/like', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).json({ success:false, message:'Video not found' });
    video.likes = (video.likes || 0) + 1;
    await video.save();
    return res.json({ success:true, likes: video.likes });
  } catch(err) {
    console.error('Like error', err);
    return res.status(500).json({ success:false, message:'Failed to like' });
  }
});

// ---------- ADMIN AUTH (Signup & Login) ----------
// Signup (create admin) - public but should be used only once or by controlled process
app.post('/admin/signup', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if(!username || !password) return res.status(400).json({ success:false, message:'username & password required' });
    const exists = await Admin.findOne({ username });
    if(exists) return res.status(400).json({ success:false, message:'Admin already exists' });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const admin = new Admin({ username, passwordHash: hash });
    await admin.save();
    // return token
    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({ success:true, token, admin:{ id: admin._id, username: admin.username } });
  } catch(err) {
    console.error('Signup error', err);
    return res.status(500).json({ success:false, message:'Signup failed' });
  }
});

// Login
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if(!username || !password) return res.status(400).json({ success:false, message:'username & password required' });
    const admin = await Admin.findOne({ username });
    if(!admin) return res.status(400).json({ success:false, message:'Invalid credentials' });
    const match = await bcrypt.compare(password, admin.passwordHash);
    if(!match) return res.status(400).json({ success:false, message:'Invalid credentials' });
    const token = jwt.sign({ id: admin._id, username: admin.username }, JWT_SECRET, { expiresIn:'7d' });
    return res.json({ success:true, token, admin:{ id: admin._id, username: admin.username } });
  } catch(err) {
    console.error('Login error', err);
    return res.status(500).json({ success:false, message:'Login failed' });
  }
});

// ---------- ADMIN PROTECTED ROUTES ----------
// Get all videos (admin) (same as public but protected)
app.get('/admin/videos', authMiddleware, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    return res.json({ success:true, videos });
  } catch(err) {
    console.error('Admin get videos error', err);
    return res.status(500).json({ success:false, message:'Failed to fetch videos' });
  }
});

// Edit video (title/description)
app.put('/admin/videos/:id', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body || {};
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).json({ success:false, message:'Video not found' });
    if(title !== undefined) video.title = title.trim();
    if(description !== undefined) video.description = description;
    await video.save();
    return res.json({ success:true, video });
  } catch(err) {
    console.error('Admin edit video error', err);
    return res.status(500).json({ success:false, message:'Failed to edit video' });
  }
});

// Delete video (removes DB doc and Cloudinary assets if possible)
app.delete('/admin/videos/:id', authMiddleware, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if(!video) return res.status(404).json({ success:false, message:'Video not found' });

    // remove cloudinary files if public ids exist
    try {
      if(video.video_public_id){
        await cloudinary.uploader.destroy(video.video_public_id, { resource_type: 'video' });
      }
      if(video.thumbnail_public_id){
        await cloudinary.uploader.destroy(video.thumbnail_public_id, { resource_type: 'image' });
      }
    } catch(cloudErr){
      console.warn('Cloudinary deletion warning:', cloudErr && cloudErr.message ? cloudErr.message : cloudErr);
      // continue to remove DB record anyway
    }

    await Video.deleteOne({ _id: video._id });
    return res.json({ success:true, message:'Video deleted' });
  } catch(err) {
    console.error('Admin delete video error', err);
    return res.status(500).json({ success:false, message:'Failed to delete video' });
  }
});

// Get comments for a video (admin)
app.get('/admin/videos/:id/comments', authMiddleware, async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if(!v) return res.status(404).json({ success:false, message:'Video not found' });
    return res.json({ success:true, comments: v.comments });
  } catch(err) {
    console.error('Admin get comments error', err);
    return res.status(500).json({ success:false, message:'Failed to get comments' });
  }
});

// Delete comment by id
app.delete('/admin/videos/:id/comments/:commentId', authMiddleware, async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if(!v) return res.status(404).json({ success:false, message:'Video not found' });
    v.comments = v.comments.filter(c => String(c._id) !== String(req.params.commentId));
    await v.save();
    return res.json({ success:true, comments: v.comments });
  } catch(err) {
    console.error('Admin delete comment error', err);
    return res.status(500).json({ success:false, message:'Failed to delete comment' });
  }
});

// ---------- start ----------
app.listen(PORT, ()=> console.log(`🚀 ZapFix backend listening on port ${PORT}`));
