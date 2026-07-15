'use strict';
export {}; // forces file (module) scope — no top-level import/export otherwise, needed since `const router` is repeated across every route file
const router = require('express').Router();
const requireRole = require('../../middleware/requireRole');
const {
  getCriteria, deleteCategory, updateCategory, createCategory,
  createItem, deleteItem, updateItem, updateItemLevels, reorder, seed,
} = require('../../controllers/shared/criteria.controller');

router.get('/', getCriteria);
router.delete('/categories/:id', requireRole('ADMIN'), deleteCategory);
router.patch('/categories/:id', requireRole('ADMIN'), updateCategory);
router.post('/categories', requireRole('ADMIN'), createCategory);
router.post('/items', requireRole('ADMIN'), createItem);
router.delete('/items/:id', requireRole('ADMIN'), deleteItem);
router.patch('/items/:id', requireRole('ADMIN'), updateItem);
router.patch('/items/:id/levels', requireRole('ADMIN'), updateItemLevels);
router.put('/reorder', requireRole('ADMIN'), reorder);
router.post('/seed', requireRole('ADMIN'), seed);

module.exports = router;
