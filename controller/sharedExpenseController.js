
import mongoose from 'mongoose';
import sharedGroup from '../model/sharedGroup.js';
import userData from '../model/user.js';
import sharedExpense from '../model/sharedExpense.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const getCurrentUserId = (req) => req.user?.id || req.user?._id;

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const getRazorpayCredentials = () => {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  return keyId && keySecret ? { keyId, keySecret } : null;
};

const razorpayRequest = async (path, method, credentials, body) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${credentials.keyId}:${credentials.keySecret}`
      ).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error?.description || 'Razorpay could not process the request.'
    );
    error.statusCode = response.status === 401 ? 503 : 502;
    throw error;
  }

  return data;
};

const getOutstandingCents = (split) =>
  Math.max(
    0,
    Math.round(Number(split.amountOwed) * 100) -
      Math.round(Number(split.settledAmount || 0) * 100)
  );

const verifyRazorpaySignature = (orderId, paymentId, signature, secret) => {
  if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature)) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest();
  const received = Buffer.from(signature, 'hex');

  return received.length === expected.length &&
    timingSafeEqual(received, expected);
};

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

    const activePayment = expense.paymentAttempts.some(
      attempt =>
        attempt.userId.toString() === currentUserId.toString() &&
        attempt.status === 'created' &&
        attempt.expiresAt > new Date()
    );

    if (activePayment) {
      return res.status(409).json({
        message: 'A payment checkout is already in progress. Try again after it expires.'
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

export const createSharedExpensePaymentOrder = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { expenseId } = req.params;
    const credentials = getRazorpayCredentials();

    if (!currentUserId || !isValidObjectId(currentUserId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        message: 'Invalid expense ID.'
      });
    }

    if (!credentials) {
      return res.status(503).json({
        message: 'Razorpay is not configured on the backend.'
      });
    }

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

    const amountPaise = getOutstandingCents(split);

    if (amountPaise < 100) {
      return res.status(400).json({
        message: amountPaise === 0
          ? 'Your share is already settled.'
          : 'Razorpay orders must be at least ₹1.00.'
      });
    }

    const giver = await userData
      .findById(expense.paidBy)
      .select('+razorpayAccountId');

    if (!giver?.razorpayAccountId) {
      return res.status(400).json({
        message: 'The giver does not have a verified Razorpay Route linked account.'
      });
    }

    const now = new Date();
    const pendingAttempt = expense.paymentAttempts.find(
      attempt =>
        attempt.userId.toString() === currentUserId.toString() &&
        attempt.status === 'created' &&
        attempt.expiresAt > now
    );

    if (pendingAttempt) {
      if (
        pendingAttempt.amountPaise !== amountPaise ||
        pendingAttempt.razorpayAccountId !== giver.razorpayAccountId
      ) {
        return res.status(409).json({
          message: 'A previous checkout is still active. Wait for it to expire before starting another.'
        });
      }

      return res.status(200).json({
        message: 'Payment order retrieved successfully.',
        data: {
          keyId: credentials.keyId,
          orderId: pendingAttempt.orderId,
          amount: pendingAttempt.amountPaise,
          currency: 'INR'
        }
      });
    }

    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const receipt = `sh_${expenseId.slice(-12)}_${now.getTime().toString(36)}`;
    const order = await razorpayRequest('/orders', 'POST', credentials, {
      amount: amountPaise,
      currency: 'INR',
      receipt,
      expire_by: Math.floor(expiresAt.getTime() / 1000),
      notes: {
        expenseId: expenseId.toString(),
        userId: currentUserId.toString()
      },
      transfers: [
        {
          account: giver.razorpayAccountId,
          amount: amountPaise,
          currency: 'INR',
          notes: { expenseId: expenseId.toString() },
          on_hold: false
        }
      ]
    });

    const transfer = Array.isArray(order.transfers)
      ? order.transfers[0]
      : order.transfers?.items?.[0];

    if (
      !order.id ||
      Number(order.amount) !== amountPaise ||
      !transfer?.id ||
      (transfer.recipient || transfer.account) !== giver.razorpayAccountId ||
      Number(transfer.amount) !== amountPaise
    ) {
      return res.status(502).json({
        message: 'Razorpay did not confirm the expected order transfer.'
      });
    }

    expense.paymentAttempts.push({
      userId: currentUserId,
      orderId: order.id,
      amountPaise,
      razorpayAccountId: giver.razorpayAccountId,
      transferId: transfer.id,
      expiresAt
    });
    await expense.save();

    return res.status(201).json({
      message: 'Payment order created successfully.',
      data: {
        keyId: credentials.keyId,
        orderId: order.id,
        amount: amountPaise,
        currency: 'INR'
      }
    });
  } catch (error) {
    console.error('Create shared expense payment order error:', error.message);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : 'Failed to create Razorpay payment order.'
    });
  }
};

export const verifySharedExpensePayment = async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { expenseId } = req.params;
    const {
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature
    } = req.body || {};
    const credentials = getRazorpayCredentials();

    if (!currentUserId || !isValidObjectId(currentUserId)) {
      return res.status(401).json({
        message: 'Invalid authenticated user.'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      return res.status(400).json({
        message: 'Invalid expense ID.'
      });
    }

    if (
      typeof paymentId !== 'string' ||
      typeof orderId !== 'string' ||
      typeof signature !== 'string'
    ) {
      return res.status(400).json({
        message: 'Razorpay payment details are incomplete.'
      });
    }

    if (!credentials) {
      return res.status(503).json({
        message: 'Razorpay is not configured on the backend.'
      });
    }

    const expense = await sharedExpense.findOne({
      _id: expenseId,
      'paymentAttempts.orderId': orderId,
      'paymentAttempts.userId': currentUserId
    });
    const attempt = expense?.paymentAttempts.find(
      item =>
        item.orderId === orderId &&
        item.userId.toString() === currentUserId.toString()
    );

    if (!expense || !attempt) {
      return res.status(404).json({
        message: 'Payment order not found for this user and expense.'
      });
    }

    if (
      attempt.status === 'verified' &&
      attempt.paymentId === paymentId
    ) {
      return res.status(200).json({
        message: 'Payment was already verified and recorded.',
        data: {
          expenseId,
          amountPaid: attempt.amountPaise / 100,
          outstandingAmount: 0
        }
      });
    }

    if (attempt.status !== 'created') {
      return res.status(409).json({
        message: 'This payment order has already been processed.'
      });
    }

    if (!verifyRazorpaySignature(orderId, paymentId, signature, credentials.keySecret)) {
      return res.status(400).json({
        message: 'Razorpay payment signature is invalid.'
      });
    }

    const payment = await razorpayRequest(
      `/payments/${encodeURIComponent(paymentId)}`,
      'GET',
      credentials
    );

    if (
      payment.order_id !== orderId ||
      payment.status !== 'captured' ||
      payment.captured !== true ||
      payment.currency !== 'INR' ||
      Number(payment.amount) !== attempt.amountPaise
    ) {
      return res.status(400).json({
        message: 'Razorpay has not confirmed the expected captured payment.'
      });
    }

    const result = await mongoose.connection.transaction(async session => {
      const currentExpense = await sharedExpense
        .findById(expenseId)
        .session(session);
      const currentAttempt = currentExpense?.paymentAttempts.find(
        item =>
          item.orderId === orderId &&
          item.userId.toString() === currentUserId.toString()
      );

      if (!currentExpense || !currentAttempt) {
        const error = new Error('Payment order not found.');
        error.statusCode = 404;
        throw error;
      }

      if (
        currentAttempt.status === 'verified' &&
        currentAttempt.paymentId === paymentId
      ) {
        return {
          alreadyVerified: true,
          expense: currentExpense,
          attempt: currentAttempt
        };
      }

      const split = currentExpense.splits.find(
        item => item.userId.toString() === currentUserId.toString()
      );

      if (!split) {
        const error = new Error('Your share was not found in this expense.');
        error.statusCode = 403;
        throw error;
      }

      const outstandingPaise = getOutstandingCents(split);

      if (attempt.amountPaise > outstandingPaise) {
        const error = new Error('The outstanding balance changed before payment verification. Contact support before retrying.');
        error.statusCode = 409;
        throw error;
      }

      const reusedPayment = await sharedExpense.exists({
        'paymentAttempts.paymentId': paymentId
      }).session(session);

      if (reusedPayment) {
        const error = new Error('This Razorpay payment has already been recorded.');
        error.statusCode = 409;
        throw error;
      }

      split.settledAmount =
        (Math.round(Number(split.settledAmount || 0) * 100) + attempt.amountPaise) / 100;
      currentAttempt.paymentId = paymentId;
      currentAttempt.status = 'verified';
      await currentExpense.save({ session });

      return {
        alreadyVerified: false,
        expense: currentExpense,
        attempt: currentAttempt
      };
    });

    const split = result.expense.splits.find(
      item => item.userId.toString() === currentUserId.toString()
    );
    const outstandingPaise = getOutstandingCents(split);

    return res.status(200).json({
      message: result.alreadyVerified
        ? 'Payment was already verified and recorded.'
        : 'Payment captured and transfer initiated to the giver.',
      data: {
        expenseId,
        amountPaid: result.attempt.amountPaise / 100,
        settledAmount: split.settledAmount,
        outstandingAmount: outstandingPaise / 100
      }
    });
  } catch (error) {
    console.error('Verify shared expense payment error:', error.message);
    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : 'Failed to verify Razorpay payment.'
    });
  }
};
