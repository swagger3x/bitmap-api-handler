import { Router } from "express";
import { BitmapController } from "../controllers/bitmapController";

const router = Router();

router.post("/sync", BitmapController.syncBitmaps);
router.post("/validate", BitmapController.validateBitmaps);
// router.get("/", BitmapController.getAllBitmaps);
// router.get("/search", BitmapController.searchBitmaps);
// router.get("/owner/:owner", BitmapController.getBitmapsByOwner);
// router.get(
//   "/inscription/:inscriptionId",
//   BitmapController.getBitmapByInscription
// );
// router.get("/:id", BitmapController.getBitmap);

export { router as bitmapRoutes };
