
import express from "express";
import { chatWithAI } from "../controller/chatController.js";

const chatRouter = express.Router();

chatRouter.post("/api/chat", chatWithAI);

export default chatRouter;
