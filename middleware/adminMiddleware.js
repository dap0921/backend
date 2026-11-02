
import jwt from 'jsonwebtoken';
import secretKey from '../scripts/jwtConfig.js';
import userData from '../model/user.js';

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authorization token is required'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        message: 'Invalid authorization format'
      });
    }

    const decoded = jwt.verify(token, secretKey);
    const userId = decoded.id || decoded._id;

    if (!userId) {
      return res.status(401).json({
        message: 'Invalid token: user ID missing'
      });
    }

    const admin = await userData
      .findById(userId)
      .select('-password');

    if (!admin) {
      return res.status(401).json({
        message: 'User account not found'
      });
    }

    if (admin.role !== 'admin') {
      return res.status(403).json({
        message: 'Admin access required'
      });
    }

    req.user = {
      id: admin._id.toString(),
      role: admin.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError') {
      return res.status(401).json({
        message: 'Invalid or expired token'
      });
    }

    console.error('Admin authentication error:', error);

    return res.status(500).json({
      message: 'Admin authentication failed'
    });
  }
};

export default adminMiddleware;
