import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';

/**
 * Runs express-validator chains and converts failures into a single 400 with a
 * field-keyed detail map the frontend can render inline.
 */
export function validate(chains) {
  return async (req, _res, next) => {
    for (const chain of chains) {
      // eslint-disable-next-line no-await-in-loop
      await chain.run(req);
    }

    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const details = {};
    for (const err of result.array()) {
      const field = err.path || err.param || '_';
      if (!details[field]) details[field] = err.msg;
    }
    return next(ApiError.badRequest('Please correct the highlighted fields.', details));
  };
}
