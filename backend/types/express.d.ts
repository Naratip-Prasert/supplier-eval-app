import 'express';

export interface AuthUser {
  empId: string;
  fullName: string;
  role: 'USER' | 'GCP' | 'SUPERVISOR' | 'ADMIN';
  email: string;
  department: string;
  jobTitle: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
