import userData from "../model/user.js";
import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";

export const uploadProfileImage = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "Unable to identify the logged-in user"
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image"
      });
    }

    const user = await userData.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const imageUrl = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "expense-tracker/profile-images",
          resource_type: "image"
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );

      Readable.from(req.file.buffer).pipe(uploadStream);
    });

    user.profileImage = imageUrl;
    await user.save();

    return res.status(200).json({
      message: "Profile picture uploaded successfully",
      data: {
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    console.error("Profile image upload error:", error);

    return res.status(500).json({
      message: "Failed to upload profile picture"
    });
  }
};