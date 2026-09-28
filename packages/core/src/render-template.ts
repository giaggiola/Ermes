import Handlebars from "handlebars";

let helpersRegistered = false;

export function ensureHandlebarsHelpers(): void {
  if (helpersRegistered) {
    return;
  }

  Handlebars.registerHelper("formatCurrency", (amount: string, currency: string) => {
    const numericAmount = Number.parseFloat(amount);
    if (Number.isNaN(numericAmount)) {
      return amount;
    }

    return new Intl.NumberFormat("en-US", {
      currency: currency || "USD",
      style: "currency",
    }).format(numericAmount);
  });

  Handlebars.registerHelper("formatDate", (date: string) => {
    try {
      return new Date(date).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return date;
    }
  });

  Handlebars.registerHelper("uppercase", (value: string) => value?.toUpperCase() || "");
  Handlebars.registerHelper("lowercase", (value: string) => value?.toLowerCase() || "");

  helpersRegistered = true;
}

export function renderHandlebarsTemplate(template: string, context: Record<string, unknown>): string {
  ensureHandlebarsHelpers();
  return Handlebars.compile(template)(context);
}

export const defaultTemplateContext = {
  cart_id: "cart_01ABC123DEF456",
  carrier: "USPS",
  checkout_url: "https://example.com/checkout",
  care_guide_url: "https://example.com/pages/care-guide",
  currency: "USD",
  current_price: "265.00",
  customer_name: "Jane Doe",
  email: "jane@example.com",
  email_logo_url:
    "",
  estimated_delivery: "January 25, 2026",
  editorial_image_alt: "Your store collection",
  editorial_image_url:
    "",
  first_name: "Jane",
  friend_discount_percentage: "15",
  friend_minimum_purchase: "200.00",
  gift_card_code: "SAMPLE-GIFT-2026",
  gift_card_message: "For something that feels completely you.",
  gift_card_sender_name: "Alex",
  gift_card_url: "https://example.com/pages/gift-cards",
  gift_card_value: "200.00",
  items: [
    {
      image_alt: "The Mini Dress in navy",
      line_price: "265.00",
      product_id: "gid://shopify/Product/1000000001",
      product_url: "https://example.com/products/the-mini-dress",
      quantity: 1,
      thumbnail:
        "http://localhost:3025/line-sheet/look-mini-green.jpg",
      title: "The Mini Dress",
      unit_price: "265.00",
      variant_id: "gid://shopify/ProductVariant/2000000001",
      variant_title: "Navy / Small",
    },
    {
      image_alt: "The Shell Hat in cream",
      line_price: "180.00",
      product_id: "gid://shopify/Product/1000000002",
      product_url: "https://example.com/products/shell-hat",
      quantity: 1,
      thumbnail:
        "http://localhost:3025/line-sheet/look-shell-hat.jpg",
      title: "The Shell Hat",
      unit_price: "180.00",
      variant_id: "gid://shopify/ProductVariant/2000000002",
      variant_title: "Cream",
    },
  ],
  last_name: "Doe",
  last_order_date: "2026-07-02T12:00:00.000Z",
  old_price: "295.00",
  order_id: "order_01ABC123DEF456",
  order_number: "#ES-1234",
  order_status_url: "https://example.com/orders/example/authenticate",
  preferences_url: "https://example.com/preferences?email=jane%40example.com",
  product_image_alt: "The Mini Dress in navy",
  product_image_url:
    "http://localhost:3025/line-sheet/look-mini-green.jpg",
  product_title: "The Mini Dress",
  product_url: "https://example.com/products/the-mini-dress",
  referral_code: "SAMPLE-PRIVATE123",
  reward_code: "SAMPLE-THANKS-PRIVATE123",
  reward_expires_at: "2027-02-01T00:00:00.000Z",
  reward_url: "https://example.com/discount/SAMPLE-THANKS-PRIVATE123",
  share_url: "https://example.com/discount/SAMPLE-PRIVATE123",
  advocate_discount_percentage: "15",
  minimum_purchase: "200.00",
  shipping_address: {
    address1: "24 Studio Lane",
    address2: "",
    city: "New York",
    country: "United States",
    first_name: "Jane",
    last_name: "Doe",
    province: "New York",
    zip: "10013",
  },
  shipping_total: "15.00",
  store_name: "Your store",
  store_url: "https://example.com",
  subtotal: "445.00",
  tax_total: "39.95",
  total: "499.95",
  tracking_company: "USPS",
  tracking_number: "9400111899223456789012",
  tracking_url:
    "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
  unsubscribe_url: "https://example.com/unsubscribe?email=jane%40example.com",
  variant_title: "Navy / Small",
};
