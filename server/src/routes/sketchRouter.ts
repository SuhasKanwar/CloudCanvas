import { Router } from "express";
import {
    createSketch,
    createAiSketch,
    importSketchGraph,
    replaceSketchGraph,
    createSketchEdge,
    createSketchNode,
    deleteSketch,
    deleteSketchEdge,
    deleteSketchNode,
    deleteAwsResource,
    deploySketch,
    getSketch,
    listSketches,
    updateSketch,
    updateSketchNode,
} from "../controllers/infrastructureController.js";
import { graphParser } from "../services/graphParser.js";

const sketchRouter = Router();

sketchRouter.post("/", createSketch);
sketchRouter.post("/ai", createAiSketch);
sketchRouter.post("/import", graphParser, importSketchGraph);
sketchRouter.put("/:sketchId/import", graphParser, replaceSketchGraph);
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
sketchRouter.delete("/:sketchId/resources/:resourceId", deleteAwsResource);

export default sketchRouter;
