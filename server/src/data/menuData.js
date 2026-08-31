/**
 * The demo menu, in one place.
 *
 * Shared by `seed.js` (which creates it on a fresh install) and by the
 * add-missing-dishes maintenance script, so the two can never drift apart.
 *
 * Dish tuple: [name, category, price, foodType, description, ingredients,
 *              allergens, calories, flags?]
 *
 * All of it is fictional demo content.
 */
export const CATEGORIES = [
  { name: 'Starters', description: 'Small plates to begin the meal', displayOrder: 1 },
  { name: 'Soups', description: 'Warm bowls, served with bread', displayOrder: 2 },
  { name: 'Salads', description: 'Fresh and light', displayOrder: 3 },
  { name: 'Main Course', description: 'Hearty mains from our kitchen', displayOrder: 4 },
  { name: 'Biryani', description: 'Slow-cooked rice specialities', displayOrder: 5 },
  { name: 'Pizza', description: 'Stone-baked, hand stretched', displayOrder: 6 },
  { name: 'Burger', description: 'Served with fries', displayOrder: 7 },
  { name: 'Pasta', description: 'Fresh pasta, made daily', displayOrder: 8 },
  { name: 'Breads', description: 'From the tandoor, baked to order', displayOrder: 9 },
  { name: 'Rice & Noodles', description: 'Wok-tossed and steamed', displayOrder: 10 },
  { name: 'Desserts', description: 'Something sweet to finish', displayOrder: 11 },
  { name: 'Beverages', description: 'Hot and cold drinks', displayOrder: 12 },
];

export const DISHES = [
  // Starters
  ['Paneer Tikka', 'Starters', 299, 'veg', 'Cubes of cottage cheese marinated in yoghurt and spices, grilled in the tandoor.', ['Paneer', 'Yoghurt', 'Bell pepper', 'Garam masala'], ['Dairy'], 320, { spice: 3, popular: true }],
  ['Chicken Malai Tikka', 'Starters', 379, 'non_veg', 'Creamy, mildly spiced chicken skewers finished over charcoal.', ['Chicken', 'Cream', 'Cashew', 'Cardamom'], ['Dairy', 'Nuts'], 410, { spice: 1, popular: true }],
  ['Crispy Corn Kernels', 'Starters', 249, 'veg', 'Golden fried sweetcorn tossed with curry leaves and chilli.', ['Sweetcorn', 'Corn flour', 'Curry leaves'], ['Gluten'], 280, { spice: 2 }],
  ['Vegan Buffalo Cauliflower', 'Starters', 279, 'vegan', 'Cauliflower florets in a spicy buffalo glaze with a cashew dip.', ['Cauliflower', 'Hot sauce', 'Cashew'], ['Nuts'], 240, { spice: 1 }],

  // Soups
  ['Sweet Corn Soup', 'Soups', 179, 'veg', 'Silky corn broth with finely diced vegetables.', ['Sweetcorn', 'Carrot', 'Spring onion'], [], 150, { spice: 1 }],
  ['Chicken Hot & Sour Soup', 'Soups', 219, 'non_veg', 'Peppery, tangy broth with shredded chicken.', ['Chicken', 'White pepper', 'Vinegar'], ['Soy'], 190, { spice: 4 }],

  // Salads
  ['Garden Greek Salad', 'Salads', 259, 'veg', 'Cucumber, olives, tomato and feta with a lemon-oregano dressing.', ['Cucumber', 'Feta', 'Olives', 'Tomato'], ['Dairy'], 210, { spice: 1 }],
  ['Quinoa Avocado Bowl', 'Salads', 329, 'vegan', 'Quinoa, avocado, chickpeas and pumpkin seeds with a citrus dressing.', ['Quinoa', 'Avocado', 'Chickpeas'], [], 380, { spice: 1, special: true }],

  // Main Course
  ['Butter Chicken', 'Main Course', 449, 'non_veg', 'Tandoori chicken simmered in a tomato and butter gravy.', ['Chicken', 'Tomato', 'Butter', 'Cream'], ['Dairy'], 620, { spice: 1, popular: true }],
  ['Dal Makhani', 'Main Course', 329, 'veg', 'Black lentils cooked overnight, finished with cream.', ['Black lentils', 'Kidney beans', 'Cream'], ['Dairy'], 480, { spice: 1 }],
  ['Palak Paneer', 'Main Course', 359, 'veg', 'Cottage cheese in a smooth spinach gravy.', ['Spinach', 'Paneer', 'Garlic'], ['Dairy'], 430, { spice: 1 }],
  ['Vegan Thai Green Curry', 'Main Course', 389, 'vegan', 'Coconut curry with seasonal vegetables and thai basil, served with rice.', ['Coconut milk', 'Green curry paste', 'Thai basil'], [], 520, { spice: 1, special: true }],
  ['Rogan Josh', 'Main Course', 499, 'non_veg', 'Slow-cooked lamb in a Kashmiri chilli gravy.', ['Lamb', 'Kashmiri chilli', 'Yoghurt'], ['Dairy'], 680, { spice: 3 }],

  // Biryani
  ['Hyderabadi Chicken Biryani', 'Biryani', 429, 'non_veg', 'Layered basmati and chicken sealed and dum-cooked, served with raita.', ['Basmati rice', 'Chicken', 'Saffron', 'Fried onion'], ['Dairy'], 720, { spice: 1, popular: true, special: true }],
  ['Vegetable Dum Biryani', 'Biryani', 349, 'veg', 'Seasonal vegetables and basmati rice slow-cooked with whole spices.', ['Basmati rice', 'Mixed vegetables', 'Mint'], ['Dairy'], 610, { spice: 1 }],

  // Pizza
  ['Margherita', 'Pizza', 329, 'veg', 'San Marzano tomato, fior di latte and fresh basil.', ['Tomato', 'Mozzarella', 'Basil'], ['Gluten', 'Dairy'], 780, { spice: 1 }],
  ['Peri Peri Chicken Pizza', 'Pizza', 449, 'non_veg', 'Grilled chicken, peppers and red onion with a peri peri drizzle.', ['Chicken', 'Mozzarella', 'Peppers'], ['Gluten', 'Dairy'], 890, { spice: 4, popular: true }],
  ['Vegan Garden Pizza', 'Pizza', 399, 'vegan', 'Plant-based cheese with grilled courgette, olives and rocket.', ['Vegan cheese', 'Courgette', 'Olives'], ['Gluten'], 700, { spice: 1 }],

  // Burger
  ['Classic Cheeseburger', 'Burger', 359, 'non_veg', 'Beef-style patty, cheddar, pickles and house sauce, with fries.', ['Patty', 'Cheddar', 'Brioche bun'], ['Gluten', 'Dairy', 'Egg'], 850, { spice: 1 }],
  ['Crispy Paneer Burger', 'Burger', 319, 'veg', 'Spiced crumbed paneer with mint mayo and slaw.', ['Paneer', 'Mint mayo', 'Cabbage'], ['Gluten', 'Dairy', 'Egg'], 790, { spice: 1 }],

  // Pasta
  ['Penne Arrabbiata', 'Pasta', 349, 'vegan', 'Penne in a garlicky chilli-tomato sauce.', ['Penne', 'Tomato', 'Chilli', 'Garlic'], ['Gluten'], 560, { spice: 4 }],
  ['Chicken Alfredo', 'Pasta', 429, 'non_veg', 'Fettuccine in a parmesan cream sauce with grilled chicken.', ['Fettuccine', 'Parmesan', 'Chicken', 'Cream'], ['Gluten', 'Dairy'], 820, { spice: 1 }],

  // Desserts
  ['Gulab Jamun', 'Desserts', 169, 'veg', 'Warm milk dumplings in cardamom syrup.', ['Milk solids', 'Sugar', 'Cardamom'], ['Dairy', 'Gluten'], 390, { spice: 0, popular: true }],
  ['Dark Chocolate Mousse', 'Desserts', 229, 'veg', 'Seventy percent chocolate mousse with sea salt.', ['Dark chocolate', 'Cream', 'Sea salt'], ['Dairy', 'Egg'], 420, { spice: 0 }],
  ['Vegan Mango Sorbet', 'Desserts', 189, 'vegan', 'Alphonso mango sorbet, dairy free.', ['Mango', 'Sugar', 'Lime'], [], 210, { spice: 0 }],

  // Beverages
  ['Masala Chai', 'Beverages', 99, 'veg', 'Spiced tea brewed with fresh ginger.', ['Tea', 'Milk', 'Ginger'], ['Dairy'], 120, { spice: 0 }],
  ['Fresh Lime Soda', 'Beverages', 129, 'vegan', 'Sweet, salted or mixed — served over ice.', ['Lime', 'Soda'], [], 90, { spice: 0 }],
  ['Cold Brew Coffee', 'Beverages', 189, 'vegan', 'Steeped for eighteen hours, served black over ice.', ['Coffee'], [], 15, { spice: 0 }],
  /* ---- added to broaden the menu ---- */

  // Starters
  ['Chilli Paneer', 'Starters', 319, 'veg', 'Crisp paneer tossed with peppers and onion in a sweet-hot sauce.', ['Paneer', 'Capsicum', 'Soy', 'Green chilli'], ['Dairy', 'Soy', 'Gluten'], 390, { spice: 4 }],
  ['Chicken 65', 'Starters', 349, 'non_veg', 'Fiery South Indian fried chicken with curry leaf and yoghurt.', ['Chicken', 'Curry leaves', 'Yoghurt', 'Red chilli'], ['Dairy'], 430, { spice: 3, popular: true }],
  ['Vegetable Spring Rolls', 'Starters', 259, 'vegan', 'Crisp rolls filled with shredded vegetables, sweet chilli dip.', ['Cabbage', 'Carrot', 'Spring roll pastry'], ['Gluten', 'Soy'], 310, { spice: 1 }],
  ['Hara Bhara Kebab', 'Starters', 289, 'veg', 'Spinach, pea and potato patties, griddled and served with mint chutney.', ['Spinach', 'Green peas', 'Potato'], ['Dairy'], 280, { spice: 1 }],

  // Soups
  ['Tomato Shorba', 'Soups', 189, 'vegan', 'Slow-simmered spiced tomato broth, finished with coriander.', ['Tomato', 'Ginger', 'Cumin'], [], 140, { spice: 2 }],
  ['Lemon Coriander Soup', 'Soups', 179, 'vegan', 'Clear, bright broth with lemon, coriander and crunchy vegetables.', ['Lemon', 'Coriander', 'Carrot'], [], 120, { spice: 1 }],

  // Salads
  ['Chicken Caesar Salad', 'Salads', 349, 'non_veg', 'Cos lettuce, grilled chicken, parmesan and garlic croutons.', ['Chicken', 'Cos lettuce', 'Parmesan', 'Croutons'], ['Dairy', 'Gluten', 'Egg', 'Fish'], 420, { spice: 1 }],
  ['Sprout & Corn Chaat', 'Salads', 229, 'vegan', 'Moong sprouts and sweetcorn with onion, tomato and chaat masala.', ['Moong sprouts', 'Sweetcorn', 'Chaat masala'], [], 240, { spice: 2 }],

  // Main Course
  ['Kadai Paneer', 'Main Course', 379, 'veg', 'Paneer and peppers in a coarse-ground kadai masala.', ['Paneer', 'Capsicum', 'Coriander seed'], ['Dairy'], 480, { spice: 4 }],
  ['Chicken Chettinad', 'Main Course', 469, 'non_veg', 'Peppery Tamil Nadu curry with roasted spices and coconut.', ['Chicken', 'Black pepper', 'Coconut'], [], 560, { spice: 4 }],
  ['Malai Kofta', 'Main Course', 389, 'veg', 'Paneer and potato dumplings in a mild cashew gravy.', ['Paneer', 'Potato', 'Cashew', 'Cream'], ['Dairy', 'Nuts'], 610, { spice: 1 }],
  ['Chana Masala', 'Main Course', 309, 'vegan', 'Chickpeas simmered with onion, tomato and warm spices.', ['Chickpeas', 'Onion', 'Tomato'], [], 420, { spice: 1 }],
  ['Goan Fish Curry', 'Main Course', 499, 'non_veg', 'Coconut and tamarind curry with the day\u2019s catch.', ['Fish', 'Coconut milk', 'Tamarind'], ['Fish'], 470, { spice: 1 }],
  ['Mutton Rogan Keema', 'Main Course', 529, 'non_veg', 'Minced mutton cooked down with peas and whole spices.', ['Mutton mince', 'Green peas', 'Garam masala'], [], 640, { spice: 3 }],

  // Biryani
  ['Mutton Dum Biryani', 'Biryani', 519, 'non_veg', 'Sealed and slow-cooked mutton biryani, served with raita.', ['Basmati rice', 'Mutton', 'Saffron'], ['Dairy'], 780, { spice: 1, popular: true }],
  ['Prawn Biryani', 'Biryani', 549, 'non_veg', 'Coastal-style prawn biryani with curry leaf and coconut.', ['Basmati rice', 'Prawns', 'Curry leaves'], ['Shellfish'], 690, { spice: 2 }],

  // Pizza
  ['Pepperoni Pizza', 'Pizza', 479, 'non_veg', 'Cured pepperoni over mozzarella and San Marzano tomato.', ['Pepperoni', 'Mozzarella', 'Tomato'], ['Gluten', 'Dairy'], 920, { spice: 4, popular: true }],
  ['Four Cheese Pizza', 'Pizza', 459, 'veg', 'Mozzarella, gorgonzola, parmesan and scamorza.', ['Mozzarella', 'Gorgonzola', 'Parmesan'], ['Gluten', 'Dairy'], 960, { spice: 1 }],

  // Burger
  ['Chicken Zinger Burger', 'Burger', 389, 'non_veg', 'Buttermilk-fried chicken, lettuce and peri mayo, with fries.', ['Chicken', 'Buttermilk', 'Brioche bun'], ['Gluten', 'Dairy', 'Egg'], 880, { spice: 1, popular: true }],
  ['Mushroom Swiss Burger', 'Burger', 359, 'veg', 'Garlic mushrooms and melted swiss on a toasted bun.', ['Mushroom', 'Swiss cheese', 'Brioche bun'], ['Gluten', 'Dairy'], 760, { spice: 1 }],

  // Pasta
  ['Lasagne al Forno', 'Pasta', 449, 'non_veg', 'Layered pasta with slow-cooked ragu and bechamel.', ['Pasta', 'Beef ragu', 'Bechamel'], ['Gluten', 'Dairy'], 890, { spice: 1 }],
  ['Mac and Cheese', 'Pasta', 359, 'veg', 'Macaroni in a three-cheese sauce with a crisp crumb top.', ['Macaroni', 'Cheddar', 'Breadcrumb'], ['Gluten', 'Dairy'], 820, { spice: 1 }],
  ['Pesto Penne', 'Pasta', 379, 'veg', 'Basil pesto, pine nuts and parmesan.', ['Penne', 'Basil', 'Pine nuts', 'Parmesan'], ['Gluten', 'Dairy', 'Nuts'], 700, { spice: 1 }],

  // Breads
  ['Garlic Naan', 'Breads', 89, 'veg', 'Tandoor-baked naan brushed with garlic butter.', ['Flour', 'Garlic', 'Butter'], ['Gluten', 'Dairy'], 260, { spice: 1, popular: true }],
  ['Butter Roti', 'Breads', 49, 'veg', 'Wholewheat flatbread from the tandoor.', ['Wholewheat flour', 'Butter'], ['Gluten', 'Dairy'], 150, { spice: 1 }],
  ['Laccha Paratha', 'Breads', 79, 'veg', 'Layered, flaky paratha.', ['Flour', 'Ghee'], ['Gluten', 'Dairy'], 320, { spice: 1 }],
  ['Tandoori Roti', 'Breads', 39, 'vegan', 'Plain wholewheat roti, no butter.', ['Wholewheat flour'], ['Gluten'], 130, { spice: 1 }],

  // Rice & Noodles
  ['Jeera Rice', 'Rice & Noodles', 199, 'vegan', 'Basmati tossed with cumin and coriander.', ['Basmati rice', 'Cumin'], [], 330, { spice: 1 }],
  ['Veg Hakka Noodles', 'Rice & Noodles', 269, 'vegan', 'Wok-tossed noodles with julienned vegetables.', ['Noodles', 'Cabbage', 'Carrot', 'Soy'], ['Gluten', 'Soy'], 480, { spice: 1 }],
  ['Chicken Fried Rice', 'Rice & Noodles', 319, 'non_veg', 'Egg and chicken fried rice, wok finished.', ['Rice', 'Chicken', 'Egg'], ['Egg', 'Soy'], 560, { spice: 1 }],

  // Desserts
  ['Rasmalai', 'Desserts', 189, 'veg', 'Soft cheese discs in saffron and cardamom milk.', ['Milk solids', 'Saffron', 'Pistachio'], ['Dairy', 'Nuts'], 350, { spice: 0 }],
  ['Tiramisu', 'Desserts', 259, 'veg', 'Espresso-soaked savoiardi with mascarpone cream.', ['Mascarpone', 'Espresso', 'Savoiardi'], ['Dairy', 'Egg', 'Gluten'], 430, { spice: 0 }],

  // Beverages
  ['Mango Lassi', 'Beverages', 159, 'veg', 'Thick yoghurt and alphonso mango, blended cold.', ['Yoghurt', 'Mango'], ['Dairy'], 240, { spice: 0 }],
  ['Filter Coffee', 'Beverages', 109, 'veg', 'South Indian filter coffee, frothed and strong.', ['Coffee', 'Milk'], ['Dairy'], 110, { spice: 0 }],
  ['Virgin Mojito', 'Beverages', 179, 'vegan', 'Lime, mint and soda over crushed ice.', ['Lime', 'Mint', 'Soda'], [], 95, { spice: 0 }],
];
