import User from '../auth/auth.model';

export const getAllUsersExcept = async (userId: string) => {
  return await User.find({ _id: { $ne: userId } }).select("-password");
};

export const searchUsersByQuery = async (userId: string, query: string) => {
  return await User.find({
    _id: { $ne: userId },
    name: { $regex: query, $options: "i" }
  }).select("-password");
};

export const updateUser = async (userId: string, updateData: any) => {
  return await User.findByIdAndUpdate(userId, updateData, { new: true }).select("-password");
};

export const getUserById = async (userId: string) => {
  return await User.findById(userId).select("-password");
};
