import express from 'express';

import {
  addExpense,
  getExpenses,
  getSingleExpense,
  updateExpense,
  deleteExpense,
  getExpenseSummary
} from '../controller/expenseController.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// All expense routes require login
router.use(authMiddleware);

// Add expense
router.post('/expenses', addExpense);

// Get all expenses
router.get('/expenses', getExpenses);

// Get expense summary
router.get('/expenses/summary', getExpenseSummary);

// Get single expense
router.get('/expenses/:id', getSingleExpense);

// Update expense
router.put('/expenses/:id', updateExpense);

// Delete expense
router.delete('/expenses/:id', deleteExpense);

export default router;