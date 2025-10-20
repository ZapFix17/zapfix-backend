import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import jwt from 'jsonwebtoken';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// MongoDB setup
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.error(err));

// Cloudinary setup
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});
const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'zapfix', resource_type: 'auto' }
});
const parser = multer({ storage });

// Schemas
const commentSchema = new mongoose.Schema({ name:String, text:String }, { timestamps:true });
const videoSchema = new mongoose.Schema({
  title:String,
  description:String,
  thumbnail:String,
  video:String,
  comments:[commentSchema]
}, { timestamps:true });

const Video = mongoose.model('Video', videoSchema);

// Admin credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@zapfix.com";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123";
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Middleware
const auth = (req,res,next)=>{
  const token = req.headers.authorization?.split(' ')[1];
  if(!token) return res.status(401).json({success:false,message:"No token"});
  try{
    const decoded = jwt.verify(token,JWT_SECRET);
    if(decoded.email !== ADMIN_EMAIL) return res.status(403).json({success:false,message:"Forbidden"});
    next();
  } catch(err){
    return res.status(401).json({success:false,message:"Invalid token"});
  }
};

// Admin login
app.post("/admin/login",(req,res)=>{
  const { email, password } = req.body;
  if(email === ADMIN_EMAIL && password === ADMIN_PASS){
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn:"12h" });
    return res.json({success:true,token});
  }
  return res.json({success:false});
});

// Get all videos (admin)
app.get("/admin/videos", auth, async (req,res)=>{
  const videos = await Video.find({});
  res.json({success:true,videos});
});

// Update video
app.put("/admin/video/:id", auth, parser.fields([{name:'thumbnail',maxCount:1}]), async (req,res)=>{
  const vid = await Video.findById(req.params.id);
  if(!vid) return res.json({success:false,message:"Video not found"});
  const { title, description } = req.body;
  if(title) vid.title = title;
  if(description) vid.description = description;
  if(req.files?.thumbnail) vid.thumbnail = req.files.thumbnail[0].path;
  await vid.save();
  res.json({success:true});
});

// Delete video
app.delete("/admin/video/:id", auth, async (req,res)=>{
  await Video.findByIdAndDelete(req.params.id);
  res.json({success:true});
});

// Delete comment
app.delete("/admin/video/:videoId/comment/:commentId", auth, async (req,res)=>{
  const vid = await Video.findById(req.params.videoId);
  if(!vid) return res.json({success:false,message:"Video not found"});
  vid.comments.id(req.params.commentId)?.remove();
  await vid.save();
  res.json({success:true});
});

// Upload video for users (existing)
app.post("/", parser.fields([{name:'thumbnail',maxCount:1},{name:'video',maxCount:1}]), async (req,res)=>{
  const { title, description } = req.body;
  const thumbnail = req.files.thumbnail[0].path;
  const video = req.files.video[0].path;
  const newVideo = new Video({ title, description, thumbnail, video });
  await newVideo.save();
  res.json({success:true,thumbnail,video});
});

// Get videos for feed
app.get("/", async (req,res)=>{
  const videos = await Video.find({});
  res.json(videos);
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
