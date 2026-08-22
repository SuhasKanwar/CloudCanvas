import { Router } from 'express';
import { createAwsConnection, deleteAwsConnection, getAwsResourceCatalog, listAwsConnections, setActiveAwsConnection } from '../controllers/infrastructureController.js';

const awsRouter = Router();

awsRouter.post("/connections", createAwsConnection);
awsRouter.get("/connections", listAwsConnections);
awsRouter.get("/connections/:connectionId/catalog", getAwsResourceCatalog);
awsRouter.patch("/connections/:connectionId/active", setActiveAwsConnection);
awsRouter.delete("/connections/:connectionId", deleteAwsConnection);

export default awsRouter;
