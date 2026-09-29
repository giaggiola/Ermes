export interface MedusaEmailTemplate {
  category: "marketing" | "transactional";
  htmlContent: string;
  id: string;
  name: string;
  previewText: string;
  subject: string;
  textContent: string;
  variables: string[];
}

type TemplateContent = Omit<MedusaEmailTemplate, "htmlContent"> & {
  body: string;
};

const colors = {
  border: "#cfcfcf",
  canvas: "#efefef",
  error: "#cb2b2b",
  ink: "#1c1c1c",
  muted: "#666666",
  sale: "#e32c2b",
  white: "#ffffff",
} as const;

const bodyFont = "'Gill Sans','Gill Sans MT',Arial,sans-serif";
const headingFont = "'Sackers Gothic Medium','Arial Narrow',Arial,sans-serif";

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function button(label: string, href: string) {
  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="${colors.ink}" style="background:${colors.ink};border:1px solid ${colors.ink};"><a href="${href}" style="display:inline-block;padding:15px 24px;color:${colors.white};font-family:${bodyFont};font-size:10px;letter-spacing:4px;line-height:1.2;text-decoration:none;text-transform:uppercase;">${label}</a></td></tr></table>`;
}

function heading(eyebrow: string, title: string, introduction: string) {
  return `<p style="margin:0 0 18px;color:${colors.muted};font-family:${headingFont};font-size:11px;letter-spacing:1.4px;line-height:1.4;text-transform:uppercase;">${eyebrow}</p><h1 style="margin:0 0 22px;color:${colors.ink};font-family:${headingFont};font-size:28px;font-weight:400;letter-spacing:.5px;line-height:1.3;text-transform:uppercase;">${title}</h1><p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:16px;line-height:1.65;">${introduction}</p>`;
}

const items = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
{{#each items}}
<tr>
  <td style="border-top:1px solid ${colors.border};padding:18px 0;vertical-align:top;width:112px;">
    {{#if thumbnail}}<a href="{{product_url}}"><img src="{{thumbnail}}" width="96" alt="{{image_alt}}" style="display:block;width:96px;height:auto;border:0;" /></a>{{/if}}
  </td>
  <td style="border-top:1px solid ${colors.border};padding:18px 8px;vertical-align:top;">
    <p style="margin:0 0 6px;color:${colors.ink};font-family:${bodyFont};font-size:14px;letter-spacing:1px;line-height:1.45;">{{title}}</p>
    {{#if variant_title}}<p style="margin:0 0 6px;color:${colors.muted};font-family:${bodyFont};font-size:12px;line-height:1.45;">{{variant_title}}</p>{{/if}}
    <p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:12px;line-height:1.45;">Qty {{quantity}}</p>
  </td>
  <td align="right" style="border-top:1px solid ${colors.border};padding:18px 0;vertical-align:top;white-space:nowrap;">
    <p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:13px;line-height:1.45;">{{formatCurrency line_price ../currency}}</p>
  </td>
</tr>
{{/each}}
</table>`;

const itemsWithoutPrices = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
{{#each items}}
<tr>
  <td style="border-top:1px solid ${colors.border};padding:18px 0;vertical-align:top;width:112px;">
    {{#if thumbnail}}<a href="{{product_url}}"><img src="{{thumbnail}}" width="96" alt="{{image_alt}}" style="display:block;width:96px;height:auto;border:0;" /></a>{{/if}}
  </td>
  <td style="border-top:1px solid ${colors.border};padding:18px 8px;vertical-align:top;">
    <p style="margin:0 0 6px;color:${colors.ink};font-family:${bodyFont};font-size:14px;letter-spacing:1px;line-height:1.45;">{{title}}</p>
    {{#if variant_title}}<p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:12px;line-height:1.45;">{{variant_title}}</p>{{/if}}
  </td>
</tr>
{{/each}}
</table>`;

const editorialImage = `{{#if editorial_image_url}}<a href="{{store_url}}"><img src="{{editorial_image_url}}" width="542" alt="{{editorial_image_alt}}" style="display:block;width:100%;height:auto;margin:0 0 36px;border:0;" /></a>{{/if}}`;

const trackingDetails = `{{#if tracking_number}}<div style="margin:26px 0;padding:18px;border:1px solid ${colors.border};"><p style="margin:0 0 7px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:1.5px;text-transform:uppercase;">Tracking number</p><p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:14px;">{{tracking_number}}{{#if tracking_company}} · {{tracking_company}}{{/if}}</p></div>{{/if}}`;

const discountCard = `<div style="margin:30px 0;padding:24px;border:1px solid ${colors.ink};text-align:center;"><p style="margin:0 0 10px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:2px;text-transform:uppercase;">A little invitation back</p><p style="margin:0 0 8px;color:${colors.ink};font-family:${bodyFont};font-size:26px;letter-spacing:3px;">{{discount_code}}</p><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;">{{discount_value}}% off · expires {{discount_expires}}</p></div>`;

const orderTotals = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid ${colors.ink};">
<tr><td style="padding:16px 0 4px;color:${colors.muted};font-family:${bodyFont};font-size:13px;">Subtotal</td><td align="right" style="padding:16px 0 4px;color:${colors.ink};font-family:${bodyFont};font-size:13px;">{{formatCurrency subtotal currency}}</td></tr>
<tr><td style="padding:4px 0;color:${colors.muted};font-family:${bodyFont};font-size:13px;">Shipping</td><td align="right" style="padding:4px 0;color:${colors.ink};font-family:${bodyFont};font-size:13px;">{{formatCurrency shipping_total currency}}</td></tr>
<tr><td style="padding:4px 0 16px;color:${colors.muted};font-family:${bodyFont};font-size:13px;">Tax</td><td align="right" style="padding:4px 0 16px;color:${colors.ink};font-family:${bodyFont};font-size:13px;">{{formatCurrency tax_total currency}}</td></tr>
<tr><td style="border-top:1px solid ${colors.border};padding:16px 0;color:${colors.ink};font-family:${headingFont};font-size:12px;letter-spacing:1px;text-transform:uppercase;">Total</td><td align="right" style="border-top:1px solid ${colors.border};padding:16px 0;color:${colors.ink};font-family:${bodyFont};font-size:16px;">{{formatCurrency total currency}}</td></tr>
</table>`;

function shell(previewText: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeAttribute(previewText)}</title>
  <style>@media only screen and (max-width:660px){.email-frame{width:100%!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-heading{font-size:23px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${colors.canvas};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:${colors.canvas};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" class="email-frame" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:640px;border-collapse:collapse;background:${colors.white};border:1px solid ${colors.border};">
        <tr><td align="center" bgcolor="${colors.white}" style="padding:30px 24px;border-bottom:1px solid ${colors.border};background:${colors.white};"><a href="{{store_url}}" style="color:${colors.ink};font-family:${headingFont};font-size:17px;letter-spacing:5px;text-decoration:none;text-transform:uppercase;">{{#if email_logo_url}}<img src="{{email_logo_url}}" width="142" height="46" alt="{{store_name}}" style="display:block;width:142px;max-width:100%;height:auto;border:0;" />{{else}}{{store_name}}{{/if}}</a></td></tr>
        <tr><td class="email-pad" style="padding:48px 48px 32px;">${body}</td></tr>
        <tr><td class="email-pad" style="padding:28px 48px;background:${colors.ink};color:${colors.white};">
          <p style="margin:0 0 10px;font-family:${headingFont};font-size:11px;letter-spacing:2px;text-transform:uppercase;">{{store_name}}</p>
          <p style="margin:0;font-family:${bodyFont};font-size:12px;line-height:1.6;color:#d9d9d9;">Considered pieces, made to be lived in.<br /><a href="{{store_url}}" style="color:${colors.white};text-decoration:underline;">Visit the studio</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function template(input: TemplateContent): MedusaEmailTemplate {
  const { body, ...definition } = input;
  return { ...definition, htmlContent: shell(input.previewText, body) };
}

const commonVariables = [
  "email_logo_url",
  "first_name",
  "store_name",
  "store_url",
];
const orderVariables = [
  ...commonVariables,
  "currency",
  "items",
  "order_id",
  "order_number",
  "order_status_url",
  "shipping_total",
  "subtotal",
  "tax_total",
  "total",
];
const trackingVariables = [
  "tracking_company",
  "tracking_number",
  "tracking_url",
];
const editorialVariables = ["editorial_image_alt", "editorial_image_url"];

export const MEDUSA_EMAIL_TEMPLATES = {
  welcome: template({
    body: `${editorialImage}${heading("Welcome to the studio", "A little something for you", "Hello {{first_name}}, thank you for joining us. Discover considered pieces made for the way you live, with a welcome code for your first order.")}<div style="margin:32px 0;padding:24px;border:1px solid ${colors.ink};text-align:center;"><p style="margin:0 0 10px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Your welcome code</p><p style="margin:0 0 8px;color:${colors.ink};font-family:${bodyFont};font-size:28px;letter-spacing:3px;">{{discount_code}}</p><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;">{{discount_value}}% off · expires {{discount_expires}}</p></div>${button("Discover the collection", "{{store_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_welcome_v2",
    name: "Newsletter Welcome",
    previewText: "Your welcome code is inside",
    subject: "Welcome to {{store_name}} — your code is inside",
    textContent:
      "Welcome to {{store_name}}\n\nHello {{first_name}}, thank you for joining us.\n\nYour welcome code is {{discount_code}} for {{discount_value}}% off. It expires {{discount_expires}}.\n\n{{store_url}}",
    variables: [
      ...commonVariables,
      ...editorialVariables,
      "discount_code",
      "discount_expires",
      "discount_value",
    ],
  }),
  abandonedCart: template({
    body: `${heading("Still considering?", "Your edit is waiting", "Hello {{first_name}}, the pieces you chose are still in your bag. Take another look before they move on.")}<div style="margin:32px 0 28px;">${items}</div>${button("Return to your bag", "{{checkout_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_abandoned_cart_v2",
    name: "Abandoned Cart",
    previewText: "The pieces in your bag are still waiting",
    subject: "Still thinking it over?",
    textContent:
      "Your edit is waiting\n\nHello {{first_name}}, the pieces you chose are still in your bag.\n\n{{#each items}}{{quantity}} × {{title}} — {{formatCurrency line_price ../currency}}\n{{/each}}\nReturn to your bag: {{checkout_url}}",
    variables: [
      ...commonVariables,
      "checkout_url",
      "currency",
      "items",
      "total",
    ],
  }),
  abandonedCheckout: template({
    body: `${heading("Nearly yours", "Complete your order", "Hello {{first_name}}, you were close. Your selection is saved so you can continue exactly where you left off.")}<div style="margin:32px 0 28px;">${items}</div>${button("Complete checkout", "{{checkout_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_abandoned_checkout_v2",
    name: "Abandoned Checkout",
    previewText: "Your selection is saved",
    subject: "Your selection is almost yours",
    textContent:
      "Complete your order\n\nHello {{first_name}}, your selection is saved.\n\n{{#each items}}{{quantity}} × {{title}} — {{formatCurrency line_price ../currency}}\n{{/each}}\nComplete checkout: {{checkout_url}}",
    variables: [
      ...commonVariables,
      "checkout_url",
      "currency",
      "items",
      "total",
    ],
  }),
  orderConfirmation: template({
    body: `${heading("Order {{order_number}}", "Thank you for your order", "Hello {{first_name}}, we have received your order and will let you know as soon as it is on its way.")}<div style="margin:32px 0 8px;">${items}</div>${orderTotals}<div style="margin-top:28px;">${button("View your order", "{{order_status_url}}")}</div>`,
    category: "transactional",
    id: "tpl_medusa_order_confirmation_v2",
    name: "Order Confirmation",
    previewText: "We have received order {{order_number}}",
    subject: "Order {{order_number}} confirmed",
    textContent:
      "Thank you for your order\n\nHello {{first_name}}, we have received order {{order_number}}.\n\n{{#each items}}{{quantity}} × {{title}} — {{formatCurrency line_price ../currency}}\n{{/each}}\nTotal: {{formatCurrency total currency}}\n\nView your order: {{order_status_url}}",
    variables: orderVariables,
  }),
  orderShipped: template({
    body: `${heading("Order {{order_number}}", "Your order is on its way", "Hello {{first_name}}, your pieces have left the studio{{#if tracking_company}} with {{tracking_company}}{{/if}}.")}<div style="margin:32px 0 8px;">${items}</div>${trackingDetails}{{#if tracking_url}}${button("Track your order", "{{tracking_url}}")}{{else}}${button("View your order", "{{order_status_url}}")}{{/if}}`,
    category: "transactional",
    id: "tpl_medusa_order_shipped_v2",
    name: "Order Shipped",
    previewText: "Order {{order_number}} is on its way",
    subject: "Your order is on its way",
    textContent:
      "Your order is on its way\n\nHello {{first_name}}, order {{order_number}} has left the studio.\nTracking: {{tracking_number}}\n{{tracking_url}}",
    variables: [...orderVariables, ...trackingVariables],
  }),
  outForDelivery: template({
    body: `${heading("Order {{order_number}}", "Out for delivery", "Hello {{first_name}}, your order is with the local courier and should be with you soon.")}<div style="margin:32px 0 8px;">${itemsWithoutPrices}</div>{{#if estimated_delivery}}<p style="margin:24px 0;color:${colors.ink};font-family:${bodyFont};font-size:16px;">Estimated delivery · {{estimated_delivery}}</p>{{/if}}${trackingDetails}{{#if tracking_url}}${button("Follow your delivery", "{{tracking_url}}")}{{else}}${button("View your order", "{{order_status_url}}")}{{/if}}`,
    category: "transactional",
    id: "tpl_medusa_out_for_delivery_v2",
    name: "Out for Delivery",
    previewText: "Your order is out for delivery",
    subject: "Your order is out for delivery",
    textContent:
      "Out for delivery\n\nHello {{first_name}}, order {{order_number}} should be with you soon.\nTracking number: {{tracking_number}}\n\nTrack it: {{tracking_url}}",
    variables: [...orderVariables, "estimated_delivery", ...trackingVariables],
  }),
  orderDelivered: template({
    body: `${heading("Order {{order_number}}", "Delivered", "Hello {{first_name}}, your order has arrived. We hope it feels every bit as good as you imagined.")}<div style="margin:32px 0 8px;">${itemsWithoutPrices}</div>${trackingDetails}${button("Visit the studio", "{{store_url}}")}`,
    category: "transactional",
    id: "tpl_medusa_order_delivered_v2",
    name: "Order Delivered",
    previewText: "Order {{order_number}} has arrived",
    subject: "Your order has arrived",
    textContent:
      "Delivered\n\nHello {{first_name}}, order {{order_number}} has arrived. We hope you love it.\n\n{{store_url}}",
    variables: [...orderVariables, ...trackingVariables],
  }),
  deliveryFailed: template({
    body: `${heading("Delivery update", "We could not complete your delivery", "Hello {{first_name}}, the courier was unable to deliver order {{order_number}}. Use the tracking link for the latest instructions or contact us if you need help.")}<div style="margin:32px 0 8px;">${itemsWithoutPrices}</div>${trackingDetails}<div style="margin:26px 0;">{{#if tracking_url}}${button("View delivery details", "{{tracking_url}}")}{{else}}${button("View your order", "{{order_status_url}}")}{{/if}}</div><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;line-height:1.6;">Need a hand? Reply to this email and our studio team will help.</p>`,
    category: "transactional",
    id: "tpl_medusa_delivery_failed_v2",
    name: "Delivery Failed",
    previewText: "An update about delivery of order {{order_number}}",
    subject: "An update about your delivery",
    textContent:
      "We could not complete your delivery\n\nThe courier was unable to deliver order {{order_number}}.\nTracking number: {{tracking_number}}\nSee the latest details: {{tracking_url}}",
    variables: [...orderVariables, ...trackingVariables],
  }),
  orderReturned: template({
    body: `${heading("Order {{order_number}}", "Your return has reached us", "Hello {{first_name}}, we have received your return. We will send another note when the return has been reviewed and any refund has been processed.")}<div style="margin:32px 0 8px;">${itemsWithoutPrices}</div>${trackingDetails}<div style="margin-top:26px;">${button("View order details", "{{order_status_url}}")}</div>`,
    category: "transactional",
    id: "tpl_medusa_order_returned_v2",
    name: "Order Returned",
    previewText: "We have received your return",
    subject: "We have received your return",
    textContent:
      "Your return has reached us\n\nHello {{first_name}}, we have received the return for order {{order_number}}.\n\n{{order_status_url}}",
    variables: [...orderVariables, ...trackingVariables],
  }),
  giftCard: template({
    body: `${editorialImage}${heading("A gift from {{gift_card_sender_name}}", "Something lovely, just for you", "{{gift_card_message}}")}<div style="margin:32px 0;padding:28px;border:1px solid ${colors.ink};text-align:center;"><p style="margin:0 0 10px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Gift card value</p><p style="margin:0 0 18px;color:${colors.ink};font-family:${bodyFont};font-size:28px;">{{formatCurrency gift_card_value currency}}</p><p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:18px;letter-spacing:2px;">{{gift_card_code}}</p></div>${button("Choose something special", "{{gift_card_url}}")}`,
    category: "transactional",
    id: "tpl_medusa_gift_card_v2",
    name: "Gift Card",
    previewText: "A gift card has arrived",
    subject: "A gift for you from {{gift_card_sender_name}}",
    textContent:
      "Something lovely, just for you\n\n{{gift_card_message}}\n\nGift card: {{gift_card_code}}\nValue: {{formatCurrency gift_card_value currency}}\n\n{{gift_card_url}}",
    variables: [
      ...commonVariables,
      ...editorialVariables,
      "currency",
      "gift_card_code",
      "gift_card_message",
      "gift_card_sender_name",
      "gift_card_url",
      "gift_card_value",
    ],
  }),
  backInStock: template({
    body: `${heading("Back in stock", "{{product_title}} has returned", "Hello {{first_name}}, the piece you asked us to watch is available again. Quantities may be limited.")}{{#if product_image_url}}<a href="{{product_url}}"><img src="{{product_image_url}}" width="542" alt="{{product_image_alt}}" style="display:block;width:100%;height:auto;margin:32px 0 24px;border:0;" /></a>{{/if}}<p style="margin:0 0 24px;color:${colors.muted};font-family:${bodyFont};font-size:14px;">{{variant_title}} · {{formatCurrency current_price currency}}</p>${button("View the piece", "{{product_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_back_in_stock_v2",
    name: "Back in Stock",
    previewText: "The piece you were waiting for is back",
    subject: "Back in stock — {{product_title}}",
    textContent:
      "{{product_title}} has returned\n\nHello {{first_name}}, the piece you asked us to watch is available again.\n\n{{product_url}}",
    variables: [
      ...commonVariables,
      "currency",
      "current_price",
      "product_image_alt",
      "product_image_url",
      "product_title",
      "product_url",
      "variant_title",
    ],
  }),
  priceDrop: template({
    body: `${heading("Price update", "A piece you saved is now less", "Hello {{first_name}}, {{product_title}} is now available at a new price.")}{{#if product_image_url}}<a href="{{product_url}}"><img src="{{product_image_url}}" width="542" alt="{{product_image_alt}}" style="display:block;width:100%;height:auto;margin:32px 0 24px;border:0;" /></a>{{/if}}<p style="margin:0 0 26px;font-family:${bodyFont};font-size:15px;"><span style="color:${colors.sale};">{{formatCurrency current_price currency}}</span> <span style="margin-left:8px;color:${colors.muted};text-decoration:line-through;">{{formatCurrency old_price currency}}</span></p>${button("View the piece", "{{product_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_price_drop_v2",
    name: "Price Drop",
    previewText: "A piece you saved is now available at a new price",
    subject: "A new price for {{product_title}}",
    textContent:
      "A piece you saved is now less\n\n{{product_title}} is now {{formatCurrency current_price currency}} (was {{formatCurrency old_price currency}}).\n\n{{product_url}}",
    variables: [
      ...commonVariables,
      "currency",
      "current_price",
      "old_price",
      "product_image_alt",
      "product_image_url",
      "product_title",
      "product_url",
    ],
  }),
  cartPriceDrop: template({
    body: `${heading("A piece from your bag", "Now on sale", "Hello {{first_name}}, something you considered is now available at a lower price.")}{{#if product_image_url}}<a href="{{checkout_url}}"><img src="{{product_image_url}}" width="542" alt="{{product_image_alt}}" style="display:block;width:100%;height:auto;margin:32px 0 24px;border:0;" /></a>{{/if}}<p style="margin:0 0 8px;color:${colors.ink};font-family:${headingFont};font-size:13px;letter-spacing:1px;text-transform:uppercase;">{{product_title}}</p>{{#if variant_title}}<p style="margin:0 0 14px;color:${colors.muted};font-family:${bodyFont};font-size:13px;">{{variant_title}}</p>{{/if}}<p style="margin:0 0 26px;font-family:${bodyFont};font-size:15px;"><span style="color:${colors.sale};">{{formatCurrency current_price currency}}</span> <span style="margin-left:8px;color:${colors.muted};text-decoration:line-through;">{{formatCurrency old_price currency}}</span></p>${button("Return to your bag", "{{checkout_url}}")}`,
    category: "marketing",
    id: "tpl_eilish_cart_price_drop_v1",
    name: "Cart Item on Sale",
    previewText: "A piece from your bag is now on sale",
    subject: "A piece from your bag is now on sale",
    textContent:
      "A piece from your bag is now on sale\n\nHello {{first_name}}, {{product_title}} is now {{formatCurrency current_price currency}} (was {{formatCurrency old_price currency}}).\n\nReturn to your bag: {{checkout_url}}",
    variables: [
      ...commonVariables,
      "checkout_url",
      "currency",
      "current_price",
      "old_price",
      "product_image_alt",
      "product_image_url",
      "product_title",
      "product_url",
      "variant_title",
    ],
  }),
  postPurchaseThreeDays: template({
    body: `${heading("From the studio", "A little care goes a long way", "Hello {{first_name}}, now that order {{order_number}} has arrived, here are a few simple ways to help your pieces stay beautiful.")}<div style="margin:32px 0 24px;">${itemsWithoutPrices}</div><div style="margin:0 0 28px;padding:24px;background:${colors.canvas};"><p style="margin:0 0 12px;color:${colors.ink};font-family:${headingFont};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;">Care notes</p><p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:14px;line-height:1.75;">Follow the care label for the exact fibre and construction.<br />Air pieces between wears and wash only when needed.<br />Store them away from direct light, folded or supported in their natural shape.</p></div>${button("Read our care guide", "{{care_guide_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_post_purchase_3_days_v2",
    name: "Post-delivery Care",
    previewText: "Simple care notes for your pieces",
    subject: "A little care goes a long way",
    textContent:
      "A little care goes a long way\n\nHello {{first_name}}, now that order {{order_number}} has arrived, follow the care label, air pieces between wears, and store them away from direct light.\n\nRead our care guide: {{care_guide_url}}",
    variables: [...orderVariables, "care_guide_url"],
  }),
  postPurchaseSevenDays: template({
    body: `${heading("One week on", "How does it feel?", "Hello {{first_name}}, the best pieces come alive when they are worn. We would love to hear how your order is becoming part of your world.")}<div style="margin:32px 0 24px;">${itemsWithoutPrices}</div><p style="margin:0;color:${colors.ink};font-family:${bodyFont};font-size:15px;line-height:1.7;">Reply to this email to share a thought, a photograph, or anything our studio should know. We read every note.</p>${discountCard}${button("Discover something new", "{{store_url}}")}`,
    category: "marketing",
    id: "tpl_medusa_post_purchase_7_days_v2",
    name: "Post-delivery Feedback",
    previewText: "One week on, we would love to hear from you",
    subject: "How does it feel?",
    textContent:
      "How does it feel?\n\nHello {{first_name}}, we would love to hear how your order is becoming part of your world. Reply to this email to share your thoughts.\n\nAs a thank-you, use {{discount_code}} for {{discount_value}}% off before {{discount_expires}}.\n\n{{store_url}}",
    variables: [
      ...orderVariables,
      "discount_code",
      "discount_expires",
      "discount_value",
    ],
  }),
  referralInvitation: template({
    body: `${heading("A private invitation", "For someone you know", "Hello {{first_name}}, if someone comes to mind, you may share this private invitation with them. They will receive {{friend_discount_percentage}}% off their first order, and we will send the same thank-you to you once their order is complete.")}<div style="margin:32px 0;padding:26px;border:1px solid ${colors.ink};text-align:center;"><p style="margin:0 0 10px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Private code</p><p style="margin:0 0 10px;color:${colors.ink};font-family:${bodyFont};font-size:25px;letter-spacing:3px;">{{referral_code}}</p><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;line-height:1.6;">{{friend_discount_percentage}}% off orders of {{formatCurrency friend_minimum_purchase currency}} or more</p></div>${button("Share the invitation", "{{share_url}}")}`,
    category: "marketing",
    id: "tpl_eilish_referral_invitation_v1",
    name: "Private Referral Invitation",
    previewText: "A private invitation, if someone comes to mind",
    subject: "A private invitation from {{store_name}}",
    textContent:
      "For someone you know\n\nHello {{first_name}}, share code {{referral_code}} for {{friend_discount_percentage}}% off an order of {{formatCurrency friend_minimum_purchase currency}} or more. Once their order is complete, we will send the same thank-you to you.\n\n{{share_url}}",
    variables: [
      ...commonVariables,
      "advocate_discount_percentage",
      "currency",
      "friend_discount_percentage",
      "friend_minimum_purchase",
      "referral_code",
      "share_url",
    ],
  }),
  referralReward: template({
    body: `${heading("With our thanks", "A thank-you from {{store_name}}", "Hello {{first_name}}, someone you invited has placed an order. As promised, this private code is for you.")}<div style="margin:32px 0;padding:26px;border:1px solid ${colors.ink};text-align:center;"><p style="margin:0 0 10px;color:${colors.muted};font-family:${headingFont};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Your private code</p><p style="margin:0 0 10px;color:${colors.ink};font-family:${bodyFont};font-size:25px;letter-spacing:3px;">{{reward_code}}</p><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;line-height:1.6;">{{advocate_discount_percentage}}% off orders of {{formatCurrency minimum_purchase currency}} or more · valid until {{formatDate reward_expires_at}}</p></div>${button("Return to the collection", "{{reward_url}}")}`,
    category: "transactional",
    id: "tpl_eilish_referral_reward_v1",
    name: "Referral Thank-you",
    previewText: "A private thank-you from {{store_name}}",
    subject: "A thank-you from {{store_name}}",
    textContent:
      "A thank-you from {{store_name}}\n\nHello {{first_name}}, someone you invited has placed an order. Your private code is {{reward_code}} for {{advocate_discount_percentage}}% off an order of {{formatCurrency minimum_purchase currency}} or more. It is valid until {{formatDate reward_expires_at}}.\n\n{{reward_url}}",
    variables: [
      ...commonVariables,
      "advocate_discount_percentage",
      "currency",
      "minimum_purchase",
      "reward_code",
      "reward_expires_at",
      "reward_url",
    ],
  }),
  winBack: template({
    body: `${editorialImage}${heading("From the studio", "Come and see what is new", "Hello {{first_name}}, it has been a little while. Return to the studio to discover the latest considered pieces, colours, and stories.")}${discountCard}<div style="margin:30px 0;">${button("Explore the latest", "{{store_url}}")}</div><p style="margin:0;color:${colors.muted};font-family:${bodyFont};font-size:13px;">Your last order was placed {{formatDate last_order_date}}.</p>`,
    category: "marketing",
    id: "tpl_medusa_win_back_30_days_v2",
    name: "Win-back 30 Days",
    previewText: "Come and see what is new at {{store_name}}",
    subject: "A little has changed since your last visit",
    textContent:
      "Come and see what is new\n\nHello {{first_name}}, it has been a little while. Discover the latest from {{store_name}}.\n\nUse {{discount_code}} for {{discount_value}}% off before {{discount_expires}}.\n\n{{store_url}}",
    variables: [
      ...commonVariables,
      ...editorialVariables,
      "discount_code",
      "discount_expires",
      "discount_value",
      "last_order_date",
    ],
  }),
} as const;
