let loading = null;

/**
 * Loads Razorpay Checkout on demand.
 *
 * Deliberately not bundled: the script must be served from Razorpay's own domain
 * so it always matches their live gateway, and loading it lazily means visitors
 * who never pay online never download it.
 */
export function loadRazorpayCheckout(src = 'https://checkout.razorpay.com/v1/checkout.js') {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', () => reject(new Error('Failed to load payment checkout.')));
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => {
      loading = null;
      reject(
        new Error(
          'Could not load the payment checkout. Check your internet connection, or choose to pay at the restaurant.',
        ),
      );
    };
    document.body.appendChild(script);
  });

  return loading;
}

/**
 * Opens checkout and resolves with the gateway's response.
 *
 * Resolving here means only that the browser was told the payment succeeded —
 * it is NOT proof of payment. The caller must send this response to the server,
 * which verifies the signature before treating the order as paid.
 */
export function openRazorpayCheckout({ Razorpay, session, restaurantName, onDismiss }) {
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: session.keyId,
      amount: session.amount,
      currency: session.currency,
      name: restaurantName || 'Restaurant',
      description: `Order ${session.orderNumber}`,
      order_id: session.gatewayOrderId,
      prefill: session.prefill,
      theme: { color: '#b8410f' },
      handler: (response) => resolve(response),
      modal: {
        ondismiss: () => {
          onDismiss?.();
          reject(new Error('Payment was cancelled. Your order is saved — you can pay from My orders.'));
        },
      },
    });

    rzp.on('payment.failed', (response) => {
      reject(
        new Error(
          response?.error?.description || 'The payment failed. No money has been taken for this order.',
        ),
      );
    });

    rzp.open();
  });
}
