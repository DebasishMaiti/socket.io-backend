import express from "express";
import * as messageController from "./message.controller";
import protectRoute from "../middleware/auth.middleware";
import { uploadAudio as upload } from "../middleware/multer";

const router = express.Router();

router.get("/conversations", protectRoute, messageController.getConversations);
router.post("/create-group", protectRoute, messageController.createGroup);
router.get("/:id", protectRoute, messageController.getMessages);
router.post("/send/:id", protectRoute, messageController.sendMessage);
router.post("/send-voice/:id", protectRoute, upload.single('audio'), messageController.sendVoiceMessage);
router.post("/send-media/:id", protectRoute, upload.single('file'), messageController.sendMediaMessage);
router.post("/delete-me/:id", protectRoute, messageController.deleteMessageForMe);
router.post("/delete-everyone/:id", protectRoute, messageController.deleteMessageForEveryone);
router.post("/seen/:id", protectRoute, messageController.markMessagesAsSeen);
router.post("/leave/:id", protectRoute, messageController.leaveGroup);
router.post("/kick/:id", protectRoute, messageController.kickMember);
router.post("/promote/:id", protectRoute, messageController.promoteToAdmin);
router.post("/demote/:id", protectRoute, messageController.demoteToMember);
router.post("/update-group-image/:id", protectRoute, upload.single('image'), messageController.updateGroupProfile);
router.post("/add-members/:id", protectRoute, messageController.addMembersToGroup);

export default router;
