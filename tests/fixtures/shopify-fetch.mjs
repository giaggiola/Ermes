// Test-only preload. Never use with a live installation or real Shopify credentials.
if (new URL(process.env.DATABASE_URL).pathname !== "/ermes_shopify_browser")
  throw new Error(
    "Shopify fixture requires the isolated ermes_shopify_browser database",
  );
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://synthetic-ermes.myshopify.com/"))
    return realFetch(input, init);
  if (url.endsWith("access_token")) {
    const params = new URLSearchParams(init.body);
    if (
      params.get("client_secret") !== "synthetic-shopify-secret-never-connect"
    )
      return new Response("Synthetic invalid credentials", { status: 401 });
    return Response.json({
      access_token: "synthetic-browser-token",
      expires_in: 86400,
    });
  }
  const { query } = JSON.parse(init.body);
  let data;
  if (query.includes("ErmesStoreProfile"))
    data = {
      shop: {
        id: "gid://shopify/Shop/1",
        name: "Shopify fixture store",
        myshopifyDomain: "synthetic-ermes.myshopify.com",
        primaryDomain: { url: "https://storefront.example.test" },
        ianaTimezone: "Europe/Rome",
        contactEmail: "shopify-contact@example.com",
      },
      currentAppInstallation: {
        accessScopes: [
          "read_orders",
          "read_customers",
          "write_customers",
          "read_products",
          "read_inventory",
          "read_discounts",
          "write_discounts",
          "write_app_proxy",
        ].map((handle) => ({ handle })),
      },
    };
  else if (
    query.includes("ErmesSynccustomers") ||
    query.includes("ErmesSyncproducts") ||
    query.includes("ErmesSyncorders")
  ) {
    const kind = query.includes("Synccustomers")
      ? "customers"
      : query.includes("Syncproducts")
        ? "products"
        : "orders";
    data = {
      [kind]: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    };
  } else if (query.includes("ErmesRecoveryCheckouts"))
    data = {
      abandonedCheckouts: {
        nodes: [],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    };
  else if (query.includes("ErmesRecoveryCustomerEmail"))
    data = { customers: { nodes: [] } };
  else if (query.includes("ErmesCreateSubscriber"))
    data = {
      customerCreate: {
        customer: { id: "gid://shopify/Customer/99" },
        userErrors: [],
      },
    };
  else throw new Error("Unsupported synthetic Shopify query");
  return Response.json({ data });
};
