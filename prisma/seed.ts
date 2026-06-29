/**
 * seed.ts — Full database seed for Amazon Clone
 *
 * USAGE:
 *   npx ts-node --project tsconfig.json prisma/seed.ts
 *   (or add to package.json: "prisma": { "seed": "ts-node prisma/seed.ts" })
 *   then run: npx prisma db seed
 *
 * WHAT THIS DOES:
 *   1. Preserves your existing admin + customer users (found by email)
 *   2. Deletes everything else in the correct FK order
 *   3. Seeds all tables with realistic Amazon-like data
 *
 * DEPENDENCY ORDER (must match FK constraints):
 *   Users → SellerProfiles → Brands → Categories → Products
 *   → ProductVariants → ProductImages → Warehouses → InventoryItems
 *   → Addresses → Carts → CartItems → Orders → OrderItems
 *   → PaymentAttempts → Shipments → Reviews → WishlistItems
 *   → Promotions → Coupons → ReturnRequests → Refunds
 *   → SellerLedgerEntries → SellerPayouts → ProductQuestions → ProductAnswers
 *   → FraudFlags → NotificationPreferences → TaxRules → OutboxEvents
 */

import * as bcrypt from "bcrypt";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// ─── helpers ─────────────────────────────────────────────────────────────────

const d = (n: number | string) => new Prisma.Decimal(n);
const future = (days: number) => new Date(Date.now() + days * 86_400_000);
const past = (days: number) => new Date(Date.now() - days * 86_400_000);
const hoursAfter = (base: Date, hours: number) => new Date(base.getTime() + hours * 3_600_000);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ─── CLEAR (preserve admin + customer) ───────────────────────────────────────

async function clearDatabase(keepUserIds: string[]) {
  console.log("🗑️  Clearing database (preserving existing users)...");

  // Delete in reverse FK dependency order
  await prisma.outboxEvent.deleteMany();
  await prisma.fraudFlag.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.productAnswer.deleteMany();
  await prisma.productQuestion.deleteMany();
  await prisma.sellerPayoutItem.deleteMany();
  await prisma.sellerPayout.deleteMany();
  await prisma.sellerLedgerEntry.deleteMany();
  await prisma.sellerBankAccount.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.returnItem.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.promotionProduct.deleteMany();
  await prisma.promotionVariant.deleteMany();
  await prisma.promotionCategory.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.wishlistItem.deleteMany(); // ← only once, duplicate removed
  await prisma.review.deleteMany();
  await prisma.shipmentItem.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.orderStatusEvent.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.taxRule.deleteMany();
  await prisma.sellerSlugHistory.deleteMany();
  await prisma.sellerStatusEvent.deleteMany();
  await prisma.sellerVerificationDocument.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.address.deleteMany();
  await prisma.customerProfile.deleteMany();

  // Delete all users EXCEPT the ones we're preserving
  await prisma.user.deleteMany({
    where: { id: { notIn: keepUserIds } },
  });

  console.log("✅ Database cleared.");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Starting seed...\n");

  // ── Find existing admin + customer to preserve ─────────────────────────────
  const existingAdmin = await prisma.user.findFirst({
    where: { roles: { has: "ADMIN" } },
  });
  const existingCustomer = await prisma.user.findFirst({
    where: { roles: { has: "CUSTOMER" }, NOT: { roles: { has: "ADMIN" } } },
  });

  const keepIds = [existingAdmin?.id, existingCustomer?.id].filter(Boolean) as string[];
  console.log(`🔒 Preserving ${keepIds.length} existing user(s): ${keepIds.join(", ")}`);

  await clearDatabase(keepIds);

  // ── 1. ADDITIONAL USERS (sellers + extra customers) ───────────────────────
  console.log("👤 Creating users...");

  const passwordHash = await bcrypt.hash("Password123!", 10);

  const sellers = await Promise.all([
    prisma.user.create({
      data: {
        email: "tech.seller@example.com",
        passwordHash,
        firstName: "Mohammed",
        lastName: "Al Rashid",
        phone: "+971501234567",
        status: "ACTIVE",
        roles: ["SELLER"],
        emailVerifiedAt: past(60),
      },
    }),
    prisma.user.create({
      data: {
        email: "fashion.seller@example.com",
        passwordHash,
        firstName: "Sara",
        lastName: "Hassan",
        phone: "+971502345678",
        status: "ACTIVE",
        roles: ["SELLER"],
        emailVerifiedAt: past(45),
      },
    }),
    prisma.user.create({
      data: {
        email: "home.seller@example.com",
        passwordHash,
        firstName: "James",
        lastName: "Wilson",
        phone: "+971503456789",
        status: "ACTIVE",
        roles: ["SELLER"],
        emailVerifiedAt: past(30),
      },
    }),
    prisma.user.create({
      data: {
        email: "sports.seller@example.com",
        passwordHash,
        firstName: "Aisha",
        lastName: "Khalid",
        phone: "+971504567890",
        status: "ACTIVE",
        roles: ["SELLER"],
        emailVerifiedAt: past(20),
      },
    }),
  ]);

  const extraCustomers = await Promise.all([
    prisma.user.create({
      data: {
        email: "customer2@example.com",
        passwordHash,
        firstName: "Ahmed",
        lastName: "Mansour",
        phone: "+971505678901",
        status: "ACTIVE",
        roles: ["CUSTOMER"],
        emailVerifiedAt: past(10),
      },
    }),
    prisma.user.create({
      data: {
        email: "customer3@example.com",
        passwordHash,
        firstName: "Lara",
        lastName: "Nasser",
        phone: "+971506789012",
        status: "ACTIVE",
        roles: ["CUSTOMER"],
        emailVerifiedAt: past(5),
      },
    }),
  ]);

  // ── 2. CUSTOMER PROFILES ───────────────────────────────────────────────────
  console.log("👤 Creating customer profiles...");

  // Create profile for existing customer if they don't have one
  if (existingCustomer) {
    await prisma.customerProfile.upsert({
      where: { userId: existingCustomer.id },
      create: { userId: existingCustomer.id, displayName: "Demo Customer" },
      update: {},
    });
  }

  for (const customer of extraCustomers) {
    await prisma.customerProfile.create({
      data: {
        userId: customer.id,
        displayName: `${customer.firstName} ${customer.lastName}`,
        birthDate: new Date("1990-06-15"),
      },
    });
  }

  // ── 3. SELLER PROFILES ─────────────────────────────────────────────────────
  console.log("🏪 Creating seller profiles...");

  const [techSeller, fashionSeller, homeSeller, sportsSeller] = await Promise.all([
    prisma.sellerProfile.create({
      data: {
        userId: sellers[0].id,
        storeName: "TechZone UAE",
        slug: "techzone-uae",
        legalName: "TechZone FZ LLC",
        taxId: "TRN100012345",
        supportEmail: "support@techzone-uae.com",
        description:
          "Your go-to destination for the latest electronics, gadgets, and accessories in the UAE. Authorised reseller for Apple, Samsung, and Sony.",
        shippingPolicy:
          "Free delivery on orders over AED 200. Same-day delivery available in Dubai.",
        returnPolicy: "30-day hassle-free returns. Original packaging required.",
        status: "ACTIVE",
        rating: d("4.80"),
        totalSales: 1240,
        fulfillmentScore: d("97.50"),
        cancellationRate: d("1.20"),
        reviewedAt: past(50),
      },
    }),
    prisma.sellerProfile.create({
      data: {
        userId: sellers[1].id,
        storeName: "Modista Fashion",
        slug: "modista-fashion",
        legalName: "Modista Trading LLC",
        taxId: "TRN100023456",
        supportEmail: "hello@modista.ae",
        description:
          "Contemporary fashion for the modern Arab woman. Abayas, modest wear, and international brands.",
        shippingPolicy: "Free delivery on orders over AED 150.",
        returnPolicy: "14-day returns on unworn items with tags attached.",
        status: "ACTIVE",
        rating: d("4.65"),
        totalSales: 875,
        fulfillmentScore: d("95.00"),
        cancellationRate: d("2.10"),
        reviewedAt: past(40),
      },
    }),
    prisma.sellerProfile.create({
      data: {
        userId: sellers[2].id,
        storeName: "HomeNest",
        slug: "homenest",
        legalName: "HomeNest Trading LLC",
        taxId: "TRN100034567",
        supportEmail: "care@homenest.ae",
        description:
          "Premium home furnishings, kitchen essentials, and décor for every taste and budget.",
        shippingPolicy: "Free delivery on orders over AED 300. Assembly available for furniture.",
        returnPolicy: "7-day returns for damaged or defective items.",
        status: "ACTIVE",
        rating: d("4.55"),
        totalSales: 620,
        fulfillmentScore: d("93.00"),
        cancellationRate: d("3.00"),
        reviewedAt: past(25),
      },
    }),
    prisma.sellerProfile.create({
      data: {
        userId: sellers[3].id,
        storeName: "SportPeak",
        slug: "sportpeak",
        legalName: "SportPeak FZ LLC",
        taxId: "TRN100045678",
        supportEmail: "info@sportpeak.ae",
        description:
          "Everything for your active lifestyle — gym equipment, sportswear, nutrition, and outdoor gear.",
        shippingPolicy: "Free delivery on orders over AED 250.",
        returnPolicy: "30-day returns on unused equipment.",
        status: "ACTIVE",
        rating: d("4.70"),
        totalSales: 430,
        fulfillmentScore: d("96.00"),
        cancellationRate: d("1.80"),
        reviewedAt: past(15),
      },
    }),
  ]);

  // ── 4. SELLER BANK ACCOUNTS ────────────────────────────────────────────────
  console.log("🏦 Creating seller bank accounts...");

  for (const seller of [techSeller, fashionSeller, homeSeller, sportsSeller]) {
    await prisma.sellerBankAccount.create({
      data: {
        sellerId: seller.id,
        status: "VERIFIED",
        holderName: seller.storeName,
        bankName: "Emirates NBD",
        country: "AE",
        currency: "USD",
        last4: "4242",
        isDefault: true,
      },
    });
  }

  // ── 5. ADDRESSES ───────────────────────────────────────────────────────────
  console.log("📍 Creating addresses...");

  const allCustomerUsers = [...(existingCustomer ? [existingCustomer] : []), ...extraCustomers];

  const customerAddresses: Record<
    string,
    {
      fullName: string;
      line1: string;
      city: string;
      country: string;
      postalCode: string;
    }
  > = {};

  for (const user of allCustomerUsers) {
    const addr = await prisma.address.create({
      data: {
        userId: user.id,
        type: "BOTH",
        fullName: `${user.firstName} ${user.lastName}`,
        line1: "Villa 12, Street 4A",
        line2: "Jumeirah 1",
        city: "Dubai",
        region: "Dubai",
        postalCode: "00000",
        country: "AE",
        phone: user.phone ?? "+971500000000",
        isDefault: true,
      },
    });
    customerAddresses[user.id] = addr;
  }

  // ── 6. BRANDS ──────────────────────────────────────────────────────────────
  console.log("🏷️  Creating brands...");

  const [apple, samsung, sony, nike, adidas, dyson, ikea] = await Promise.all([
    prisma.brand.create({
      data: {
        name: "Apple",
        slug: "apple",
        logoUrl: "https://placehold.co/200x80/000000/ffffff?text=Apple",
      },
    }),
    prisma.brand.create({
      data: {
        name: "Samsung",
        slug: "samsung",
        logoUrl: "https://placehold.co/200x80/1428a0/ffffff?text=Samsung",
      },
    }),
    prisma.brand.create({
      data: {
        name: "Sony",
        slug: "sony",
        logoUrl: "https://placehold.co/200x80/000000/ffffff?text=Sony",
      },
    }),
    prisma.brand.create({
      data: {
        name: "Nike",
        slug: "nike",
        logoUrl: "https://placehold.co/200x80/111111/ffffff?text=Nike",
      },
    }),
    prisma.brand.create({
      data: {
        name: "Adidas",
        slug: "adidas",
        logoUrl: "https://placehold.co/200x80/000000/ffffff?text=Adidas",
      },
    }),
    prisma.brand.create({
      data: {
        name: "Dyson",
        slug: "dyson",
        logoUrl: "https://placehold.co/200x80/c8102e/ffffff?text=Dyson",
      },
    }),
    prisma.brand.create({
      data: {
        name: "IKEA",
        slug: "ikea",
        logoUrl: "https://placehold.co/200x80/0058a3/ffffff?text=IKEA",
      },
    }),
  ]);

  // ── 7. CATEGORIES ──────────────────────────────────────────────────────────
  console.log("📂 Creating categories...");

  // Root categories
  const [electronics, fashion, homeKitchen, sports] = await Promise.all([
    prisma.category.create({ data: { name: "Electronics", slug: "electronics", isActive: true } }),
    prisma.category.create({ data: { name: "Fashion", slug: "fashion", isActive: true } }),
    prisma.category.create({
      data: { name: "Home & Kitchen", slug: "home-kitchen", isActive: true },
    }),
    prisma.category.create({ data: { name: "Sports", slug: "sports", isActive: true } }),
  ]);

  // Sub-categories
  const [phones, laptops, audio, womenFashion, menFashion, furniture, kitchen, gym, outdoor] =
    await Promise.all([
      prisma.category.create({
        data: {
          name: "Smartphones",
          slug: "smartphones",
          parentId: electronics.id,
          isActive: true,
        },
      }),
      prisma.category.create({
        data: { name: "Laptops", slug: "laptops", parentId: electronics.id, isActive: true },
      }),
      prisma.category.create({
        data: { name: "Audio", slug: "audio", parentId: electronics.id, isActive: true },
      }),
      prisma.category.create({
        data: {
          name: "Women's Fashion",
          slug: "womens-fashion",
          parentId: fashion.id,
          isActive: true,
        },
      }),
      prisma.category.create({
        data: { name: "Men's Fashion", slug: "mens-fashion", parentId: fashion.id, isActive: true },
      }),
      prisma.category.create({
        data: { name: "Furniture", slug: "furniture", parentId: homeKitchen.id, isActive: true },
      }),
      prisma.category.create({
        data: { name: "Kitchen", slug: "kitchen", parentId: homeKitchen.id, isActive: true },
      }),
      prisma.category.create({
        data: { name: "Gym Equipment", slug: "gym-equipment", parentId: sports.id, isActive: true },
      }),
      prisma.category.create({
        data: { name: "Outdoor", slug: "outdoor", parentId: sports.id, isActive: true },
      }),
    ]);

  // Suppress unused variable warnings for variables used implicitly via categoryIds
  void womenFashion;
  void gym;
  void outdoor;

  // ── 8. PRODUCTS + VARIANTS + IMAGES ───────────────────────────────────────
  console.log("📦 Creating products, variants, and images...");

  async function createProduct(data: {
    seller: typeof techSeller;
    brand: typeof apple;
    title: string;
    description: string;
    categoryIds: string[];
    variants: {
      sku: string;
      title: string;
      attributes: object;
      price: number;
      compareAtPrice?: number;
      weightGrams: number;
    }[];
    imageUrl: string;
  }) {
    const productSlug = slug(data.title);

    const product = await prisma.product.create({
      data: {
        sellerId: data.seller.id,
        brandId: data.brand.id,
        title: data.title,
        slug: productSlug,
        description: data.description,
        status: "ACTIVE",
        categories: {
          create: data.categoryIds.map((categoryId) => ({ categoryId })),
        },
      },
    });

    const createdVariants = await Promise.all(
      data.variants.map((v) =>
        prisma.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            title: v.title,
            attributes: v.attributes,
            price: d(v.price),
            compareAtPrice: v.compareAtPrice ? d(v.compareAtPrice) : undefined,
            currency: "USD",
            weightGrams: v.weightGrams,
            isActive: true,
          },
        }),
      ),
    );

    // Hero image (product-level)
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: data.imageUrl,
        objectKey: `products/${productSlug}/hero.jpg`,
        altText: data.title,
        sortOrder: 0,
      },
    });

    // Additional image
    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: data.imageUrl.replace("400x400", "400x400/f5f5f5/333333"),
        objectKey: `products/${productSlug}/detail.jpg`,
        altText: `${data.title} detail`,
        sortOrder: 1,
      },
    });

    return { product, variants: createdVariants };
  }

  // ── TECH products ──────────────────────────────────────────────────────────
  const { product: iphone16, variants: iphoneVariants } = await createProduct({
    seller: techSeller,
    brand: apple,
    title: "Apple iPhone 16 Pro",
    description:
      "The most powerful iPhone ever. Featuring the A18 Pro chip, a 48MP Fusion camera system, and the new Camera Control button. Available in four stunning titanium finishes.",
    categoryIds: [phones.id, electronics.id],
    imageUrl: "https://placehold.co/400x400/1c1c1e/ffffff?text=iPhone+16+Pro",
    variants: [
      {
        sku: "IPH16P-BLK-128",
        title: "Black Titanium / 128GB",
        attributes: { color: "Black Titanium", storage: "128GB" },
        price: 1099,
        compareAtPrice: 1199,
        weightGrams: 227,
      },
      {
        sku: "IPH16P-WHT-256",
        title: "White Titanium / 256GB",
        attributes: { color: "White Titanium", storage: "256GB" },
        price: 1249,
        compareAtPrice: 1299,
        weightGrams: 227,
      },
      {
        sku: "IPH16P-NAT-512",
        title: "Natural Titanium / 512GB",
        attributes: { color: "Natural Titanium", storage: "512GB" },
        price: 1449,
        weightGrams: 227,
      },
    ],
  });

  const { product: macbook, variants: macbookVariants } = await createProduct({
    seller: techSeller,
    brand: apple,
    title: 'Apple MacBook Air 15" M3',
    description:
      "Strikingly thin and impossibly fast. The MacBook Air 15-inch with M3 chip delivers up to 18 hours of battery life and a stunning Liquid Retina display.",
    categoryIds: [laptops.id, electronics.id],
    imageUrl: "https://placehold.co/400x400/e8e8e8/333333?text=MacBook+Air",
    variants: [
      {
        sku: "MBA15-M3-8-256",
        title: "8GB RAM / 256GB SSD",
        attributes: { ram: "8GB", storage: "256GB", color: "Midnight" },
        price: 1299,
        weightGrams: 1510,
      },
      {
        sku: "MBA15-M3-16-512",
        title: "16GB RAM / 512GB SSD",
        attributes: { ram: "16GB", storage: "512GB", color: "Silver" },
        price: 1699,
        weightGrams: 1510,
      },
    ],
  });

  const { product: sonyHeadphones, variants: sonyVariants } = await createProduct({
    seller: techSeller,
    brand: sony,
    title: "Sony WH-1000XM5 Wireless Headphones",
    description:
      "Industry-leading noise cancelling headphones with 30-hour battery life, crystal clear hands-free calling, and Alexa voice control. Foldable for portability.",
    categoryIds: [audio.id, electronics.id],
    imageUrl: "https://placehold.co/400x400/222222/ffffff?text=WH-1000XM5",
    variants: [
      {
        sku: "SONY-XM5-BLK",
        title: "Black",
        attributes: { color: "Black" },
        price: 349,
        compareAtPrice: 399,
        weightGrams: 250,
      },
      {
        sku: "SONY-XM5-SLV",
        title: "Silver",
        attributes: { color: "Silver" },
        price: 349,
        compareAtPrice: 399,
        weightGrams: 250,
      },
    ],
  });

  const { product: samsungTV, variants: samsungVariants } = await createProduct({
    seller: techSeller,
    brand: samsung,
    title: 'Samsung 65" QLED 4K Smart TV',
    description:
      "Quantum dot technology brings over a billion colors to life. The Neural Quantum Processor 4K intelligently upscales everything to 4K resolution.",
    categoryIds: [electronics.id],
    imageUrl: "https://placehold.co/400x400/0d1117/4cc9f0?text=Samsung+TV",
    variants: [
      {
        sku: "SAM-TV-55-QLED",
        title: "55 inch",
        attributes: { size: '55"' },
        price: 899,
        weightGrams: 22000,
      },
      {
        sku: "SAM-TV-65-QLED",
        title: "65 inch",
        attributes: { size: '65"' },
        price: 1299,
        weightGrams: 28000,
      },
    ],
  });

  // ── FASHION / SPORTS products ──────────────────────────────────────────────
  const { product: nikeShoes, variants: nikeVariants } = await createProduct({
    seller: sportsSeller,
    brand: nike,
    title: "Nike Air Max 270",
    description:
      "Nike's first lifestyle Air unit has been updated for the ultimate in comfort. Breathable mesh upper with foam midsole delivers premium cushioning all day long.",
    categoryIds: [menFashion.id, sports.id],
    imageUrl: "https://placehold.co/400x400/f5f5f5/111111?text=Air+Max+270",
    variants: [
      {
        sku: "NIKE-AM270-BLK-42",
        title: "Black / EU 42",
        attributes: { color: "Black", size: "EU 42" },
        price: 159,
        compareAtPrice: 179,
        weightGrams: 800,
      },
      {
        sku: "NIKE-AM270-BLK-43",
        title: "Black / EU 43",
        attributes: { color: "Black", size: "EU 43" },
        price: 159,
        compareAtPrice: 179,
        weightGrams: 800,
      },
      {
        sku: "NIKE-AM270-WHT-42",
        title: "White / EU 42",
        attributes: { color: "White", size: "EU 42" },
        price: 159,
        compareAtPrice: 179,
        weightGrams: 800,
      },
      {
        sku: "NIKE-AM270-WHT-43",
        title: "White / EU 43",
        attributes: { color: "White", size: "EU 43" },
        price: 159,
        compareAtPrice: 179,
        weightGrams: 800,
      },
    ],
  });

  const { product: adidasTracksuit, variants: adidasVariants } = await createProduct({
    seller: sportsSeller,
    brand: adidas,
    title: "Adidas Essentials 3-Stripes Tracksuit",
    description:
      "A classic tracksuit in soft French terry fabric. Regular fit with iconic 3-stripes down the sides. Perfect for the gym or casual wear.",
    categoryIds: [menFashion.id, sports.id],
    imageUrl: "https://placehold.co/400x400/000000/ffffff?text=Adidas+Tracksuit",
    variants: [
      {
        sku: "ADI-TRACK-BLK-S",
        title: "Black / S",
        attributes: { color: "Black", size: "S" },
        price: 89,
        weightGrams: 700,
      },
      {
        sku: "ADI-TRACK-BLK-M",
        title: "Black / M",
        attributes: { color: "Black", size: "M" },
        price: 89,
        weightGrams: 700,
      },
      {
        sku: "ADI-TRACK-NVY-L",
        title: "Navy / L",
        attributes: { color: "Navy", size: "L" },
        price: 89,
        weightGrams: 700,
      },
    ],
  });

  // ── HOME products ──────────────────────────────────────────────────────────
  const { product: dysonVacuum, variants: dysonVariants } = await createProduct({
    seller: homeSeller,
    brand: dyson,
    title: "Dyson V15 Detect Cordless Vacuum",
    description:
      "The most powerful cordless vacuum. Laser reveals invisible dust. Acoustic dust sensor counts and sizes particles. Up to 60 minutes of fade-free power.",
    categoryIds: [homeKitchen.id, kitchen.id],
    imageUrl: "https://placehold.co/400x400/c8102e/ffffff?text=Dyson+V15",
    variants: [
      {
        sku: "DYSON-V15-DETECT",
        title: "Nickel / Yellow",
        attributes: { color: "Nickel/Yellow" },
        price: 749,
        compareAtPrice: 849,
        weightGrams: 3100,
      },
    ],
  });

  const { product: ikeaDesk, variants: ikeaDeskVariants } = await createProduct({
    seller: homeSeller,
    brand: ikea,
    title: "IKEA BEKANT Sit/Stand Desk",
    description:
      "Adjustable height desk for sitting and standing positions. Electric height adjustment from 65 to 125cm. Spacious 160x80cm tabletop.",
    categoryIds: [furniture.id, homeKitchen.id],
    imageUrl: "https://placehold.co/400x400/0058a3/ffffff?text=BEKANT+Desk",
    variants: [
      {
        sku: "IKEA-BEKANT-WHT",
        title: "White",
        attributes: { color: "White", size: "160x80cm" },
        price: 649,
        weightGrams: 50000,
      },
      {
        sku: "IKEA-BEKANT-OAK",
        title: "Oak",
        attributes: { color: "Oak", size: "160x80cm" },
        price: 699,
        weightGrams: 50000,
      },
    ],
  });

  // Suppress unused variable warnings
  void ikeaDesk;
  void adidasTracksuit;
  void samsungTV;
  void fashionSeller;

  const allVariantSets = [
    iphoneVariants,
    macbookVariants,
    sonyVariants,
    samsungVariants,
    nikeVariants,
    adidasVariants,
    dysonVariants,
    ikeaDeskVariants,
  ];

  // ── 9. WAREHOUSES + INVENTORY ──────────────────────────────────────────────
  console.log("🏭 Creating warehouses and inventory...");

  const [dubaiWarehouse, abuDhabiWarehouse] = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "Dubai Fulfilment Centre",
        code: "DXB-01",
        country: "AE",
        region: "Dubai",
        city: "Dubai",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Abu Dhabi Warehouse",
        code: "AUH-01",
        country: "AE",
        region: "Abu Dhabi",
        city: "Abu Dhabi",
      },
    }),
  ]);

  // Suppress unused variable warning — abuDhabiWarehouse used in loop below
  void abuDhabiWarehouse;

  for (const variants of allVariantSets) {
    for (const variant of variants) {
      await prisma.inventoryItem.create({
        data: {
          variantId: variant.id,
          warehouseId: dubaiWarehouse.id,
          quantity: Math.floor(Math.random() * 150) + 50,
          reserved: 0,
          reorderPoint: 10,
        },
      });
      if (Math.random() > 0.5) {
        await prisma.inventoryItem.create({
          data: {
            variantId: variant.id,
            warehouseId: abuDhabiWarehouse.id,
            quantity: Math.floor(Math.random() * 50) + 10,
            reserved: 0,
            reorderPoint: 5,
          },
        });
      }
    }
  }

  // ── 10. REVIEWS ───────────────────────────────────────────────────────────
  console.log("⭐ Creating reviews...");

  const reviewData = [
    {
      product: iphone16,
      user: allCustomerUsers[0],
      rating: 5,
      title: "Absolutely love it!",
      body: "The camera is incredible — the 48MP photos are stunning. Battery life is much better than my old iPhone. The titanium finish feels premium. Worth every dirham.",
    },
    {
      product: iphone16,
      user: allCustomerUsers[1] ?? allCustomerUsers[0],
      rating: 4,
      title: "Great phone, pricey",
      body: "Performance is blazing fast and the display is gorgeous. Only complaint is the price, but you do get what you pay for with Apple.",
    },
    {
      product: sonyHeadphones,
      user: allCustomerUsers[0],
      rating: 5,
      title: "Best headphones I have owned",
      body: "The noise cancellation is on another level. I use these on flights and can barely hear anything. Sound quality is crystal clear. 10/10.",
    },
    {
      product: macbook,
      user: allCustomerUsers[1] ?? allCustomerUsers[0],
      rating: 5,
      title: "Perfect for work",
      body: "Replaced my old Windows laptop and never looked back. The M3 chip handles everything I throw at it — video editing, Xcode, web browsing — all while barely getting warm.",
    },
    {
      product: nikeShoes,
      user: allCustomerUsers[0],
      rating: 4,
      title: "Comfortable but runs large",
      body: "Really comfortable for all-day wear. The Air unit cushioning is great. Go half a size down — they run a bit large.",
    },
    {
      product: dysonVacuum,
      user: allCustomerUsers[1] ?? allCustomerUsers[0],
      rating: 5,
      title: "Game changer for cleaning",
      body: "The laser dust detection is not a gimmick — it actually shows you dust you would otherwise miss. Powerful suction and the battery lasts long enough for my whole apartment.",
    },
  ];

  for (const r of reviewData) {
    await prisma.review.create({
      data: {
        productId: r.product.id,
        userId: r.user.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerifiedPurchase: true,
        isVisible: true,
      },
    });
  }

  // ── 11. PRODUCT Q&A ───────────────────────────────────────────────────────
  console.log("❓ Creating product Q&A...");

  const q1 = await prisma.productQuestion.create({
    data: {
      productId: iphone16.id,
      userId: allCustomerUsers[0].id,
      body: "Does this phone support 5G on Etisalat and Du networks in the UAE?",
      isVisible: true,
    },
  });

  await prisma.productAnswer.create({
    data: {
      questionId: q1.id,
      userId: sellers[0].id,
      sellerId: techSeller.id,
      body: "Yes! The iPhone 16 Pro supports 5G on both Etisalat and Du networks in the UAE. It comes with a UAE-specific model (A3293) that supports all local bands.",
      isAccepted: true,
      isVisible: true,
    },
  });

  const q2 = await prisma.productQuestion.create({
    data: {
      productId: sonyHeadphones.id,
      userId: allCustomerUsers[1]?.id ?? allCustomerUsers[0].id,
      body: "Can I connect to two devices simultaneously — my phone and laptop at the same time?",
      isVisible: true,
    },
  });

  await prisma.productAnswer.create({
    data: {
      questionId: q2.id,
      userId: sellers[0].id,
      sellerId: techSeller.id,
      body: "Yes, the WH-1000XM5 supports Multipoint Connection which lets you connect to two Bluetooth devices at once. You can seamlessly switch audio between your phone and laptop.",
      isAccepted: true,
      isVisible: true,
    },
  });

  // ── 12. ORDERS (delivered, with payment + shipment) ───────────────────────
  console.log("📋 Creating orders...");

  async function createDeliveredOrder(
    userId: string,
    variant: (typeof iphoneVariants)[0],
    seller: typeof techSeller,
    quantity: number,
    daysAgo: number,
  ) {
    const placedAt = past(daysAgo);
    const unitPrice = variant.price;
    const subtotal = unitPrice.mul(quantity);
    const shipping = d(0);
    const tax = subtotal.mul(d("0.05")).toDecimalPlaces(2);
    const commission = subtotal.mul(d("0.08")).toDecimalPlaces(2);
    const sellerPayout = subtotal.minus(commission);
    const total = subtotal.plus(shipping).plus(tax);
    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    const addr = customerAddresses[userId];

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId,
        status: "DELIVERED",
        currency: "USD",
        subtotalAmount: subtotal,
        shippingAmount: shipping,
        taxAmount: tax,
        discountAmount: d(0),
        totalAmount: total,
        shippingAddress: {
          fullName: addr?.fullName ?? "Customer",
          line1: addr?.line1 ?? "Villa 12",
          city: addr?.city ?? "Dubai",
          country: addr?.country ?? "AE",
          postalCode: addr?.postalCode ?? "00000",
        },
        placedAt,
      },
    });

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        variantId: variant.id,
        sellerId: seller.id,
        skuSnapshot: variant.sku,
        titleSnapshot: variant.title,
        unitPrice,
        quantity,
        taxAmount: tax,
        discountAmount: d(0),
        commissionAmount: commission,
        sellerPayoutAmount: sellerPayout,
        totalAmount: subtotal.plus(tax),
      },
    });

    // Status events — realistic timestamps
    await prisma.orderStatusEvent.createMany({
      data: [
        {
          orderId: order.id,
          toStatus: "PENDING_PAYMENT",
          fromStatus: null,
          createdAt: placedAt,
          note: "Order placed.",
        },
        {
          orderId: order.id,
          toStatus: "PAID",
          fromStatus: "PENDING_PAYMENT",
          createdAt: hoursAfter(placedAt, 0.5),
          note: "Payment captured.",
        },
        {
          orderId: order.id,
          toStatus: "PROCESSING",
          fromStatus: "PAID",
          createdAt: hoursAfter(placedAt, 2),
          note: "Order being prepared.",
        },
        {
          orderId: order.id,
          toStatus: "SHIPPED",
          fromStatus: "PROCESSING",
          createdAt: new Date(past(daysAgo - 2).getTime()),
          note: "Dispatched via Aramex.",
        },
        {
          orderId: order.id,
          toStatus: "DELIVERED",
          fromStatus: "SHIPPED",
          createdAt: new Date(past(daysAgo - 3).getTime()),
          note: "Delivered to customer.",
        },
      ],
    });

    // Payment attempt
    await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "stripe",
        providerPaymentId: `pi_seed_${orderNumber}`,
        idempotencyKey: `idem_${orderNumber}`,
        status: "CAPTURED",
        amount: total,
        currency: "USD",
        authorizedAt: placedAt,
        capturedAt: hoursAfter(placedAt, 0.5),
      },
    });

    // Shipment
    const shipment = await prisma.shipment.create({
      data: {
        orderId: order.id,
        carrier: "Aramex",
        trackingNumber: `ARMX${Math.floor(Math.random() * 999999999)}`,
        status: "DELIVERED",
        shippedAt: past(daysAgo - 2),
        deliveredAt: past(daysAgo - 3),
      },
    });

    await prisma.shipmentItem.create({
      data: { shipmentId: shipment.id, orderItemId: orderItem.id, quantity },
    });

    // Consumed inventory reservation
    await prisma.inventoryReservation.create({
      data: {
        variantId: variant.id,
        warehouseId: dubaiWarehouse.id,
        orderItemId: orderItem.id,
        quantity,
        status: "CONSUMED",
        expiresAt: past(daysAgo - 1),
      },
    });

    // Seller ledger entries — available after 14-day return window
    await prisma.sellerLedgerEntry.createMany({
      data: [
        {
          sellerId: seller.id,
          orderItemId: orderItem.id,
          type: "ORDER_ITEM_SALE",
          amount: sellerPayout,
          currency: "USD",
          description: `Sale: ${variant.title} x${quantity}`,
          availableAt: past(daysAgo - 14),
        },
        {
          sellerId: seller.id,
          orderItemId: orderItem.id,
          type: "COMMISSION",
          amount: commission.negated(),
          currency: "USD",
          description: `Platform commission (8%) for order ${orderNumber}`,
          availableAt: past(daysAgo - 14),
        },
      ],
    });

    return { order, orderItem };
  }

  const customer1 = allCustomerUsers[0];
  const customer2 = allCustomerUsers[1] ?? allCustomerUsers[0];

  await createDeliveredOrder(customer1.id, iphoneVariants[0], techSeller, 1, 20);
  await createDeliveredOrder(customer1.id, sonyVariants[0], techSeller, 1, 35);
  await createDeliveredOrder(customer2.id, macbookVariants[0], techSeller, 1, 15);
  await createDeliveredOrder(customer2.id, nikeVariants[0], sportsSeller, 2, 10);

  // ── One PAID (pending fulfilment) order ────────────────────────────────────
  const pendingOrderNumber = `ORD-${Date.now()}-PENDING`;
  const pendingVariant = iphoneVariants[1];
  const pendingPlacedAt = past(1);
  const pendingSubtotal = pendingVariant.price;
  const pendingTax = pendingSubtotal.mul(d("0.05")).toDecimalPlaces(2);
  const pendingTotal = pendingSubtotal.plus(pendingTax);
  const pendingAddr = customerAddresses[customer1.id];
  const pendingCommission = pendingSubtotal.mul(d("0.08")).toDecimalPlaces(2);
  const pendingPayout = pendingSubtotal.minus(pendingCommission);

  const pendingOrder = await prisma.order.create({
    data: {
      orderNumber: pendingOrderNumber,
      userId: customer1.id,
      status: "PAID",
      currency: "USD",
      subtotalAmount: pendingSubtotal,
      shippingAmount: d(0),
      taxAmount: pendingTax,
      discountAmount: d(0),
      totalAmount: pendingTotal,
      shippingAddress: {
        fullName: pendingAddr?.fullName ?? "Customer",
        line1: pendingAddr?.line1 ?? "Villa 12",
        city: pendingAddr?.city ?? "Dubai",
        country: pendingAddr?.country ?? "AE",
        postalCode: pendingAddr?.postalCode ?? "00000",
      },
      placedAt: pendingPlacedAt,
    },
  });

  // ── FIX: create OrderItem for the pending order ────────────────────────────
  const pendingOrderItem = await prisma.orderItem.create({
    data: {
      orderId: pendingOrder.id,
      variantId: pendingVariant.id,
      sellerId: techSeller.id,
      skuSnapshot: pendingVariant.sku,
      titleSnapshot: pendingVariant.title,
      unitPrice: pendingVariant.price,
      quantity: 1,
      taxAmount: pendingTax,
      discountAmount: d(0),
      commissionAmount: pendingCommission,
      sellerPayoutAmount: pendingPayout,
      totalAmount: pendingSubtotal.plus(pendingTax),
    },
  });

  await prisma.orderStatusEvent.createMany({
    data: [
      {
        orderId: pendingOrder.id,
        toStatus: "PENDING_PAYMENT",
        fromStatus: null,
        createdAt: pendingPlacedAt,
        note: "Order placed.",
      },
      {
        orderId: pendingOrder.id,
        toStatus: "PAID",
        fromStatus: "PENDING_PAYMENT",
        createdAt: hoursAfter(pendingPlacedAt, 0.5),
        note: "Payment captured via Stripe.",
      },
    ],
  });

  await prisma.paymentAttempt.create({
    data: {
      orderId: pendingOrder.id,
      provider: "stripe",
      providerPaymentId: `pi_seed_${pendingOrderNumber}`,
      idempotencyKey: `idem_${pendingOrderNumber}`,
      status: "CAPTURED",
      amount: pendingTotal,
      currency: "USD",
      authorizedAt: pendingPlacedAt,
      capturedAt: hoursAfter(pendingPlacedAt, 0.5),
    },
  });

  // Suppress unused variable warning
  void pendingOrderItem;

  // ── 13. WISHLIST ──────────────────────────────────────────────────────────
  console.log("❤️  Creating wishlists...");

  await prisma.wishlistItem.createMany({
    data: [
      { userId: customer1.id, variantId: macbookVariants[0].id },
      { userId: customer1.id, variantId: dysonVariants[0].id },
      { userId: customer2.id, variantId: iphoneVariants[2].id },
      { userId: customer2.id, variantId: samsungVariants[1].id },
    ],
    skipDuplicates: true,
  });

  // ── 14. PROMOTIONS + COUPONS ──────────────────────────────────────────────
  console.log("🏷️  Creating promotions and coupons...");

  const techPromo = await prisma.promotion.create({
    data: {
      sellerId: techSeller.id,
      name: "Summer Tech Sale — 10% Off",
      description: "Save 10% on all TechZone products this summer.",
      type: "PERCENTAGE_OFF",
      status: "ACTIVE",
      discountPercent: d("10.00"),
      currency: "USD",
      minOrderAmount: d("200.00"),
      startsAt: past(7),
      endsAt: future(30),
      usageLimit: 500,
      usageLimitPerUser: 1,
    },
  });

  await prisma.coupon.create({
    data: {
      promotionId: techPromo.id,
      code: "SUMMER10",
      status: "ACTIVE",
      usageLimit: 500,
      usageLimitPerUser: 1,
    },
  });

  const sportsPromo = await prisma.promotion.create({
    data: {
      sellerId: sportsSeller.id,
      name: "Free Shipping on Sports Gear",
      description: "Free delivery on all SportPeak orders this month.",
      type: "FREE_SHIPPING",
      status: "ACTIVE",
      currency: "USD",
      startsAt: past(3),
      endsAt: future(14),
    },
  });

  await prisma.coupon.create({
    data: {
      promotionId: sportsPromo.id,
      code: "FREESHIP",
      status: "ACTIVE",
    },
  });

  // Suppress unused variable warning
  void sportsPromo;

  // ── 15. SELLER PAYOUT ─────────────────────────────────────────────────────
  console.log("💰 Creating seller payouts...");

  const techBankAccount = await prisma.sellerBankAccount.findFirst({
    where: { sellerId: techSeller.id },
  });

  if (techBankAccount) {
    const payoutAmount = d("850.00");

    const payout = await prisma.sellerPayout.create({
      data: {
        sellerId: techSeller.id,
        bankAccountId: techBankAccount.id,
        status: "PAID",
        amount: payoutAmount,
        currency: "USD",
        provider: "stripe_connect",
        providerPayoutId: "po_seed_techzone_001",
        paidAt: past(5),
      },
    });

    const payoutLedger = await prisma.sellerLedgerEntry.create({
      data: {
        sellerId: techSeller.id,
        type: "PAYOUT",
        amount: payoutAmount.negated(),
        currency: "USD",
        description: `Payout ${payout.id}`,
        availableAt: null,
      },
    });

    await prisma.sellerPayoutItem.create({
      data: {
        payoutId: payout.id,
        ledgerEntryId: payoutLedger.id,
        amount: payoutAmount,
      },
    });
  }

  // ── 16. TAX RULES ─────────────────────────────────────────────────────────
  console.log("📜 Creating tax rules...");

  await prisma.taxRule.createMany({
    data: [
      // Specific category rules (higher priority — lower number wins)
      {
        country: "AE",
        name: "UAE VAT — Electronics",
        rate: d("0.0500"),
        priority: 10,
        status: "ACTIVE",
        startsAt: new Date("2018-01-01"),
        categoryId: electronics.id,
      },
      {
        country: "AE",
        name: "UAE VAT — Fashion",
        rate: d("0.0500"),
        priority: 10,
        status: "ACTIVE",
        startsAt: new Date("2018-01-01"),
        categoryId: fashion.id,
      },
      // General catch-all rule (lower priority — higher number)
      {
        country: "AE",
        name: "UAE VAT — General",
        rate: d("0.0500"),
        priority: 100,
        status: "ACTIVE",
        startsAt: new Date("2018-01-01"),
      },
    ],
  });

  // ── 17. NOTIFICATION PREFERENCES ─────────────────────────────────────────
  console.log("🔔 Creating notification preferences...");

  for (const user of allCustomerUsers) {
    await prisma.notificationPreference.createMany({
      data: [
        // FIX: replaced non-existent 'promotion.new' with real event types
        { userId: user.id, channel: "EMAIL", eventType: "order.placed", enabled: true },
        { userId: user.id, channel: "EMAIL", eventType: "order.shipped", enabled: true },
        { userId: user.id, channel: "EMAIL", eventType: "order.delivered", enabled: true },
        { userId: user.id, channel: "EMAIL", eventType: "order.cancelled", enabled: true },
        { userId: user.id, channel: "PUSH", eventType: "order.shipped", enabled: true },
        { userId: user.id, channel: "EMAIL", eventType: "refund.succeeded", enabled: true },
      ],
      skipDuplicates: true,
    });
  }

  // ── 18. FRAUD FLAGS ───────────────────────────────────────────────────────
  console.log("🚩 Creating fraud flags (demo)...");

  if (existingAdmin) {
    await prisma.fraudFlag.create({
      data: {
        userId: customer2.id,
        severity: "LOW",
        status: "DISMISSED",
        reason: "Multiple failed payment attempts detected from the same IP address.",
        createdByUserId: existingAdmin.id,
        resolvedByUserId: existingAdmin.id,
        resolvedAt: past(2),
        metadata: { ipAddress: "185.55.12.34", attempts: 3 },
      },
    });
  }

  // ── 19. OUTBOX EVENTS ─────────────────────────────────────────────────────
  console.log("📤 Creating outbox events...");

  await prisma.outboxEvent.createMany({
    data: [
      {
        eventType: "order.delivered",
        aggregateId: pendingOrder.id,
        aggregateType: "Order",
        payload: { orderId: pendingOrder.id, userId: customer1.id },
        status: "PROCESSED",
        attempts: 1,
        availableAt: past(1),
        processedAt: past(1),
      },
      {
        eventType: "order.placed",
        aggregateId: pendingOrder.id,
        aggregateType: "Order",
        payload: { orderId: pendingOrder.id, userId: customer1.id },
        status: "PROCESSED",
        attempts: 1,
        availableAt: past(1),
        processedAt: past(1),
      },
    ],
  });

  // ── DONE ──────────────────────────────────────────────────────────────────
  const totalVariants = allVariantSets.flat().length;

  console.log("\n✅ Seed complete! Summary:");
  console.log(
    `   Users:            ${4 + allCustomerUsers.length} total (${keepIds.length} preserved)`,
  );
  console.log(`   Seller profiles:  4`);
  console.log(`   Brands:           7`);
  console.log(`   Categories:       13 (4 root + 9 sub)`);
  console.log(`   Products:         8 (all ACTIVE)`);
  console.log(`   Variants:         ${totalVariants}`);
  console.log(`   Warehouses:       2`);
  console.log(`   Orders:           5 (4 delivered + 1 paid/pending fulfilment)`);
  console.log(`   Reviews:          6`);
  console.log(`   Promotions:       2`);
  console.log(`   Coupons:          SUMMER10, FREESHIP`);
  console.log(`   Tax rules:        3 (UAE VAT)`);
  console.log(`\n🔑 Test credentials (all use Password123!):`);
  console.log(`   Tech Seller:  tech.seller@example.com`);
  console.log(`   Customer:     customer2@example.com`);
  console.log(`   Customer:     customer3@example.com`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
