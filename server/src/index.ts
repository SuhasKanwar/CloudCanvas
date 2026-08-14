import express, { type Request, type Response } from 'express';
import type { ApiResponse } from './types/response.js';
import { PORT } from './lib/config.js';

const app = express();

app.get("/", (_req: Request, res: Response<ApiResponse>) => {
    res.json({
        success: true,
        message: "CloudCanvas server is running successfully."
    });
});

app.get("/health", (_req: Request, res: Response<ApiResponse>) => {
    res.json({
        success: true,
        message: "CloudCanvas server is healthy."
    });
});

app.listen(PORT, (err) => {
    if(err) {
        console.error("Error starting server ->", err);
    } else {
        console.log(`Server is running on port -> ${PORT}`);
    }
});