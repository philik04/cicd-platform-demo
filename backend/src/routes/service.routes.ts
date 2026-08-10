import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as serviceController from "../controllers/service.controller";

export const serviceRouter = Router();

serviceRouter.get("/", asyncHandler(serviceController.getServices));
serviceRouter.get("/:id", asyncHandler(serviceController.getService));
serviceRouter.post("/", asyncHandler(serviceController.postService));
serviceRouter.patch("/:id", asyncHandler(serviceController.patchService));
serviceRouter.delete("/:id", asyncHandler(serviceController.removeService));
