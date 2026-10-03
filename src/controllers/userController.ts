import { Response, NextFunction } from 'express';
import { User } from '../models/User.js';
import { ROLES, Role } from '../config/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';

export const userController = {
  // Get all users/staff (Owner and Manager can view)
  async getAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { role, active } = req.query;
      const filter: any = {};

      if (role) filter.role = role;
      if (active !== undefined) filter.active = active === 'true';

      const users = await User.find(filter)
        .select('-passwordHash')
        .sort({ role: 1, name: 1 });

      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  },

  // Create new staff member (Owner only: Manager, Kitchen Staff, Waiter)
  async createStaffMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, email, phone, role, station, password } = req.body;

      if (!name || !email || !role) {
        throw new AppError('Name, email, and role are required', 400);
      }

      // Restrict role: Owner can only create MANAGER, KITCHEN, WAITER
      const allowedRoles = [ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER];
      if (!allowedRoles.includes(role)) {
        throw new AppError(
          `Cannot create user with role '${role}'. Only Manager, Kitchen, and Waiter can be created.`,
          400
        );
      }

      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        throw new AppError(`User with email '${email}' already exists`, 409);
      }

      const newStaff = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim() || '',
        role: role as Role,
        station: role === ROLES.KITCHEN ? station || 'Main Kitchen' : undefined,
        active: true,
        passwordHash: password || 'dineflow123',
      });

      res.status(201).json({
        success: true,
        message: `${role} account for ${newStaff.name} created successfully`,
        data: {
          id: newStaff._id,
          name: newStaff.name,
          email: newStaff.email,
          phone: newStaff.phone,
          role: newStaff.role,
          active: newStaff.active,
          station: newStaff.station,
          createdAt: newStaff.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Toggle or update active status (Owner only)
  async toggleUserActive(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { active } = req.body;

      const targetUser = await User.findById(id);
      if (!targetUser) {
        throw new AppError('User not found', 404);
      }

      // Cannot deactivate the owner
      if (targetUser.role === ROLES.OWNER) {
        throw new AppError('Cannot deactivate the primary restaurant owner account', 400);
      }

      targetUser.active = active !== undefined ? Boolean(active) : !targetUser.active;
      await targetUser.save();

      res.json({
        success: true,
        message: `Account for ${targetUser.name} has been ${targetUser.active ? 'activated' : 'deactivated'}`,
        data: {
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email,
          role: targetUser.role,
          active: targetUser.active,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Delete staff member (Owner only)
  async deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const targetUser = await User.findById(id);
      if (!targetUser) throw new AppError('User not found', 404);

      if (targetUser.role === ROLES.OWNER) {
        throw new AppError('Cannot delete the primary restaurant owner account', 400);
      }

      await User.findByIdAndDelete(id);
      res.json({ success: true, message: `Staff member ${targetUser.name} removed` });
    } catch (err) {
      next(err);
    }
  },
};
