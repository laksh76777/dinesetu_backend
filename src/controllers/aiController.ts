import { Request, Response, NextFunction } from 'express';
import { aiService } from '../services/aiService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const aiController = {
  /**
   * 1. RESTAURANT OPERATIONS ASSISTANT
   * POST /api/ai/operations-advisor
   * Owner & Manager only
   */
  async getOperationsAdvice(req: Request, res: Response, next: NextFunction) {
    try {
      const { query, timeRange = 'yesterday' } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new AppError('Question or query is required for operations analysis', 400);
      }

      const validTimeRanges = ['yesterday', 'today', 'last7days'];
      const validatedRange = validTimeRanges.includes(timeRange) ? timeRange : 'yesterday';

      logger.info(`[AI Operations Assistant] Processing query: "${query}" for range: ${validatedRange}`);

      const result = await aiService.getOperationsExplanation(query.trim(), validatedRange as any);

      return res.status(200).json({
        success: true,
        data: {
          explanation: result.explanation,
          structuredContext: result.structuredContext,
          source: result.source,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * 2. MENU DESCRIPTION ASSISTANT
   * POST /api/ai/menu-description
   * Input: Food name, Ingredients, Cooking method
   * Returns: Draft description (user reviews before saving)
   */
  async generateMenuDescription(req: Request, res: Response, next: NextFunction) {
    try {
      const { foodName, ingredients, cookingMethod, category, foodType, spiceLevel } = req.body;

      if (!foodName || typeof foodName !== 'string' || foodName.trim().length === 0) {
        throw new AppError('Food name is required to draft a description', 400);
      }

      if (!ingredients || (Array.isArray(ingredients) && ingredients.length === 0)) {
        throw new AppError('Ingredients are required to draft a sensory description', 400);
      }

      if (!cookingMethod || typeof cookingMethod !== 'string' || cookingMethod.trim().length === 0) {
        throw new AppError('Cooking method is required (e.g. Wood-fired, Slow-braised, Pan-seared)', 400);
      }

      logger.info(`[AI Menu Assistant] Generating draft for "${foodName}" using method "${cookingMethod}"`);

      const result = await aiService.generateMenuDescription({
        foodName: foodName.trim(),
        ingredients,
        cookingMethod: cookingMethod.trim(),
        category,
        foodType,
        spiceLevel: Number(spiceLevel) || 0,
      });

      return res.status(200).json({
        success: true,
        data: {
          foodName: foodName.trim(),
          cookingMethod: cookingMethod.trim(),
          draftDescription: result.draftDescription,
          source: result.source,
          status: 'DRAFT_FOR_REVIEW', // Explicitly informs user/client that this is a draft needing user confirmation
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
