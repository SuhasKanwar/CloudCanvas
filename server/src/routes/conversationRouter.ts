import { Router } from "express";

import { clearSketchConversation, getSketchConversation, sendSketchConversationMessage } from "../controllers/conversationController.js";

const conversationRouter = Router({ mergeParams: true });

conversationRouter.get("/", getSketchConversation);
conversationRouter.delete("/", clearSketchConversation);
conversationRouter.post("/messages", sendSketchConversationMessage);

export default conversationRouter;
