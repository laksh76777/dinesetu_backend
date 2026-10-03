import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { ROLES, Role } from '../config/constants.js';
import { AppError } from './errorHandler.js';
import { User, IUser } from '../models/User.js';
import { logger } from '../utils/logger.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    station?: string;
  };
}

export const authenticateStaff = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    // 1. Check for demo / dev role override headers (e.g., from frontend 1-click switch or Postman)
    const demoRoleHeader = req.headers['x-demo-role'] as string;
    const demoUserId = req.headers['x-staff-id'] as string;

    if (demoRoleHeader && Object.values(ROLES).includes(demoRoleHeader as Role)) {
      let user: IUser | null = null;
      if (mongoose.connection.readyState === 1) {
        if (demoUserId) {
          user = await User.findById(demoUserId);
        }
        if (!user) {
          user = await User.findOne({ role: demoRoleHeader, active: true });
        }
      }

      if (user && !user.active) {
        throw new AppError('Your account is deactivated. Please contact the restaurant owner.', 403);
      }

      req.user = {
        id: user?._id?.toString() || `demo-${demoRoleHeader.toLowerCase()}`,
        name: user?.name || `Demo ${demoRoleHeader}`,
        email: user?.email || `${demoRoleHeader.toLowerCase()}@dineflow.com`,
        role: demoRoleHeader as Role,
        active: user ? user.active : true,
        station: user?.station,
      };
      return next();
    }

    // 2. Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Unauthorized: Authentication token is required', 401);
    }

    const token = authHeader.split(' ')[1];

    // 3. Firebase Auth Token or Direct User ID verification
    let foundUser: IUser | null = null;

    // Check if token matches standard mongo id or email
    if (token.match(/^[0-9a-fA-F]{24}$/)) {
      foundUser = await User.findById(token);
    } else if (token.includes('@')) {
      foundUser = await User.findOne({ email: token.toLowerCase() });
    } else {
      // Check by firebaseUid
      foundUser = await User.findOne({ firebaseUid: token });
    }

    // Fallback: If token is a formatted demo token like "demo-owner", "demo-manager", etc.
    if (!foundUser && token.startsWith('demo-')) {
      const roleKey = token.replace('demo-', '').toUpperCase();
      if (Object.values(ROLES).includes(roleKey as Role)) {
        foundUser = await User.findOne({ role: roleKey as Role });
      }
    }

    if (!foundUser) {
      throw new AppError('Invalid or expired authentication token', 401);
    }

    // Inactive account check
    if (!foundUser.active) {
      throw new AppError('Your account is deactivated. Please contact the restaurant owner.', 403);
    }

    req.user = {
      id: foundUser._id.toString(),
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
      active: foundUser.active,
      station: foundUser.station,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoles = (...allowedRoles: Role[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized: Authentication required', 401));
    }

    if (!req.user.active) {
      return next(new AppError('Forbidden: Deactivated user account', 403));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
          403
        )
      );
    }

    next();
  };
};

export const authenticate = authenticateStaff;
export const authorize = (roles: Role[]) => requireRoles(...roles);
