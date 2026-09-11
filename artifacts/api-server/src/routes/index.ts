import { Router, type IRouter } from "express";
import healthRouter from "./health";
import learnersRouter from "./learners";
import learningRouter from "./learning";
import trainerRouter from "./trainer";
import quizRouter from "./quiz";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(learnersRouter);
router.use(learningRouter);
router.use(trainerRouter);
router.use(quizRouter);
router.use(aiRouter);

export default router;
