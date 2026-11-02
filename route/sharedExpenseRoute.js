
import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';


import {
  createGroup,
  getMyGroups,
  addGroupMember,
  getGroupById,
  createSharedExpense,
  getMySharedExpenses,
  settleSharedExpense
} from '../controller/sharedExpenseController.js';


const router = express.Router();

// Group routes
router.post('/api/shared/groups', authMiddleware, createGroup);
router.get('/api/shared/groups', authMiddleware, getMyGroups);

router.post(
  '/api/shared/groups/:groupId/members',
  authMiddleware,
  addGroupMember
);

router.get(
  '/api/shared/groups/:groupId',
  authMiddleware,
  getGroupById
);

// Shared expense routes
router.post(
  '/api/shared/expenses',
  authMiddleware,
  createSharedExpense
);

router.get(
  '/api/shared/expenses',
  authMiddleware,
  getMySharedExpenses
);

router.post(
  '/api/shared/expenses/:expenseId/settle',
  authMiddleware,
  settleSharedExpense
);

export default router;
