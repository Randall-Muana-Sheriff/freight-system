import { Router } from 'express';
import { SavedViewController } from '../controllers/savedViewController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

// The audience is whoever works the board. Every handler scopes to the
// calling user, so an admin sees their own views rather than everyone's --
// these are a personal convenience, not an administrative record.
const boardStaff = authMiddleware(['admin', 'dispatcher']);

router.get('/', boardStaff, SavedViewController.list);
router.post('/', boardStaff, SavedViewController.create);
router.delete('/:id', boardStaff, SavedViewController.remove);

export default router;
