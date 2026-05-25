import bcrypt from 'bcryptjs';
import User from './auth.model';

export const findUserByEmail = async (email: string) => {
  return await User.findOne({ email });
};

export const createUser = async (userData: any) => {
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(userData.password, salt);

  const newUser = new User({
    ...userData,
    password: hashedPassword,
  });

  return await newUser.save();
};

export const validatePassword = async (password: string, hashedPassword: string) => {
  return await bcrypt.compare(password, hashedPassword);
};
