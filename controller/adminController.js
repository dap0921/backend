
import mongoose from 'mongoose';
import userData from '../model/user.js';
import expenseData from '../model/expense.js';

// GET /admin/users
export const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const search = String(req.query.search || '').trim();
    const filter = {};

    if (search) {
      const safeSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      userData
        .find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      userData.countDocuments(filter)
    ]);

    res.status(200).json({
      message: 'Users retrieved successfully',
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Failed to retrieve users' });
  }
};

// GET /admin/expenses
export const getAllExpenses = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const filter = {};

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.userId) {
      if (!mongoose.isValidObjectId(req.query.userId)) {
        return res.status(400).json({ message: 'Invalid user ID' });
      }

      filter.userId = req.query.userId;
    }

    if (req.query.from || req.query.to) {
      filter.date = {};

      if (req.query.from) {
        const from = new Date(req.query.from);

        if (Number.isNaN(from.getTime())) {
          return res.status(400).json({
            message: 'Invalid start date'
          });
        }

        filter.date.$gte = from;
      }

      if (req.query.to) {
        const to = new Date(req.query.to);

        if (Number.isNaN(to.getTime())) {
          return res.status(400).json({
            message: 'Invalid end date'
          });
        }

        to.setHours(23, 59, 59, 999);
        filter.date.$lte = to;
      }
    }

    const [expenses, total] = await Promise.all([
      expenseData
        .find(filter)
        .populate('userId', 'name email')
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      expenseData.countDocuments(filter)
    ]);

    res.status(200).json({
      message: 'Expenses retrieved successfully',
      data: expenses,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all expenses error:', error);
    res.status(500).json({ message: 'Failed to retrieve expenses' });
  }
};

// GET /admin/stats
export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const sixMonthsAgo = new Date(
      now.getFullYear(),
      now.getMonth() - 5,
      1
    );

    const [
      totalUsers,
      totalExpenses,
      allTimeResult,
      thisMonthResult,
      monthlyExpenses,
      categoryBreakdown,
      recentExpenses
    ] = await Promise.all([
      userData.countDocuments(),

      expenseData.countDocuments(),

      expenseData.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' }
          }
        }
      ]),

      expenseData.aggregate([
        { $match: { date: { $gte: monthStart } } },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]),

      expenseData.aggregate([
        { $match: { date: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$date' },
              month: { $month: '$date' }
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      expenseData.aggregate([
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { total: -1 } }
      ]),

      expenseData.find()
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    res.status(200).json({
      message: 'Admin statistics retrieved successfully',
      data: {
        totalUsers,
        totalExpenses,
        totalExpenseAmount: allTimeResult[0]?.total || 0,
        currentMonthExpenseAmount:
          thisMonthResult[0]?.total || 0,
        currentMonthTransactionCount:
          thisMonthResult[0]?.count || 0,
        monthlyExpenses: monthlyExpenses.map(item => ({
          year: item._id.year,
          month: item._id.month,
          total: item.total,
          count: item.count
        })),
        categoryBreakdown: categoryBreakdown.map(item => ({
          category: item._id,
          total: item.total,
          count: item.count
        })),
        recentExpenses
      }
    });
  } catch (error) {
    console.error('Admin statistics error:', error);
    res.status(500).json({
      message: 'Failed to retrieve admin statistics'
    });
  }
};

// DELETE /admin/users/:id
export const deleteUserByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        message: 'You cannot delete your own admin account'
      });
    }

    const user = await userData.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete expenses belonging to this user.
    await expenseData.deleteMany({ userId: user._id });
    await userData.deleteOne({ _id: user._id });

    res.status(200).json({
      message: 'User and associated expenses deleted successfully'
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({
      message: 'Failed to delete user'
    });
  }
};

 
// GET /admin/users/:id
export const getUserDetailsByAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 10)
    );

    const user = await userData
      .findById(id)
      .select('-password')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [summaryResult, expenses, totalTransactions, categoryBreakdown] =
      await Promise.all([
        expenseData.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(id) } },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
              totalExpenses: { $sum: 1 }
            }
          }
        ]),

        expenseData
          .find({ userId: id })
          .sort({ date: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),

        expenseData.countDocuments({ userId: id }),

        expenseData.aggregate([
          { $match: { userId: new mongoose.Types.ObjectId(id) } },
          {
            $group: {
              _id: '$category',
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { total: -1 } }
        ])
      ]);

    const summary = summaryResult[0] || {
      totalAmount: 0,
      totalExpenses: 0
    };

    return res.status(200).json({
      message: 'User details retrieved successfully',
      data: {
        user,
        summary: {
          totalExpenses: summary.totalExpenses,
          totalExpenseAmount: summary.totalAmount
        },
        categoryBreakdown: categoryBreakdown.map((item) => ({
          category: item._id,
          total: item.total,
          count: item.count
        })),
        expenses,
        pagination: {
          total: totalTransactions,
          page,
          limit,
          totalPages: Math.ceil(totalTransactions / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get admin user details error:', error);
    return res.status(500).json({
      message: 'Failed to retrieve user details'
    });
  }
};

