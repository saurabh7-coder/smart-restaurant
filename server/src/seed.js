/**
 * Seeds the database with a working demo restaurant.
 *
 * ALL DATA BELOW IS FICTIONAL PLACEHOLDER DATA created for development and demo
 * purposes — the restaurant, dishes, prices, staff and customers do not refer to
 * any real business or person.
 *
 * Usage:  npm run seed          (adds anything missing, keeps existing data)
 *         npm run seed -- --fresh   (wipes the collections first)
 */
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import { ROLES, TABLE_STATUS } from './constants.js';
import { User } from './models/User.js';
import { Category } from './models/Category.js';
import { MenuItem } from './models/MenuItem.js';
import { Table } from './models/Table.js';
import { Reservation } from './models/Reservation.js';
import { Review } from './models/Review.js';
import { REVIEW_SEED } from './data/reviewData.js';
import { Offer } from './models/Offer.js';
import { Restaurant } from './models/Restaurant.js';
import { Counter } from './models/Counter.js';
import { CATEGORIES, DISHES } from './data/menuData.js';

const FRESH = process.argv.includes('--fresh');



const TABLES = [
  ['T01', 2, 'window'], ['T02', 2, 'indoor'], ['T03', 2, 'window'],
  ['T04', 4, 'indoor'], ['T05', 4, 'indoor'], ['T06', 4, 'window'],
  ['T07', 4, 'outdoor'], ['T08', 6, 'indoor'], ['T09', 6, 'outdoor'],
  ['T10', 6, 'rooftop'], ['T11', 8, 'private'], ['T12', 10, 'private'],
];

const CUSTOMERS = [
  ['Rahul Kumar', 'rahul@example.test', '+91 98100 00001'],
  ['Amit Sharma', 'amit@example.test', '+91 98100 00002'],
  ['Priya Nair', 'priya@example.test', '+91 98100 00003'],
  ['Sara Iqbal', 'sara@example.test', '+91 98100 00004'],
];

async function run() {
  await connectDB();
  console.log('✔ Connected to MongoDB');

  if (FRESH) {
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      MenuItem.deleteMany({}),
      Table.deleteMany({}),
      Reservation.deleteMany({}),
      Review.deleteMany({}),
      Offer.deleteMany({}),
      Restaurant.deleteMany({}),
      Counter.deleteMany({}),
    ]);
    console.log('✔ Cleared existing collections (--fresh)');
  }

  /* ---------- restaurant profile ---------- */
  const restaurant = await Restaurant.getSingleton();
  Object.assign(restaurant, {
    name: 'Delicious Adda',
    tagline: 'Delicious Food • Great Experience',
    description:
      'A neighbourhood kitchen serving north Indian classics alongside wood-fired pizza and fresh pasta. Every dish is cooked to order.',
    address: '42 Residency Road, Bengaluru 560025',
    phone: '+91 80 4000 1234',
    email: 'hello@spiceroute.test',
    openTime: env.openTime,
    closeTime: env.closeTime,
    avgSpendPerGuest: 600,
  });
  await restaurant.save();
  console.log('✔ Restaurant profile');

  /* ---------- users ---------- */
  await upsertUser({
    name: 'Restaurant Admin',
    email: env.seed.adminEmail,
    phone: '+91 80 4000 0001',
    password: env.seed.adminPassword,
    role: ROLES.ADMIN,
  });
  await upsertUser({
    name: 'Floor Staff',
    email: env.seed.staffEmail,
    phone: '+91 80 4000 0002',
    password: env.seed.staffPassword,
    role: ROLES.STAFF,
  });
  for (const [name, email, phone] of CUSTOMERS) {
    // eslint-disable-next-line no-await-in-loop
    await upsertUser({ name, email, phone, password: 'Customer@123', role: ROLES.CUSTOMER });
  }
  console.log(`✔ Users (admin, staff, ${CUSTOMERS.length} customers)`);

  /* ---------- categories ---------- */
  const categoryMap = new Map();
  for (const c of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await Category.findOneAndUpdate({ name: c.name }, c, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    categoryMap.set(c.name, doc._id);
  }
  console.log(`✔ Categories (${CATEGORIES.length})`);

  /* ---------- menu ---------- */
  for (const [name, cat, price, foodType, description, ingredients, allergens, calories, flags = {}] of DISHES) {
    // eslint-disable-next-line no-await-in-loop
    await MenuItem.findOneAndUpdate(
      { name },
      {
        name,
        category: categoryMap.get(cat),
        price,
        foodType,
        description,
        ingredients,
        allergens,
        calories,
      spiceLevel: flags.spice ?? 0,
        isAvailable: true,
        isPopular: Boolean(flags.popular),
        isTodaysSpecial: Boolean(flags.special),
        image: dishImage(name),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`✔ Menu items (${DISHES.length})`);

  /* ---------- tables ---------- */
  for (const [tableNumber, capacity, location] of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    await Table.findOneAndUpdate(
      { tableNumber },
      { tableNumber, capacity, location, status: TABLE_STATUS.AVAILABLE },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`✔ Tables (${TABLES.length})`);

  /* ---------- offers ---------- */
  const now = new Date();
  const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const offers = [
    {
      code: 'WELCOME10',
      description: '10% off your first visit',
      discountType: 'percent',
      discountValue: 10,
      minGuests: 1,
      startDate: now,
      endDate: in90Days,
    },
    {
      code: 'FAMILY500',
      description: 'Flat ₹500 off for parties of 6 or more',
      discountType: 'flat',
      discountValue: 500,
      minGuests: 6,
      startDate: now,
      endDate: in90Days,
    },
  ];
  for (const offer of offers) {
    // eslint-disable-next-line no-await-in-loop
    await Offer.findOneAndUpdate({ code: offer.code }, offer, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  }
  console.log(`✔ Offers (${offers.length})`);

  console.log('\n─────────────────────────────────────────────');
  console.log('  Seed complete. Sign in with:');
  console.log(`   admin    ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
  console.log(`   staff    ${env.seed.staffEmail} / ${env.seed.staffPassword}`);
  console.log(`   customer ${CUSTOMERS[0][1]} / Customer@123`);
  console.log('─────────────────────────────────────────────');
  console.log('  All seeded content is fictional demo data.\n');

  await disconnectDB();
}

/**
 * Maps a dish to its bundled photo in server/uploads/dishes.
 *
 * The photos are CC-licensed images from Wikimedia Commons, each one checked by
 * eye against the dish it represents — see uploads/dishes/CREDITS.md for the
 * per-image author and licence. Returns '' when a dish has no photo, and the UI
 * falls back to a category glyph.
 */
function dishImage(name) {
  const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`;
  const onDisk = path.resolve(process.cwd(), 'uploads/dishes', file);
  return fs.existsSync(onDisk) ? `/uploads/dishes/${file}` : '';
}

/** Creates the user if absent; never overwrites an existing password. */
async function upsertUser({ name, email, phone, password, role }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return existing;
  return User.create({ name, email, phone, password, role });
}

run().catch(async (err) => {
  console.error('✖ Seed failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
