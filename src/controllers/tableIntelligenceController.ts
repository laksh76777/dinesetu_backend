import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { Order } from '../models/Order.js';
import { MenuItem } from '../models/MenuItem.js';
import { Table } from '../models/Table.js';
import { Restaurant } from '../models/Restaurant.js';
import { DiningMoment } from '../models/DiningMoment.js';
import { AnalyticsEvent } from '../models/AnalyticsEvent.js';
import { AppError } from '../middleware/errorHandler.js';
import { socketBroadcaster } from '../sockets/socketServer.js';
import { generateSecureToken } from '../utils/tokens.js';

export const tableIntelligenceController = {
  // 1. Get Table Intelligence Context (Stage, Nudges, Recommendations, Pulse)
  async getTableIntelligence(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId } = req.params;

      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Dining session not found', 404);

      const [members, orders, availableItems, restaurant, activeMoments] = await Promise.all([
        SessionMember.find({ sessionId: session._id, active: true }).select('displayName temporaryMemberId joinedAt'),
        Order.find({ sessionId: session._id }).sort({ roundNumber: 1, createdAt: 1 }),
        MenuItem.find({ available: true, availabilityStatus: { $ne: 'SOLD_OUT' } }).populate('categoryId'),
        Restaurant.findOne(),
        DiningMoment.find({ active: true }),
      ]);

      // Calculate table order statistics
      const allOrderItems: any[] = [];
      let maxSpiceLevel = 0;
      let hasMainCourse = false;
      let hasStarters = false;
      let hasDesserts = false;
      let hasBeverages = false;
      let hasBreadsOrRice = false;

      orders.forEach((order) => {
        order.items.forEach((item) => {
          const menuItemId = (item as any).menuItemId || item.menuItem;
          const menuItem = availableItems.find((m) => m._id.toString() === menuItemId?.toString());
          if (menuItem) {
            if (menuItem.spiceLevel > maxSpiceLevel) maxSpiceLevel = menuItem.spiceLevel;
            const catName = (menuItem.categoryId as any)?.name?.toLowerCase() || '';
            const itemName = menuItem.name.toLowerCase();

            if (catName.includes('starter') || catName.includes('appetizer') || catName.includes('small plate')) {
              hasStarters = true;
            }
            if (catName.includes('curry') || catName.includes('main') || catName.includes('biryani') || catName.includes('heritage')) {
              hasMainCourse = true;
            }
            if (catName.includes('dessert') || catName.includes('sweet') || itemName.includes('kulfi') || itemName.includes('jamun')) {
              hasDesserts = true;
            }
            if (catName.includes('beverage') || catName.includes('drink') || itemName.includes('lassi') || itemName.includes('chaas')) {
              hasBeverages = true;
            }
            if (catName.includes('bread') || catName.includes('rice') || itemName.includes('naan') || itemName.includes('roti') || itemName.includes('rice')) {
              hasBreadsOrRice = true;
            }
          }
        });
      });

      // Determine Dining Stage dynamically
      let diningStage = session.diningStage || 'DISCOVERY';
      if (session.status === 'PAYMENT_PENDING' || session.status === 'COMPLETED') {
        diningStage = 'BILL';
      } else if (orders.length === 0) {
        diningStage = 'DISCOVERY';
      } else if (hasDesserts) {
        diningStage = 'DESSERT';
      } else if (hasMainCourse) {
        diningStage = 'MAIN_COURSE';
      } else if (hasStarters) {
        diningStage = 'STARTERS';
      }

      // Generate Stage Nudge
      let stageNudge = {
        title: 'Welcome to Rasrang',
        message: 'Explore our artisanal modern Indian menu or save dishes to your shared Table Ideas.',
        actionText: 'Browse Curations',
        actionStage: 'DISCOVERY',
      };

      if (diningStage === 'DISCOVERY') {
        stageNudge = {
          title: 'Craft Your First Round',
          message: 'Begin with clay oven kebabs and artisanal small plates crafted for sharing.',
          actionText: 'Explore Starters',
          actionStage: 'STARTERS',
        };
      } else if (diningStage === 'STARTERS') {
        stageNudge = {
          title: 'Ready for Mains?',
          message: 'Pair our slow-simmered heritage curries with charcoal tandoor breads.',
          actionText: 'Explore Royal Curries',
          actionStage: 'MAIN_COURSE',
        };
      } else if (diningStage === 'MAIN_COURSE') {
        if (!hasBreadsOrRice) {
          stageNudge = {
            title: 'Complete Your Main Course',
            message: 'Would you like to add butter naan, laccha paratha, or aged basmati rice to your table?',
            actionText: 'View Breads & Rice',
            actionStage: 'MAIN_COURSE',
          };
        } else {
          stageNudge = {
            title: 'Something Sweet to Finish?',
            message: 'Conclude your Rasrang journey with saffron pistachio kulfi or shahi delicacies.',
            actionText: 'Explore Desserts',
            actionStage: 'DESSERT',
          };
        }
      } else if (diningStage === 'DESSERT') {
        stageNudge = {
          title: 'Hope You Enjoyed Every Bite',
          message: 'When ready, request your bill or settle seamlessly at the table.',
          actionText: 'View Bill & Settle',
          actionStage: 'BILL',
        };
      } else if (diningStage === 'BILL') {
        stageNudge = {
          title: 'Table Settled',
          message: 'Thank you for dining with Rasrang. Your digital Dining Memory is ready to view.',
          actionText: 'View Dining Memory',
          actionStage: 'BILL',
        };
      }

      // Table-Level Contextual Recommendations (Deterministic)
      const recommendations: any[] = [];
      const orderedItemIds = new Set(allOrderItems.map((i) => i.menuItemId?.toString()));

      // 1. Cooling accompaniment if spicy food ordered
      if (maxSpiceLevel >= 2 && !hasBeverages) {
        const coolingItem = availableItems.find(
          (m) =>
            !orderedItemIds.has(m._id.toString()) &&
            (m.name.toLowerCase().includes('lassi') ||
              m.name.toLowerCase().includes('chaas') ||
              m.name.toLowerCase().includes('raita'))
        );
        if (coolingItem) {
          recommendations.push({
            dish: coolingItem,
            badge: 'Cooling Pair',
            reason: 'Tables enjoying bold spice pairings love our chilled handcrafted beverages.',
          });
        }
      }

      // 2. Bread/Rice pairing if curries ordered without enough staples
      if (hasMainCourse && !hasBreadsOrRice) {
        const breadOrRice = availableItems.find(
          (m) =>
            !orderedItemIds.has(m._id.toString()) &&
            (m.name.toLowerCase().includes('naan') ||
              m.name.toLowerCase().includes('paratha') ||
              m.name.toLowerCase().includes('roti') ||
              m.name.toLowerCase().includes('rice'))
        );
        if (breadOrRice) {
          recommendations.push({
            dish: breadOrRice,
            badge: 'Table Staple',
            reason: 'Essential companion for slow-cooked gravies and rich curries.',
          });
        }
      }

      // 3. Chef's Pick or Active Dining Moment item
      const specialItem = availableItems.find(
        (m) =>
          !orderedItemIds.has(m._id.toString()) &&
          (m.isChefPick || m.featured) &&
          !recommendations.some((r) => r.dish._id.toString() === m._id.toString())
      );
      if (specialItem) {
        recommendations.push({
          dish: specialItem,
          badge: "Chef's Signature",
          reason: 'Crafted with royal heritage spice marinades and culinary theater.',
        });
      }

      // 4. Taste Journey preference matching
      if (session.preferences?.vegetarian) {
        const vegPick = availableItems.find(
          (m) =>
            !orderedItemIds.has(m._id.toString()) &&
            (m.foodType === 'VEG' || m.foodType === 'VEGAN') &&
            !recommendations.some((r) => r.dish._id.toString() === m._id.toString())
        );
        if (vegPick && recommendations.length < 4) {
          recommendations.push({
            dish: vegPick,
            badge: 'Matches Preference',
            reason: 'Curated for your table vegetarian preference.',
          });
        }
      }

      // 5. Table Pulse Timeline (Real timestamps)
      const pulseEvents: any[] = [];
      // Event 1: Table opened
      pulseEvents.push({
        id: 'pulse_session_opened',
        type: 'SESSION_OPENED',
        title: 'Table Experience Opened',
        description: `Table ${session.tableNumber} welcomed ${members.length || 1} guest(s)`,
        timestamp: session.startedAt,
        status: 'COMPLETED',
      });

      // Events for each order round
      orders.forEach((ord, index) => {
        const roundNum = ord.roundNumber || index + 1;
        const itemCount = ord.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

        pulseEvents.push({
          id: `pulse_order_${ord._id}`,
          type: 'ORDER_PLACED',
          title: `Round ${roundNum} Placed`,
          description: `${itemCount} culinary item(s) sent to kitchen stations`,
          timestamp: ord.createdAt,
          status: 'COMPLETED',
        });

        if (ord.status === 'PREPARING' || ord.status === 'READY' || ord.status === 'SERVED') {
          pulseEvents.push({
            id: `pulse_prep_${ord._id}`,
            type: 'KITCHEN_PREPARING',
            title: `Round ${roundNum} in Culinary Prep`,
            description: 'Clay ovens and burners firing your selections',
            timestamp: new Date(new Date(ord.createdAt).getTime() + 2 * 60000),
            status: ord.status === 'PREPARING' ? 'IN_PROGRESS' : 'COMPLETED',
          });
        }

        if (ord.status === 'READY' || ord.status === 'SERVED') {
          pulseEvents.push({
            id: `pulse_served_${ord._id}`,
            type: 'ORDER_SERVED',
            title: `Round ${roundNum} Delivered`,
            description: 'Served hot to your table by floor stewards',
            timestamp: new Date(new Date(ord.createdAt).getTime() + 15 * 60000),
            status: 'COMPLETED',
          });
        }
      });

      if (session.status === 'PAYMENT_PENDING' || session.status === 'COMPLETED') {
        pulseEvents.push({
          id: 'pulse_bill_settled',
          type: 'BILL_SETTLED',
          title: session.status === 'COMPLETED' ? 'Settled with DineSetu Pay' : 'Bill Requested',
          description: `Total amount ₹${session.totalAmount.toFixed(2)}`,
          timestamp: session.endedAt || session.updatedAt,
          status: session.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
        });
      }

      res.json({
        success: true,
        data: {
          tableNumber: session.tableNumber,
          sessionNumber: session.sessionNumber,
          diningStage,
          stageNudge,
          recommendations,
          pulseEvents,
          preferences: session.preferences || {},
          tableIdeas: session.tableIdeas || [],
          memberCount: members.length,
          members,
          activeMoments,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 2. Table Ideas: Get Shared Wishlist
  async getTableIdeas(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId } = req.params;
      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Session not found', 404);

      res.json({
        success: true,
        data: {
          tableIdeas: session.tableIdeas || [],
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 3. Table Ideas: Add Item to Shared Wishlist
  async addTableIdea(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId } = req.params;
      const { menuItemId, addedBy } = req.body;

      if (!menuItemId) throw new AppError('menuItemId is required', 400);

      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Session not found', 404);

      const menuItem = await MenuItem.findById(menuItemId);
      if (!menuItem) throw new AppError('Menu item not found', 404);

      // Check if already in tableIdeas
      const existing = session.tableIdeas.find((i) => i.menuItemId.toString() === menuItemId.toString());
      if (existing) {
        return res.json({
          success: true,
          message: `${menuItem.name} is already in Table Ideas!`,
          data: { tableIdeas: session.tableIdeas },
        });
      }

      const newIdea = {
        id: generateSecureToken(8),
        menuItemId: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        image: menuItem.image,
        foodType: menuItem.foodType,
        addedBy: (addedBy || 'Guest').trim(),
        addedAt: new Date(),
      };

      session.tableIdeas.push(newIdea as any);
      await session.save();

      // Real-time synchronization to all table members
      socketBroadcaster.emitTableIdeasUpdated(session._id.toString(), session.tableIdeas);

      AnalyticsEvent.create({
        eventType: 'TABLE_IDEA_ADDED',
        sessionId: session._id.toString(),
        tableNumber: session.tableNumber,
        metadata: { itemId: menuItemId, itemName: menuItem.name, addedBy },
        timestamp: new Date(),
      }).catch(() => {});

      res.status(201).json({
        success: true,
        message: `Saved ${menuItem.name} to Table Ideas`,
        data: { tableIdeas: session.tableIdeas },
      });
    } catch (err) {
      next(err);
    }
  },

  // 4. Table Ideas: Remove Item
  async removeTableIdea(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId, ideaId } = req.params;
      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Session not found', 404);

      session.tableIdeas = session.tableIdeas.filter((i) => i.id !== ideaId && i.menuItemId.toString() !== ideaId);
      await session.save();

      socketBroadcaster.emitTableIdeasUpdated(session._id.toString(), session.tableIdeas);

      res.json({
        success: true,
        message: 'Removed from Table Ideas',
        data: { tableIdeas: session.tableIdeas },
      });
    } catch (err) {
      next(err);
    }
  },

  // 5. Taste Journey: Update Session Preferences
  async updatePreferences(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId } = req.params;
      const { preferences } = req.body;

      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Session not found', 404);

      session.preferences = {
        ...session.preferences,
        ...preferences,
      };
      await session.save();

      socketBroadcaster.emitPreferencesUpdated(session._id.toString(), session.preferences);

      AnalyticsEvent.create({
        eventType: 'PREFERENCE_SELECTED',
        sessionId: session._id.toString(),
        tableNumber: session.tableNumber,
        metadata: { preferences },
        timestamp: new Date(),
      }).catch(() => {});

      res.json({
        success: true,
        message: 'Taste Journey preferences updated for Table',
        data: { preferences: session.preferences },
      });
    } catch (err) {
      next(err);
    }
  },

  // 6. Help Me Choose (Guided Discovery)
  async helpMeChoose(req: Request, res: Response, next: NextFunction) {
    try {
      const { filters = [], maxPrice, spiceLevel } = req.body;
      const items = await MenuItem.find({ available: true, availabilityStatus: { $ne: 'SOLD_OUT' } }).populate('categoryId');

      // Score and rank items deterministically
      const scoredItems = items.map((item) => {
        let score = 0;
        const reasons: string[] = [];

        // Vegetarian filter
        if (filters.includes('Vegetarian')) {
          if (item.foodType === 'VEG' || item.foodType === 'VEGAN') {
            score += 3;
            reasons.push('Plant-based & vegetarian');
          } else {
            score -= 10;
          }
        }

        // Spicy filter
        if (filters.includes('Spicy')) {
          if (item.spiceLevel >= 2) {
            score += 3;
            reasons.push('Robust heat & stone-ground spices');
          }
        }

        // Light filter
        if (filters.includes('Light')) {
          if (item.foodType === 'VEGAN' || item.preparationTime <= 12 || item.price < 400) {
            score += 2;
            reasons.push('Light & refreshing');
          }
        }

        // Filling filter
        if (filters.includes('Filling')) {
          const cat = (item.categoryId as any)?.name?.toLowerCase() || '';
          if (cat.includes('curry') || cat.includes('biryani') || cat.includes('heritage')) {
            score += 3;
            reasons.push('Hearty & satisfying portion');
          }
        }

        // Quick filter
        if (filters.includes('Quick') || item.isQuickPick) {
          if (item.preparationTime <= 12) {
            score += 2;
            reasons.push('Quick preparation (under 12 mins)');
          }
        }

        // Chef's Pick filter
        if (filters.includes("Chef's Pick") || item.isChefPick || item.featured) {
          score += 2;
          reasons.push("Rasrang master chef's signature recipe");
        }

        // For Sharing
        if (filters.includes('For Sharing')) {
          const cat = (item.categoryId as any)?.name?.toLowerCase() || '';
          if (cat.includes('small plate') || cat.includes('appetizer') || cat.includes('grill') || cat.includes('biryani')) {
            score += 2;
            reasons.push('Perfect platter for sharing across the table');
          }
        }

        // Under 300 filter
        if (filters.includes('Under ₹300') || (maxPrice && item.price <= maxPrice)) {
          if (item.price <= 350) {
            score += 2;
            reasons.push(`Budget friendly (₹${item.price})`);
          }
        }

        return {
          dish: item,
          score,
          matchReason: reasons.length ? reasons.slice(0, 2).join(' • ') : 'Crafted modern Indian favorite',
        };
      });

      // Filter out disqualified items (e.g. non-veg when veg requested)
      const matches = scoredItems
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      AnalyticsEvent.create({
        eventType: 'HELP_ME_CHOOSE_USED',
        sessionId: req.body.sessionId || 'guest',
        tableNumber: req.body.tableNumber || 'N/A',
        metadata: { filters, matchCount: matches.length },
        timestamp: new Date(),
      }).catch(() => {});

      res.json({
        success: true,
        data: {
          matches,
          totalAvailable: items.length,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // 7. Dining Memory (Post-meal Keepsake)
  async getDiningMemory(req: Request, res: Response, next: NextFunction) {
    try {
      const { id: sessionId } = req.params;
      const session = await TableSession.findById(sessionId);
      if (!session) throw new AppError('Dining session not found', 404);

      const [orders, members, restaurant] = await Promise.all([
        Order.find({ sessionId: session._id }),
        SessionMember.find({ sessionId: session._id }),
        Restaurant.findOne(),
      ]);

      // Deduplicate unique dishes enjoyed
      const dishMap = new Map<string, { name: string; quantity: number; price: number; image?: string }>();
      orders.forEach((o) => {
        o.items.forEach((item) => {
          const existing = dishMap.get(item.name);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            dishMap.set(item.name, {
              name: item.name,
              quantity: item.quantity,
              price: item.priceSnapshot || (item as any).price || 0,
              image: (item as any).image,
            });
          }
        });
      });

      const dishesEnjoyed = Array.from(dishMap.values());
      const guestNames = members.map((m) => m.displayName);

      res.json({
        success: true,
        data: {
          restaurantName: restaurant?.name || 'Rasrang',
          tagline: 'Modern Indian Dining',
          tableNumber: session.tableNumber,
          sessionNumber: session.sessionNumber,
          date: session.endedAt || session.createdAt,
          diners: guestNames.length ? guestNames : ['Valued Guest'],
          roundsCount: orders.length,
          dishesCount: dishesEnjoyed.reduce((acc, d) => acc + d.quantity, 0),
          dishesEnjoyed,
          subtotal: session.subtotal,
          tax: session.tax,
          serviceCharge: session.serviceCharge,
          totalAmount: session.totalAmount,
          thankYouMessage: 'Thank you for dining with Rasrang. We hope your culinary journey was extraordinary.',
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
