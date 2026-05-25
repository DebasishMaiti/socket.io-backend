import express from "express";
import protectRoute from "../middleware/auth.middleware";
import { getUsersForSidebar, searchUsers, updateProfile, getUserProfile } from "./user.controller";
import { uploadImage } from "../middleware/multer";

const router = express.Router();

router.get("/", protectRoute, getUsersForSidebar);
router.get("/search", protectRoute, searchUsers);
router.post("/update", protectRoute, uploadImage.single('profilePic'), updateProfile);
router.get("/profile/:id", protectRoute, getUserProfile);

export default router;
