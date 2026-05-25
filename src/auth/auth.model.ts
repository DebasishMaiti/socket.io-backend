import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  profilePic: {
    data: Buffer,
    contentType: String,
  },
  bio: {
    type: String,
    default: "",
  },
}, { timestamps: true });

userSchema.set('toJSON', {
  transform: (doc, ret: any) => {
    delete ret.password;
    if (ret.profilePic && ret.profilePic.data) {
      const base64 = Buffer.from(ret.profilePic.data).toString('base64');
      ret.profilePic = `data:${ret.profilePic.contentType};base64,${base64}` as any;
    }
    return ret;
  }
});

userSchema.set('toObject', {
  transform: (doc, ret: any) => {
    delete ret.password;
    if (ret.profilePic && ret.profilePic.data) {
      const base64 = Buffer.from(ret.profilePic.data).toString('base64');
      ret.profilePic = `data:${ret.profilePic.contentType};base64,${base64}` as any;
    }
    return ret;
  }
});

const User = mongoose.model('User', userSchema);

export default User;
export { User };
