import { Router, type IRouter } from "express";
import healthRouter from "./health";
import categoriesRouter from "./categories";
import productsRouter from "./products";
import customersRouter from "./customers";
import expensesRouter from "./expenses";
import ordersRouter from "./orders";
import dashboardRouter from "./dashboard";
import reportsRouter from "./reports";
import authRouter, { seedDefaultUsers } from "./auth";
import usersRouter from "./users";
import publicRouter from "./public";

const router: IRouter = Router();

router.use(publicRouter);
router.use(authRouter);
router.use(healthRouter);
router.use(categoriesRouter);
router.use(productsRouter);
router.use(customersRouter);
router.use(expensesRouter);
router.use(ordersRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(usersRouter);

void seedDefaultUsers();

export default router;
