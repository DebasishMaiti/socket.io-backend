import { Request, Response } from 'express';
import * as authService from './auth.service';
import generateTokenAndSetCookie from '../utils/generateToken';
import { getAuthCookieOptions } from '../utils/cookieOptions';

export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords don't match" });
    }

    const userExists = await authService.findUserByEmail(email);

    if (userExists) {
      return res.status(400).json({ error: "Email already exists" });
    }

    const newUser = await authService.createUser({ name, email, password });

    if (newUser) {
      const token = generateTokenAndSetCookie(newUser._id.toString(), res);
      res.status(201).json({
        ...newUser.toJSON(),
        token: token
      });
    } else {
      res.status(400).json({ error: "Invalid user data" });
    }
  } catch (error: any) {
    console.error("Error in register controller:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await authService.findUserByEmail(email);
    
    const isPasswordCorrect = await authService.validatePassword(password, user?.password || "");

    if (!user || !isPasswordCorrect) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = generateTokenAndSetCookie(user._id.toString(), res);

    res.status(200).json({
      ...user.toJSON(),
      token: token
    });
  } catch (error: any) {
    console.error("Error in login controller:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const logout = (req: Request, res: Response) => {
  try {
    res.cookie("jwt", "", { ...getAuthCookieOptions(), maxAge: 0 });
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error: any) {
    console.error("Error in logout controller:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
