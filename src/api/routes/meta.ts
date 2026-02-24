import { Router } from "express";
import { FIELD_LABELS } from "../../shared/fieldLabels";

export const metaRouter = Router();

metaRouter.get("/field-labels", (_req, res) => {
  res.json({ fieldLabels: FIELD_LABELS });
});
