import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const listCategories = asyncHandler(async (req, res) => {
  const filter = req.user && ['admin', 'staff'].includes(req.user.role) ? {} : { isActive: true };
  const categories = await Category.find(filter).sort({ displayOrder: 1, name: 1 }).lean();
  res.json({ success: true, data: categories });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  res.status(201).json({ success: true, message: 'Category created.', data: category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ success: true, message: 'Category updated.', data: category });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = await MenuItem.countDocuments({ category: req.params.id });
  if (inUse > 0) {
    throw ApiError.conflict(
      `Cannot delete this category — ${inUse} menu item(s) still use it. Move or delete them first.`,
    );
  }

  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) throw ApiError.notFound('Category not found.');
  res.json({ success: true, message: 'Category deleted.' });
});
