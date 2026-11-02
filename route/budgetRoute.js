import express from 'express';

import {
  getMonthlyBudget,
  setMonthlyBudget
} from '../controller/budgetController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Require a valid login, but not an admin role.
router.use(authMiddleware);

router.get('/budget', getMonthlyBudget);
router.put('/budget', setMonthlyBudget);

export default router;
