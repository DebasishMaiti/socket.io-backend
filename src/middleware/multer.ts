import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getUploadBaseDir } from '../utils/paths';

const getUploadDir = (file: Express.Multer.File) => {
  let subDir = 'documents';
  if (file.mimetype.startsWith('audio/')) {
    subDir = 'audio';
  } else if (file.mimetype.startsWith('image/')) {
    subDir = 'images';
  } else if (file.mimetype.startsWith('video/')) {
    subDir = 'videos';
  }

  return path.join(getUploadBaseDir(), subDir);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = getUploadDir(file);
    
    try {
      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      cb(null, dir);
    } catch (error) {
      console.error("Multer destination error:", error);
      // Absolute fallback for serverless environments
      const fallback = path.join('/tmp', 'uploads');
      if (!fs.existsSync(fallback)) {
        try { fs.mkdirSync(fallback, { recursive: true }); } catch(e) {}
      }
      cb(null, fallback);
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = [
    'audio/', 'image/', 'video/', 
    'application/pdf', 
    'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  const isAllowed = allowedMimeTypes.some(type => file.mimetype.startsWith(type));

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('File type not allowed!'), false);
  }
};

export const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

export const uploadAudio = upload;
export const uploadImage = upload;
export const uploadFile = upload;
