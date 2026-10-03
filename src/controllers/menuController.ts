import { Request, Response, NextFunction } from 'express';
import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { AppError } from '../middleware/errorHandler.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { AuthRequest } from '../middleware/auth.js';
import { ROLES } from '../config/constants.js';

export const menuController = {
  // Category Endpoints
  async getCategories(_req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await Category.find().sort({ sortOrder: 1, name: 1 });
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  },

  async createCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, description, image, sortOrder, active } = req.body;
      if (!name) throw new AppError('Category name is required', 400);

      const existing = await Category.findOne({ name: name.trim() });
      if (existing) throw new AppError(`Category '${name}' already exists`, 409);

      const category = await Category.create({
        name: name.trim(),
        description: description || '',
        image: image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80',
        sortOrder: sortOrder || 0,
        active: active !== undefined ? Boolean(active) : true,
      });

      res.status(201).json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },

  async updateCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const category = await Category.findByIdAndUpdate(id, req.body, { new: true });
      if (!category) throw new AppError('Category not found', 404);
      res.json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },

  async deleteCategory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const hasItems = await MenuItem.countDocuments({ categoryId: id });
      if (hasItems > 0) {
        throw new AppError(`Cannot delete category with ${hasItems} assigned menu items. Reassign or delete items first.`, 400);
      }

      const deleted = await Category.findByIdAndDelete(id);
      if (!deleted) throw new AppError('Category not found', 404);
      res.json({ success: true, message: 'Category removed successfully' });
    } catch (err) {
      next(err);
    }
  },

  // MenuItem Endpoints
  async getMenuItems(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, category, foodType, station, available, search, featured, sort } = req.query;
      const filter: any = {};

      if (categoryId) filter.categoryId = categoryId;
      else if (category) filter.categoryId = category;

      if (foodType) filter.foodType = foodType;
      if (station) filter.kitchenStationId = station;
      if (available !== undefined) filter.available = available === 'true';
      if (featured !== undefined) filter.featured = featured === 'true';

      if (search) {
        filter.$or = [
          { name: { $regex: String(search), $options: 'i' } },
          { description: { $regex: String(search), $options: 'i' } },
          { ingredients: { $regex: String(search), $options: 'i' } },
        ];
      }

      let sortOptions: any = { featured: -1, sortOrder: 1, name: 1 };
      if (sort === 'price_asc') sortOptions = { price: 1 };
      if (sort === 'price_desc') sortOptions = { price: -1 };
      if (sort === 'name_asc') sortOptions = { name: 1 };

      const items = await MenuItem.find(filter)
        .populate('categoryId', 'name sortOrder')
        .sort(sortOptions);

      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  },

  async getMenuItemById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await MenuItem.findById(id).populate('categoryId');
      if (!item) throw new AppError('Menu item not found', 404);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },

  async createMenuItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, price, categoryId } = req.body;
      if (!name || price === undefined || !categoryId) {
        throw new AppError('Name, price, and categoryId are required fields', 400);
      }

      const item = await MenuItem.create(req.body);
      const populated = await item.populate('categoryId', 'name');

      res.status(201).json({
        success: true,
        message: `${item.name} added to menu`,
        data: populated,
      });
    } catch (err) {
      next(err);
    }
  },

  async updateMenuItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updateData = { ...req.body };

      // Kitchen and Waiter cannot modify prices
      if (req.user && ([ROLES.KITCHEN, ROLES.WAITER] as string[]).includes(req.user.role)) {
        if (updateData.price !== undefined) {
          throw new AppError(`Role '${req.user.role}' is strictly not authorized to modify menu item prices`, 403);
        }
      }

      const item = await MenuItem.findByIdAndUpdate(id, updateData, { new: true }).populate('categoryId');
      if (!item) throw new AppError('Menu item not found', 404);

      res.json({
        success: true,
        message: `${item.name} updated successfully`,
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  // Quick toggle availability (86-ing items: Owner, Manager, Kitchen)
  async toggleAvailability(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { available } = req.body;

      const item = await MenuItem.findById(id);
      if (!item) throw new AppError('Menu item not found', 404);

      item.available = available !== undefined ? Boolean(available) : !item.available;
      await item.save();

      // Broadcast real-time availability change via Socket.IO
      socketBroadcaster.emitAvailabilityChanged(item);

      res.json({
        success: true,
        message: `${item.name} is now ${item.available ? 'Available' : "86'd (Sold Out)"}`,
        data: item,
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteMenuItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await MenuItem.findByIdAndDelete(id);
      if (!item) throw new AppError('Menu item not found', 404);
      res.json({ success: true, message: `${item.name} deleted from menu` });
    } catch (err) {
      next(err);
    }
  },
};
