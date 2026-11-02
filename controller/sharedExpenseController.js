
import mongoose from 'mongoose';
import sharedGroup from '../model/sharedGroup.js';
import userData from '../model/user.js';
import sharedExpense from '../model/sharedExpense.js';

const getCurrentUserId = (req) => req.user?.id || req.user?._id;

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

// Create a group
export const createGroup = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const { name, description = '' } = req.body || {};

    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        message: 'Group name is required.'
      });
    }

    if (typeof description !== 'string') {
      return res.status(400).json({
        message: 'Description must be text.'
      });
    }

    const group = await sharedGroup.create({
      name: name.trim(),
      description: description.trim(),
      createdBy: userId,
      members: [userId]
    });

    return res.status(201).json({
      message: 'Group created successfully.',
      data: group
    });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({
      message: 'Failed to create group.'
    });
  }
};

// List groups for the logged-in user
export const getMyGroups = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);

    if (!userId || !isValidObjectId(userId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    const groups = await sharedGroup
      .find({ members: userId })
      .populate('members', 'name email')
      .populate('createdBy', 'name email')
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      message: 'Groups retrieved successfully.',
      data: groups
    });
  } catch (error) {
    console.error('Get groups error:', error);
    return res.status(500).json({
      message: 'Failed to retrieve groups.'
    });
  }
};

 
// Add an existing registered user to a group
export const addGroupMember = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { groupId } = req.params;
    const { email } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: 'Invalid group ID.'
      });
    }

    if (typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({
        message: 'Member email is required.'
      });
    }

    const group = await sharedGroup.findById(groupId);

    if (!group) {
      return res.status(404).json({
        message: 'Group not found.'
      });
    }

    if (group.createdBy.toString() !== currentUserId.toString()) {
      return res.status(403).json({
        message: 'Only the group creator can add members.'
      });
    }

    const member = await userData.findOne({
      email: email.trim().toLowerCase()
    }).select('_id name email');

    if (!member) {
      return res.status(404).json({
        message: 'No registered user found with that email.'
      });
    }

    if (group.members.some(id => id.toString() === member._id.toString())) {
      return res.status(409).json({
        message: 'This user is already in the group.'
      });
    }

    group.members.push(member._id);
    await group.save();

    return res.status(200).json({
      message: 'Member added successfully.',
      data: {
        groupId: group._id,
        member
      }
    });
  } catch (error) {
    console.error('Add group member error:', error);
    return res.status(500).json({
      message: 'Failed to add group member.'
    });
  }
};

// Get one group, but only for its members
export const getGroupById = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { groupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        message: 'Invalid group ID.'
      });
    }

    const group = await sharedGroup.findOne({
      _id: groupId,
      members: currentUserId
    })
      .populate('members', 'name email')
      .populate('createdBy', 'name email');

    if (!group) {
      return res.status(404).json({
        message: 'Group not found or you are not a member.'
      });
    }

    return res.status(200).json({
      message: 'Group retrieved successfully.',
      data: group
    });
  } catch (error) {
    console.error('Get group error:', error);
    return res.status(500).json({
      message: 'Failed to retrieve group.'
    });
  }
};

export const createSharedExpense = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);

    const {
      title,
      totalAmount,
      category = 'Other',
      paidBy,
      groupId = null,
      splits,
      date,
      notes = ''
    } = req.body || {};

    if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        message: 'Expense title is required.'
      });
    }

    const amount = Number(totalAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: 'Total amount must be greater than zero.'
      });
    }

    if (!Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({
        message: 'At least one split is required.'
      });
    }

    const payerId = paidBy || currentUserId;

    if (!mongoose.Types.ObjectId.isValid(payerId)) {
      return res.status(400).json({
        message: 'Invalid payer ID.'
      });
    }

    const normalizedSplits = [];
    const seenUsers = new Set();

    for (const split of splits) {
      if (
        !split ||
        !mongoose.Types.ObjectId.isValid(split.userId)
      ) {
        return res.status(400).json({
          message: 'Every split must contain a valid user ID.'
        });
      }

      const splitUserId = split.userId.toString();
      const share = Number(split.amountOwed);

      if (!Number.isFinite(share) || share < 0) {
        return res.status(400).json({
          message: 'Split amounts must be zero or greater.'
        });
      }

      if (seenUsers.has(splitUserId)) {
        return res.status(400).json({
          message: 'Each user can appear only once in the splits.'
        });
      }

      seenUsers.add(splitUserId);

      normalizedSplits.push({
        userId: splitUserId,
        amountOwed: Math.round(share * 100) / 100,
        settledAmount: 0
      });
    }

    const splitTotalCents = normalizedSplits.reduce(
      (sum, split) => sum + Math.round(split.amountOwed * 100),
      0
    );

    const expenseTotalCents = Math.round(amount * 100);

    if (splitTotalCents !== expenseTotalCents) {
      return res.status(400).json({
        message: 'Split amounts must add up exactly to the total amount.'
      });
    }

    const splitUserIds = normalizedSplits.map(
      split => split.userId
    );

    if (!splitUserIds.includes(payerId.toString())) {
      return res.status(400).json({
        message: 'The payer must be included in the splits.'
      });
    }

    if (!splitUserIds.includes(currentUserId.toString())) {
      return res.status(403).json({
        message: 'You must be included in the expense splits.'
      });
    }

    const allUserIds = [...new Set([
      ...splitUserIds,
      payerId.toString()
    ])];

    const existingUsers = await userData.find({
      _id: { $in: allUserIds }
    }).select('_id');

    if (existingUsers.length !== allUserIds.length) {
      return res.status(400).json({
        message: 'One or more split users do not exist.'
      });
    }

    if (groupId !== null) {
      if (!mongoose.Types.ObjectId.isValid(groupId)) {
        return res.status(400).json({
          message: 'Invalid group ID.'
        });
      }

      const group = await sharedGroup.findOne({
        _id: groupId,
        members: currentUserId
      });

      if (!group) {
        return res.status(403).json({
          message: 'You are not a member of this group.'
        });
      }

      const groupMemberIds = new Set(
        group.members.map(id => id.toString())
      );

      if (allUserIds.some(id => !groupMemberIds.has(id))) {
        return res.status(400).json({
          message: 'Every payer and split user must belong to the group.'
        });
      }
    } else if (allUserIds.length > 2) {
      return res.status(400).json({
        message: 'One-time splits can currently include at most two users.'
      });
    }

    const validCategories = [
      'Food',
      'Transport',
      'Shopping',
      'Bills',
      'Education',
      'Health',
      'Entertainment',
      'Other'
    ];

    if (!validCategories.includes(category)) {
      return res.status(400).json({
        message: 'Invalid expense category.'
      });
    }

    const expenseDate = date ? new Date(date) : new Date();

    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({
        message: 'Invalid expense date.'
      });
    }

    const expense = await (
      await import('../model/sharedExpense.js')
    ).default.create({
      title: title.trim(),
      totalAmount: Math.round(amount * 100) / 100,
      category,
      paidBy: payerId,
      groupId,
      splits: normalizedSplits,
      createdBy: currentUserId,
      date: expenseDate,
      notes: typeof notes === 'string' ? notes.trim() : ''
    });

    return res.status(201).json({
      message: 'Shared expense created successfully.',
      data: expense
    });
  } catch (error) {
    console.error('Create shared expense error:', error);

    return res.status(500).json({
      message: 'Failed to create shared expense.'
    });
  }
};

export const getMySharedExpenses = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);

    if (!currentUserId || !mongoose.Types.ObjectId.isValid(currentUserId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    const groups = await sharedGroup.find({
      members: currentUserId
    }).select('_id');

    const groupIds = groups.map(group => group._id);

    const expenses = await sharedExpense.find({
      $and: [
        {
          'splits.userId': currentUserId
        },
        {
          $or: [
            { groupId: null },
            { groupId: { $in: groupIds } }
          ]
        }
      ]
    })
      .populate('paidBy', 'name email')
      .populate('splits.userId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ date: -1 });

    return res.status(200).json({
      message: 'Shared expenses retrieved successfully.',
      data: expenses
    });
  } catch (error) {
    console.error('Get shared expenses error:', error);

    return res.status(500).json({
      message: 'Failed to retrieve shared expenses.'
    });
  }
};

export const settleSharedExpense = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { expenseId } = req.params;
    const { amount } = req.body || {};

    if (
      !currentUserId ||
      !mongoose.Types.ObjectId.isValid(currentUserId)
    ) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        message: 'Invalid expense ID.'
      });
    }

    const payment = Number(amount);

    if (!Number.isFinite(payment) || payment <= 0) {
      return res.status(400).json({
        message: 'Repayment amount must be greater than zero.'
      });
    }

    // Find an expense in which the logged-in user is a participant.
    const expense = await sharedExpense.findOne({
      _id: expenseId,
      $or: [
        { paidBy: currentUserId },
        { 'splits.userId': currentUserId }
      ]
    });

    if (!expense) {
      return res.status(404).json({
        message: 'Expense not found or you are not a participant.'
      });
    }

    // The payer receives repayments; they cannot repay themselves.
    if (expense.paidBy.toString() === currentUserId.toString()) {
      return res.status(400).json({
        message: 'The payer cannot repay themselves.'
      });
    }

    const split = expense.splits.find(
      item => item.userId.toString() === currentUserId.toString()
    );

    if (!split) {
      return res.status(403).json({
        message: 'Your share was not found in this expense.'
      });
    }

    const toCents = value => Math.round((value + Number.EPSILON) * 100);

    const owedCents = toCents(split.amountOwed);
    const settledCents = toCents(split.settledAmount || 0);
    const paymentCents = toCents(payment);
    const outstandingCents = owedCents - settledCents;

    if (paymentCents > outstandingCents) {
      return res.status(400).json({
        message: 'Repayment cannot exceed your outstanding balance.',
        outstandingAmount: outstandingCents / 100
      });
    }

    split.settledAmount =
      (settledCents + paymentCents) / 100;

    await expense.save();

    return res.status(200).json({
      message: 'Repayment recorded successfully.',
      data: {
        expenseId: expense._id,
        title: expense.title,
        amountPaid: paymentCents / 100,
        settledAmount: split.settledAmount,
        outstandingAmount:
          (owedCents - toCents(split.settledAmount)) / 100
      }
    });
  } catch (error) {
    console.error('Settle shared expense error:', error);
    return res.status(500).json({
      message: 'Failed to record repayment.'
    });
  }
};
