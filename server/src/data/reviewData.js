/**
 * Seed reviews.
 *
 * Written to exercise the sentiment dashboard honestly rather than to flatter
 * it: mixed sentiment, several mixed *within a single review* ("food was
 * lovely, we waited forty minutes"), negations that a naive keyword matcher
 * gets backwards ("not too expensive", "not bad at all"), and complaints spread
 * across all six themes. A demo where every review is five stars proves nothing
 * about the analyser.
 *
 * `dish` is matched by name at seed time; null means a review of the restaurant
 * as a whole.
 */
export const REVIEW_SEED = [
  // ── clearly positive ──
  { rating: 5, dish: 'Butter Chicken', comment: 'The butter chicken is the best I have had in Gurugram. Rich, not too heavy, and the naan came out hot.' },
  { rating: 5, dish: 'Hyderabadi Chicken Biryani', comment: 'Proper dum biryani — the rice was separate and fragrant, and the portion was generous for the price.' },
  { rating: 5, dish: null, comment: 'Staff were lovely with our kids and the place was spotless. We will be back.' },
  { rating: 5, dish: 'Paneer Tikka', comment: 'Smoky, well marinated and served sizzling. Great starter.' },
  { rating: 4, dish: 'Gulab Jamun', comment: 'Warm and syrupy, exactly right. Two was plenty between us.' },
  { rating: 5, dish: null, comment: 'Booked a table online and it was ready when we arrived. No fuss at all.' },
  { rating: 4, dish: 'Garlic Naan', comment: 'Fresh from the tandoor and not greasy. Good value too.' },
  { rating: 5, dish: 'Mutton Rogan Josh', comment: 'The mutton fell apart. Slow cooked properly, you can tell.' },

  // ── negations a keyword matcher gets backwards ──
  { rating: 4, dish: null, comment: 'Not too expensive for the quality, and the service was not slow at all despite it being full.' },
  { rating: 4, dish: 'Chicken Malai Tikka', comment: 'Not bad at all — creamy without being sickly.' },

  // ── genuinely mixed: praise and complaint in one review ──
  { rating: 3, dish: null, comment: 'The food was lovely but we waited nearly forty minutes for the mains on a Tuesday.' },
  { rating: 3, dish: 'Veg Hakka Noodles', comment: 'Tasty enough, but the portion was small for what they charge.' },
  { rating: 3, dish: null, comment: 'Great flavours, friendly waiter, but the table next to us had not been wiped.' },
  { rating: 3, dish: 'Margherita Pizza', comment: 'Good base and fresh basil, though it arrived barely warm.' },
  { rating: 2, dish: null, comment: 'Service was attentive and the starters were excellent, but the bill had an item we never ordered.' },

  // ── clearly negative, spread across themes ──
  { rating: 2, dish: 'Chilli Paneer', comment: 'Bland and oily. Sent it back and the replacement was the same.' },
  { rating: 1, dish: null, comment: 'Waited an hour, then the waiter was rude when we asked. Avoid at peak time.' },
  { rating: 2, dish: null, comment: 'Overpriced for the portion sizes. Two of us left still hungry after spending nearly two thousand.' },
  { rating: 2, dish: 'Chicken Fried Rice', comment: 'Arrived cold and the rice was stale. Disappointing.' },
  { rating: 1, dish: null, comment: 'Washrooms were dirty which put us off finishing the meal.' },
  { rating: 2, dish: null, comment: 'The kitchen is far too slow. Everything else was fine but we nearly missed our film.' },

  // ── neutral / factual ──
  { rating: 3, dish: 'Cold Brew Coffee', comment: 'Does the job. Nothing special either way.' },
  { rating: 3, dish: null, comment: 'Standard place. Food came quickly, prices are about average for the area.' },
  { rating: 4, dish: 'Dal Makhani', comment: 'Creamy and slow cooked. A little salty for me but my wife loved it.' },
];
