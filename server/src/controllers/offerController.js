import { Offer } from '../models/Offer.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ROLES } from '../constants.js';
import { assertOfferAvailableTo } from '../utils/offerUsage.js';

export const listOffers = asyncHandler(async (req, res) => {
  const isAdmin = req.user && req.user.role === ROLES.ADMIN;
  const now = new Date();

  const filter = isAdmin
    ? {}
    : { isActive: true, startDate: { $lte: now }, endDate: { $gte: now } };

  const offers = await Offer.find(filter).sort({ endDate: 1 }).lean();
  res.json({ success: true, data: offers });
});

/** POST /api/offers/validate — lets the booking form check a code before submit. */
export const validateOffer = asyncHandler(async (req, res) => {
  const { code, guests = 1 } = req.body;

  const offer = await Offer.findOne({ code: String(code).toUpperCase().trim() });
  if (!offer) throw ApiError.badRequest('That promo code is not valid.', { code: 'Unknown code' });

  const problem = offer.validityError(Number(guests));
  if (problem) throw ApiError.badRequest(problem, { code: problem });

  // Runs only when the caller is signed in — see assertOfferAvailableTo.
  await assertOfferAvailableTo(offer, req.user);

  res.json({
    success: true,
    message: 'Promo code applied.',
    data: {
      code: offer.code,
      description: offer.description,
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      perCustomerLimit: offer.perCustomerLimit,
    },
  });
});

export const createOffer = asyncHandler(async (req, res) => {
  if (new Date(req.body.endDate) <= new Date(req.body.startDate)) {
    throw ApiError.badRequest('The end date must be after the start date.', {
      endDate: 'Must be after the start date',
    });
  }
  const offer = await Offer.create(req.body);
  res.status(201).json({ success: true, message: 'Offer created.', data: offer });
});

export const updateOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.findById(req.params.id);
  if (!offer) throw ApiError.notFound('Offer not found.');

  Object.assign(offer, req.body);
  if (offer.endDate <= offer.startDate) {
    throw ApiError.badRequest('The end date must be after the start date.', {
      endDate: 'Must be after the start date',
    });
  }

  await offer.save();
  res.json({ success: true, message: 'Offer updated.', data: offer });
});

export const deleteOffer = asyncHandler(async (req, res) => {
  const offer = await Offer.findByIdAndDelete(req.params.id);
  if (!offer) throw ApiError.notFound('Offer not found.');
  res.json({ success: true, message: 'Offer deleted.' });
});
