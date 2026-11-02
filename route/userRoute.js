import express from 'express';

import {
  addUser,
  getUser,
  getSingleUser,
  deleteUser,
  updateUser,
  loginUser,
  getProfile,
  updateProfile
} from '../controller/userDataController.js';

import authMiddleware from '../middleware/authMiddleware.js';
import multer from "multer";
import { uploadProfileImage } from "../controller/profileImageController.js";
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Only JPG, PNG, and WebP images are allowed"));
    }
  }
});

// User registration
router.post('/add-user', addUser);
router.post(
  "/profile/upload-image",
  authMiddleware,
  upload.single("profileImage"),
  uploadProfileImage
);

// User login
router.post('/login', loginUser);

// Existing user routes
router.get('/get-user', getUser);

router.get('/get-single-user/:uid', getSingleUser);

router.put('/update-user/:uid', updateUser);

router.delete('/delete-user/:uid', deleteUser);

// Logged-in user's profile
router.get('/profile', authMiddleware, getProfile);

router.put('/profile', authMiddleware, updateProfile);

export default router;