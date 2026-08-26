import { Router } from "express";

import { getSketchConversation, sendSketchConversationMessage } from "../controllers/conversationController.js";

const conversationRouter = Router({ mergeParams: true });

conversationRouter.get("/", getSketchConversation);
conversationRouter.post("/messages", sendSketchConversationMessage);

export default conversationRouter;
