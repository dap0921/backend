
import express from 'express';

import {
  getAllUsers,
  getAllExpenses,
  getAdminStats,
  deleteUserByAdmin,
  getUserDetailsByAdmin
} from '../controller/adminController.js';

import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

// Admin authentication applies only to admin endpoints.
router.use('/admin', adminMiddleware);

router.get('/admin/users', getAllUsers);
router.get('/admin/users/:id', getUserDetailsByAdmin);
router.get('/admin/expenses', getAllExpenses);
router.get('/admin/stats', getAdminStats);
router.delete('/admin/users/:id', deleteUserByAdmin);

export default router;
