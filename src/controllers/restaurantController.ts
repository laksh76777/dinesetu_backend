import { Request, Response, NextFunction } from 'express';
import { Restaurant } from '../models/Restaurant.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthRequest } from '../middleware/auth.js';

export const restaurantController = {
  // Get restaurant profile (single restaurant system)
  async getProfile(_req: Request, res: Response, next: NextFunction) {
    try {
      let restaurant = await Restaurant.findOne();
      if (!restaurant) {
        restaurant = await Restaurant.create({
          name: 'Rasrang',
          description:
            'Modern Indian Dining — Celebrating regional culinary heritage, crafted royal tandoors, slow-cooked curries, and modern presentation.',
        });
      }

      res.json({ success: true, data: restaurant });
    } catch (err) {
      next(err);
    }
  },

  // Update restaurant profile (Owner only)
  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      let restaurant = await Restaurant.findOne();
      if (!restaurant) {
        restaurant = new Restaurant(req.body);
      } else {
        Object.assign(restaurant, req.body);
      }

      // Sync top-level tax configuration if provided
      if (req.body.taxConfiguration) {
        restaurant.taxConfiguration = {
          taxRate: req.body.taxConfiguration.taxRate ?? 5,
          serviceChargeRate: req.body.taxConfiguration.serviceChargeRate ?? 5,
          gstNumber: req.body.taxConfiguration.gstNumber || '07AAAAA0000A1Z5',
        };
      }

      await restaurant.save();

      // Broadcast update to all connected clients
      try {
        const { getIO } = await import('../sockets/socketServer.js');
        const io = getIO();
        io.emit('RESTAURANT_UPDATED', restaurant);
      } catch (_) {}

      res.json({
        success: true,
        message: 'Restaurant profile and branding updated successfully',
        data: restaurant,
      });
    } catch (err) {
      next(err);
    }
  },
};
