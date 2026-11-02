import 'dotenv/config';

const secretKey = process.env.JWT_SECRET;

if (!secretKey) {
  throw new Error('JWT_SECRET is not defined in .env');
}

export default secretKey;