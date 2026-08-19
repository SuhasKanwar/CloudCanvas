import { Router } from 'express';
import { createAwsConnection, deleteAwsConnection, listAwsConnections } from '../controllers/infrastructureController.js';

const awsRouter = Router();

awsRouter.post("/connections", createAwsConnection);
awsRouter.get("/connections", listAwsConnections);
awsRouter.delete("/connections/:connectionId", deleteAwsConnection);

export default awsRouter;
