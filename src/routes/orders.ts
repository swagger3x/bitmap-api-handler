import { Router } from "express";
import { OrderController } from "../controllers/orderController";

const router = Router();

router.post("/", OrderController.create);
router.get("/active", OrderController.getActive);
router.get("/:id", OrderController.getOne);
router.post("/:id/psbt", OrderController.submitPsbt);

export { router as orderRoutes };
