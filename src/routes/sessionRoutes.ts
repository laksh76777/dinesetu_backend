import { Router } from 'express';
import { sessionController } from '../controllers/sessionController.js';
import { tableIntelligenceController } from '../controllers/tableIntelligenceController.js';

const router = Router();

// Customer joins or creates dining session with display name
router.post('/join', sessionController.joinTableSession);

// Get session details and active members
router.get('/:id', sessionController.getSessionDetails);

// Table Intelligence Context (Stage, Nudges, Recommendations, Pulse)
router.get('/:id/intelligence', tableIntelligenceController.getTableIntelligence);

// Table Ideas (Shared Wishlist)
router.get('/:id/ideas', tableIntelligenceController.getTableIdeas);
router.post('/:id/ideas', tableIntelligenceController.addTableIdea);
router.delete('/:id/ideas/:ideaId', tableIntelligenceController.removeTableIdea);

// Taste Journey Preferences
router.post('/:id/preferences', tableIntelligenceController.updatePreferences);

// Digital Dining Memory
router.get('/:id/memory', tableIntelligenceController.getDiningMemory);

// Leave / Close Table Session (Diner leaves without ordering or closes table)
router.post('/:id/leave', sessionController.leaveOrCloseSession);
router.post('/:id/close', sessionController.leaveOrCloseSession);

export default router;
