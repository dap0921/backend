import jwt from 'jsonwebtoken';
import secretKey from '../scripts/jwtConfig.js';

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: 'Authorization token is required'
      });
    }

    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      return res.status(401).json({
        message: 'Invalid authorization format'
      });
    }

    const decoded = jwt.verify(token, secretKey);

    req.user = decoded;

    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired token'
    });
  }
};

export default authMiddleware;