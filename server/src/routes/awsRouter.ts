import { Router } from 'express';
import { publishAWSServices } from '../controllers/awsController.js';

const awsRouter = Router();

awsRouter.post("/publish", publishAWSServices);

export default awsRouter;