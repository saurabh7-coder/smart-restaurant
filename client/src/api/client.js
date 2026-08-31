const TOKEN_KEY = 'sr_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** Error carrying the server's message and per-field details for inline display. */
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const token = tokenStore.get();

  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* e.g. a 204 or an HTML error page */
  }

  if (!res.ok) {
    // An expired or revoked token should drop the user back to a logged-out state
    // rather than leaving the UI in a half-authenticated limbo.
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(
      payload?.message || `Request failed (${res.status})`,
      res.status,
      payload?.details,
    );
  }

  return payload;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  /* auth */
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  updateProfile: (data) => request('/auth/profile', { method: 'PUT', body: data }),
  changePassword: (data) => request('/auth/password', { method: 'PUT', body: data }),

  /* restaurant */
  getRestaurant: () => request('/restaurant'),
  updateRestaurant: (data) => request('/restaurant', { method: 'PUT', body: data }),

  /* menu + categories */
  getMenu: (params) => request(`/menu${qs(params)}`),
  getMenuItem: (id) => request(`/menu/${id}`),
  createMenuItem: (formData) => request('/menu', { method: 'POST', body: formData, isFormData: true }),
  updateMenuItem: (id, formData) =>
    request(`/menu/${id}`, { method: 'PUT', body: formData, isFormData: true }),
  deleteMenuItem: (id) => request(`/menu/${id}`, { method: 'DELETE' }),

  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', { method: 'POST', body: data }),
  updateCategory: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: data }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),

  /* tables */
  getTables: (params) => request(`/tables${qs(params)}`),
  createTable: (data) => request('/tables', { method: 'POST', body: data }),
  updateTable: (id, data) => request(`/tables/${id}`, { method: 'PUT', body: data }),
  setTableStatus: (id, status) => request(`/tables/${id}/status`, { method: 'PATCH', body: { status } }),
  deleteTable: (id) => request(`/tables/${id}`, { method: 'DELETE' }),

  /* reservations */
  getAvailability: (params) => request(`/reservations/availability${qs(params)}`),
  createReservation: (data) => request('/reservations', { method: 'POST', body: data }),
  getMyReservations: (params) => request(`/reservations/mine${qs(params)}`),
  getReservation: (id) => request(`/reservations/${id}`),
  listReservations: (params) => request(`/reservations${qs(params)}`),
  getTodayBoard: (params) => request(`/reservations/today${qs(params)}`),
  updateReservation: (id, data) => request(`/reservations/${id}`, { method: 'PUT', body: data }),
  setReservationStatus: (id, status, note) =>
    request(`/reservations/${id}/status`, { method: 'PATCH', body: { status, note } }),
  cancelReservation: (id, reason) =>
    request(`/reservations/${id}`, { method: 'DELETE', body: { reason } }),

  /* reviews */
  getReviews: (params) => request(`/reviews${qs(params)}`),
  getMyReviews: () => request('/reviews/mine'),
  createReview: (data) => request('/reviews', { method: 'POST', body: data }),
  updateReview: (id, data) => request(`/reviews/${id}`, { method: 'PUT', body: data }),
  deleteReview: (id) => request(`/reviews/${id}`, { method: 'DELETE' }),

  /* offers */
  getOffers: () => request('/offers'),
  validateOffer: (code, guests) => request('/offers/validate', { method: 'POST', body: { code, guests } }),
  createOffer: (data) => request('/offers', { method: 'POST', body: data }),
  updateOffer: (id, data) => request(`/offers/${id}`, { method: 'PUT', body: data }),
  deleteOffer: (id) => request(`/offers/${id}`, { method: 'DELETE' }),

  /* users */
  getUsers: (params) => request(`/users${qs(params)}`),
  getUser: (id) => request(`/users/${id}`),
  createStaffUser: (data) => request('/users', { method: 'POST', body: data }),
  setUserRole: (id, role) => request(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
  setUserBlocked: (id, isBlocked) =>
    request(`/users/${id}/blocked`, { method: 'PATCH', body: { isBlocked } }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  /* orders */
  quoteOrder: (data) => request('/orders/quote', { method: 'POST', body: data }),
  createOrder: (data) => request('/orders', { method: 'POST', body: data }),
  getMyOrders: (params) => request(`/orders/mine${qs(params)}`),
  getOrder: (id) => request(`/orders/${id}`),
  listOrders: (params) => request(`/orders${qs(params)}`),
  getKitchenBoard: () => request('/orders/kitchen'),
  setOrderStatus: (id, status, note) =>
    request(`/orders/${id}/status`, { method: 'PATCH', body: { status, note } }),
  cancelOrder: (id, reason) => request(`/orders/${id}`, { method: 'DELETE', body: { reason } }),

  /* recommendations, loyalty, post-meal ratings */
  getRecommendations: (params) => request(`/menu/recommendations${qs(params)}`),
  getLoyalty: () => request('/loyalty/me'),
  getLoyaltyConfig: () => request('/loyalty/config'),
  getPendingReviews: () => request('/reviews/pending'),

  /* AI & smart features */
  getAiStatus: () => request('/ai/status'),
  askAssistant: (body) => request('/ai/ask', { method: 'POST', body }),
  parseOrder: (body) => request('/ai/parse-order', { method: 'POST', body }),
  planMeal: (body) => request('/ai/meal-plan', { method: 'POST', body }),
  getAlternatives: (id, params) => request(`/ai/alternatives/${id}${qs(params)}`),
  reviewCartForIssues: (body) => request('/ai/review-cart', { method: 'POST', body }),
  screenDishes: (body) => request('/ai/screen', { method: 'POST', body }),
  getSafeMenu: () => request('/ai/safe-menu'),
  getSentiment: (params) => request(`/ai/sentiment${qs(params)}`),
  describeDish: (body) => request('/ai/describe', { method: 'POST', body }),

  /* delivery addresses */
  getAddresses: () => request('/addresses'),
  addAddress: (data) => request('/addresses', { method: 'POST', body: data }),
  updateAddress: (id, data) => request(`/addresses/${id}`, { method: 'PUT', body: data }),
  setDefaultAddress: (id) => request(`/addresses/${id}/default`, { method: 'PATCH' }),
  deleteAddress: (id) => request(`/addresses/${id}`, { method: 'DELETE' }),

  /* payments */
  getPaymentConfig: () => request('/payments/config'),
  createPaymentSession: (orderId) => request('/payments/session', { method: 'POST', body: { order: orderId } }),
  verifyPayment: (data) => request('/payments/verify', { method: 'POST', body: data }),
  refundOrder: (orderId, reason) =>
    request('/payments/refund', { method: 'POST', body: { order: orderId, reason } }),

  /* stats */
  getDashboard: (params) => request(`/stats/dashboard${qs(params)}`),
  getOccupancy: (params) => request(`/stats/occupancy${qs(params)}`),
  getReports: (params) => request(`/stats/reports${qs(params)}`),
};
