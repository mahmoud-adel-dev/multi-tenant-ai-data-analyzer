/**
 * Generates the canonical nested-sales stress dataset (~68 MB at 100k rows).
 * Structure mirrors the platform's reference schema: customer/product/pricing/
 * payment/shipping/metrics groups with intentional nested gaps so leaf-level
 * profiling and evidence-based quality scoring can be verified end-to-end.
 *
 * Usage: node scripts/generate-stress-dataset.mjs [rows] [outfile]
 */
import { writeFileSync } from "node:fs";

const rows = Number(process.argv[2] ?? 100_000);
const outfile = process.argv[3] ?? "storage-data/stress-nested-100k.json";

const REGIONS = ["North", "South", "East", "West", "Central"];
const CITY_BY_REGION = {
  North: ["Alexandria", "Brno"],
  South: ["Aswan", "Naples"],
  East: ["Cairo", "Dubai"],
  West: ["Giza", "Lisbon"],
  Central: ["Cairo", "Prague"],
};
const SEGMENTS = ["Enterprise", "SMB", "Consumer"];
const CATEGORIES = ["Electronics", "Furniture", "Office Supplies"];
const PRODUCTS = {
  Electronics: ["Laptop Pro 14", "Monitor 27\"", "Wireless Keyboard", "Noise-Cancel Headset"],
  Furniture: ["Standing Desk", "Ergonomic Chair", "Filing Cabinet"],
  "Office Supplies": ["Pen Set", "Stapler Heavy-Duty", "Notebook A4 Pack"],
};
const PAYMENT_METHODS = ["card", "cash", "wallet", "bank_transfer"];
const PAYMENT_STATUS = ["completed", "completed", "completed", "completed", "pending", "cancelled", "returned"];
const CARRIERS = ["Aramex", "DHL", "LocalEx"];

let seed = 1337;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

const records = new Array(rows);
for (let i = 0; i < rows; i += 1) {
  // Spread orders evenly across 2025 for stable weekly buckets.
  const dayOfYear = Math.min(364, Math.floor((i / rows) * 365));
  const month = Math.floor(dayOfYear / 30.42);
  const day = 1 + Math.floor(rand() * 28);
  const dateStr = `2025-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const category = pick(Object.keys(PRODUCTS));
  const productName = pick(PRODUCTS[category]);
  const quantity = rand() < 0.03 ? 0 : 1 + Math.floor(rand() * 15); // suspicious zeros occasionally
  const unitPrice = Math.round((20 + rand() * 1200) * 100) / 100;
  const subtotal = Math.round(quantity * unitPrice * 100) / 100;
  const discountRate = rand() < 0.6 ? 0 : Math.round(rand() * 30) / 100;
  // Rare data-entry error: fraction stored as percent (drives out_of_range finding).
  const discountRateFinal = i % 997 === 0 ? 25 : discountRate;
  const discountAmount = Math.round(subtotal * discountRateFinal * 100) / 100;
  const taxRate = 0.14;
  const taxAmount = Math.round((subtotal - discountAmount) * taxRate * 100) / 100;
  // Intentional gap (~1.2%): pricing.total missing.
  const total = i % 83 === 0 ? null : Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;

  records[i] = {
    order_id: `ORD-${String(i).padStart(7, "0")}`,
    order_date: dateStr,
    sale_rep: `Rep ${["Nour Hassan", "Omar Ali", "Laila Adel", "Youssef Kamal"][i % 4]}`,
    channel: pick(["online", "retail", "partner"]),
    quantity,

    customer: {
      customer_id: `CUST-${Math.floor(rand() * 12_000)}`,
      // Intentional gap (~3%): segment missing inside nested object.
      segment: rand() < 0.03 ? null : SEGMENTS[Math.floor(rand() * SEGMENTS.length)],
      region: REGIONS[i % REGIONS.length],
      city: rand() < 0.02 ? null : pick(CITY_BY_REGION[REGIONS[i % REGIONS.length]]),
    },

    product: {
      product_id: `SKU-${Math.floor(rand() * 900)}`,
      name: productName,
      category,
      unit_price: unitPrice,
    },

    pricing: {
      subtotal,
      discount_rate: discountRateFinal,
      discount_amount: discountAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
    },

    payment: {
      method: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
      status: PAYMENT_STATUS[i % PAYMENT_STATUS.length],
    },

    shipping: {
      carrier: CARRIERS[i % CARRIERS.length],
      delivery_days: 1 + Math.floor(rand() * 9),
      shipping_cost: Math.round((8 + rand() * 55) * 100) / 100,
    },

    metrics: {
      // Intentional gap (~6%): margin missing where cost data absent.
      profit_margin: rand() < 0.06 ? null : Math.round((8 + rand() * 37) * 10) / 10,
      customer_score: 40 + Math.floor(rand() * 61),
    },
  };
}

writeFileSync(outfile, JSON.stringify(records));
console.log(`Wrote ${rows.toLocaleString()} nested records to ${outfile}`);
