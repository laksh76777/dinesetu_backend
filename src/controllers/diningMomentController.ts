import { Request, Response, NextFunction } from 'express';
import { DiningMoment } from '../models/DiningMoment.js';
import { AppError } from '../middleware/errorHandler.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';

export const diningMomentController = {
  // Get active moments for customer menu
  async getActiveMoments(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const moments = await DiningMoment.find({
        active: true,
        $or: [{ endTime: { $exists: false } }, { endTime: { $gte: now } }],
      })
        .populate('menuItemIds')
        .sort({ displayOrder: 1, createdAt: -1 });

      res.json({
        success: true,
        data: moments,
      });
    } catch (err) {
      next(err);
    }
  },

  // Get all moments for owner/manager console
  async getAllMoments(req: Request, res: Response, next: NextFunction) {
    try {
      const moments = await DiningMoment.find()
        .populate('menuItemIds')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: moments,
      });
    } catch (err) {
      next(err);
    }
  },

  // Create new dining moment
  async createMoment(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, badge, description, image, menuItemIds, startTime, endTime, active, displayOrder } = req.body;
      if (!title || !title.trim()) throw new AppError('Title is required', 400);

      const moment = await DiningMoment.create({
        title: title.trim(),
        badge: badge || "Tonight's Special",
        description: description || '',
        image: image || 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
        menuItemIds: menuItemIds || [],
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        active: active !== undefined ? active : true,
        displayOrder: displayOrder || 0,
      });

      socketBroadcaster.emitDiningMomentUpdated(moment);

      AnalyticsEvent.create({
        eventType: 'DINING_MOMENT_CREATED',
        metadata: { title: moment.title, badge: moment.badge },
        timestamp: new Date(),
      }).catch(() => {});

      res.status(201).json({
        success: true,
        message: 'Dining Moment activated successfully',
        data: moment,
      });
    } catch (err) {
      next(err);
    }
  },

  // Update existing dining moment
  async updateMoment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const moment = await DiningMoment.findByIdAndUpdate(id, req.body, { new: true });
      if (!moment) throw new AppError('Dining moment not found', 404);

      socketBroadcaster.emitDiningMomentUpdated(moment);

      res.json({
        success: true,
        message: 'Dining moment updated',
        data: moment,
      });
    } catch (err) {
      next(err);
    }
  },

  // Delete dining moment
  async deleteMoment(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const moment = await DiningMoment.findByIdAndDelete(id);
      if (!moment) throw new AppError('Dining moment not found', 404);

      res.json({
        success: true,
        message: 'Dining moment deleted',
      });
    } catch (err) {
      next(err);
    }
  },
};
