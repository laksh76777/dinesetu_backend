import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { ROLES } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';

export const authController = {
  // Login endpoint
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, firebaseToken, role } = req.body;

      if (!email && !role && !firebaseToken) {
        throw new AppError('Email or authentication credentials are required', 400);
      }

      let user = null;

      if (email) {
        user = await User.findOne({ email: email.toLowerCase().trim() });
      } else if (firebaseToken) {
        user = await User.findOne({ firebaseUid: firebaseToken });
      } else if (role && Object.values(ROLES).includes(role)) {
        user = await User.findOne({ role });
      }

      // Auto-create core demo staff account if not found
      if (!user) {
        const targetEmail = (email || '').toLowerCase().trim();
        const demoStaffDefaults: Record<string, any> = {
          'owner@dineflow.com': { name: 'Laksh Sharma', role: ROLES.OWNER, phone: '+91 98765 43210' },
          'manager@dineflow.com': { name: 'Rohit Verma', role: ROLES.MANAGER, phone: '+91 98765 43211' },
          'kitchen@dineflow.com': { name: 'Chef Vikram Singh', role: ROLES.KITCHEN, station: 'Main Kitchen', phone: '+91 98765 43212' },
          'waiter@dineflow.com': { name: 'Priya Patel', role: ROLES.WAITER, phone: '+91 98765 43213' },
        };

        const matchedConfig = demoStaffDefaults[targetEmail] || (role && Object.values(demoStaffDefaults).find(d => d.role === role));
        if (matchedConfig) {
          user = await User.create({
            name: matchedConfig.name,
            email: targetEmail || `${matchedConfig.role.toLowerCase()}@dineflow.com`,
            phone: matchedConfig.phone,
            role: matchedConfig.role,
            station: matchedConfig.station || '',
            active: true,
            passwordHash: 'dineflow123',
          });
        }
      }

      if (!user) {
        throw new AppError('Invalid credentials. User account not found.', 401);
      }

      // Inactive account handling
      if (!user.active) {
        throw new AppError('Your account is deactivated. Please contact the restaurant owner.', 403);
      }

      // Password verification (for direct credentials login fallback)
      const isDemoPassword =
        password === 'dineflow123' ||
        password === 'dineflow-demo' ||
        password === 'demo' ||
        password === 'password';

      if (password && user.passwordHash && !isDemoPassword && password !== user.passwordHash) {
        throw new AppError('Invalid password', 401);
      }

      // Token for session (uses user ID or firebase UID)
      const token = user._id.toString();

      res.status(200).json({
        success: true,
        message: `Welcome back, ${user.name}!`,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          active: user.active,
          station: user.station,
          avatar: user.avatar,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Get current user profile
  async getCurrentUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError('Unauthorized', 401);
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (!user.active) {
        throw new AppError('Your account is deactivated. Please contact the restaurant owner.', 403);
      }

      res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          active: user.active,
          station: user.station,
          avatar: user.avatar,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Owner Initialization: creates default restaurant owner if not present
  async initializeOwner(req: Request, res: Response, next: NextFunction) {
    try {
      const existingOwner = await User.findOne({ role: ROLES.OWNER });

      if (existingOwner) {
        return res.json({
          success: true,
          message: 'Owner account is already configured',
          owner: {
            id: existingOwner._id,
            name: existingOwner.name,
            email: existingOwner.email,
            role: existingOwner.role,
          },
        });
      }

      const { name, email, phone, password } = req.body;

      const owner = await User.create({
        name: name || 'Laksh Sharma (Owner)',
        email: (email || 'owner@dineflow.com').toLowerCase().trim(),
        phone: phone || '+91 98765 43210',
        role: ROLES.OWNER,
        active: true,
        passwordHash: password || 'dineflow123',
      });

      res.status(201).json({
        success: true,
        message: 'Primary restaurant Owner successfully initialized',
        owner: {
          id: owner._id,
          name: owner.name,
          email: owner.email,
          role: owner.role,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Logout
  async logout(_req: Request, res: Response) {
    res.json({ success: true, message: 'Logged out successfully' });
  },
};
