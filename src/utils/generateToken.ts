import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { getAuthCookieOptions } from './cookieOptions';

const generateTokenAndSetCookie = (userId: string, res: Response) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: '15d',
  });

  res.cookie('jwt', token, getAuthCookieOptions());

  return token;
};

export default generateTokenAndSetCookie;
