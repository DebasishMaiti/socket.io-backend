import { Request, Response } from 'express';
import * as userService from './user.service';
import fs from 'fs';

interface AuthRequest extends Request {
  user?: any;
}

export const getUsersForSidebar = async (req: AuthRequest, res: Response) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await userService.getAllUsersExcept(loggedInUserId);
    res.status(200).json(filteredUsers);
  } catch (error: any) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const loggedInUserId = req.user._id;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const matchedUsers = await userService.searchUsersByQuery(loggedInUserId, query as string);
    res.status(200).json(matchedUsers);
  } catch (error: any) {
    console.error("Error in searchUsers: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio } = req.body;
    const userId = req.user._id;
    let updateData: any = { name, bio };

    if (req.file) {
      const fileData = fs.readFileSync(req.file.path);
      updateData.profilePic = {
        data: fileData,
        contentType: req.file.mimetype,
      };
      // Optionally delete the file from disk after saving to DB
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error("Error deleting temp file:", err);
      }
    }

    const updatedUser = await userService.updateUser(userId, updateData);

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(updatedUser);
  } catch (error: any) {
    console.error("Error in updateProfile: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(id as string);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json(user);
  } catch (error: any) {
    console.error("Error in getUserProfile: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
