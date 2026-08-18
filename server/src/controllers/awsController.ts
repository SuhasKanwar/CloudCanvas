import type { Request, Response } from "express";
import type { ApiResponse } from "../types/response.js";
import { awsResourceManager, type Ec2InstanceRequest } from "../services/aws.js";

export async function publishAWSServices(req: Request, res: Response<ApiResponse>) {
    try {
        const service = req.body?.service ?? "ec2";
        if (service !== "ec2") {
            return res.status(400).json({
                success: false,
                message: "Only EC2 publishing is supported right now.",
            });
        }

        const ec2Request = (req.body?.ec2 ?? req.body) as Ec2InstanceRequest;
        if (!ec2Request?.imageId) {
            return res.status(400).json({
                success: false,
                message: "imageId is required to create an EC2 instance.",
            });
        }

        const data = await awsResourceManager.createEc2Instance(ec2Request);
        return res.status(201).json({
            success: true,
            message: "EC2 instance creation started.",
            data,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to create EC2 instance.",
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
