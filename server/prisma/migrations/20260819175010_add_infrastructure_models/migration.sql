-- CreateEnum
CREATE TYPE "SketchStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AwsResourceStatus" AS ENUM ('DESIRED', 'PROVISIONING', 'RUNNING', 'FAILED');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "Sketch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SketchStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sketch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchNode" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,

    CONSTRAINT "SketchNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SketchEdge" (
    "id" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,

    CONSTRAINT "SketchEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwsConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "accessKeyIdEncrypted" TEXT NOT NULL,
    "secretAccessKeyEncrypted" TEXT NOT NULL,
    "sessionTokenEncrypted" TEXT,
    "encryptionKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwsResource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "nodeId" TEXT,
    "connectionId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "region" TEXT NOT NULL,
    "status" "AwsResourceStatus" NOT NULL DEFAULT 'DESIRED',
    "desiredConfig" JSONB NOT NULL,
    "actualState" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AwsResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sketchId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "request" JSONB NOT NULL,
    "response" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sketch_userId_updatedAt_idx" ON "Sketch"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SketchNode_sketchId_idx" ON "SketchNode"("sketchId");

-- CreateIndex
CREATE INDEX "SketchEdge_sketchId_idx" ON "SketchEdge"("sketchId");

-- CreateIndex
CREATE INDEX "SketchEdge_sourceNodeId_idx" ON "SketchEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "SketchEdge_targetNodeId_idx" ON "SketchEdge"("targetNodeId");

-- CreateIndex
CREATE INDEX "AwsConnection_userId_updatedAt_idx" ON "AwsConnection"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AwsResource_nodeId_key" ON "AwsResource"("nodeId");

-- CreateIndex
CREATE INDEX "AwsResource_userId_sketchId_idx" ON "AwsResource"("userId", "sketchId");

-- CreateIndex
CREATE INDEX "AwsResource_connectionId_idx" ON "AwsResource"("connectionId");

-- CreateIndex
CREATE INDEX "AwsResource_externalId_idx" ON "AwsResource"("externalId");

-- CreateIndex
CREATE INDEX "Deployment_userId_sketchId_createdAt_idx" ON "Deployment"("userId", "sketchId", "createdAt");

-- AddForeignKey
ALTER TABLE "Sketch" ADD CONSTRAINT "Sketch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchNode" ADD CONSTRAINT "SketchNode_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "Sketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchEdge" ADD CONSTRAINT "SketchEdge_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "Sketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchEdge" ADD CONSTRAINT "SketchEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "SketchNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SketchEdge" ADD CONSTRAINT "SketchEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "SketchNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwsConnection" ADD CONSTRAINT "AwsConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwsResource" ADD CONSTRAINT "AwsResource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwsResource" ADD CONSTRAINT "AwsResource_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "Sketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwsResource" ADD CONSTRAINT "AwsResource_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "SketchNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwsResource" ADD CONSTRAINT "AwsResource_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AwsConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_sketchId_fkey" FOREIGN KEY ("sketchId") REFERENCES "Sketch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AwsConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
