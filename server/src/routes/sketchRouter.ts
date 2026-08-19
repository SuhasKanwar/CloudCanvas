import { Router } from "express";
import {
    createSketch,
    createSketchEdge,
    createSketchNode,
    deleteSketch,
    deleteSketchEdge,
    deleteSketchNode,
    deploySketch,
    getSketch,
    listSketches,
    updateSketch,
    updateSketchNode,
} from "../controllers/infrastructureController.js";

const sketchRouter = Router();

sketchRouter.post("/", createSketch);
sketchRouter.get("/", listSketches);
sketchRouter.get("/:sketchId", getSketch);
sketchRouter.patch("/:sketchId", updateSketch);
sketchRouter.delete("/:sketchId", deleteSketch);
sketchRouter.post("/:sketchId/nodes", createSketchNode);
sketchRouter.patch("/:sketchId/nodes/:nodeId", updateSketchNode);
sketchRouter.delete("/:sketchId/nodes/:nodeId", deleteSketchNode);
sketchRouter.post("/:sketchId/edges", createSketchEdge);
sketchRouter.delete("/:sketchId/edges/:edgeId", deleteSketchEdge);
sketchRouter.post("/:sketchId/deploy", deploySketch);

export default sketchRouter;
