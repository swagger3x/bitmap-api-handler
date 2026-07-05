import { Router } from "express";
import { InscriptionController } from "../controllers/inscriptionController";

const router = Router();

router.post("/", InscriptionController.createOrder);

export { router as inscriptionRoutes };
