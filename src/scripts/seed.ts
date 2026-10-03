import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/User.js';
import { Restaurant } from '../models/Restaurant.js';
import { Category } from '../models/Category.js';
import { MenuItem } from '../models/MenuItem.js';
import { Table } from '../models/Table.js';
import { TableSession } from '../models/TableSession.js';
import { SessionMember } from '../models/SessionMember.js';
import { KitchenStationModel } from '../models/KitchenStation.js';
import { DiningMoment } from '../models/DiningMoment.js';
import { Invoice } from '../models/Invoice.js';
import mongoose from 'mongoose';
import { ROLES, FOOD_TYPES, KITCHEN_STATIONS } from '../config/constants.js';
import { generateSecureToken, generateSessionNumber } from '../utils/tokens.js';
import { generateQrDataUrl } from '../utils/qr.js';
import { logger } from '../utils/logger.js';

export async function seedInitialUsers() {
  const initialStaff = [
    {
      name: 'Laksh Sharma',
      email: 'owner@dineflow.com',
      phone: '+91 98765 43210',
      role: ROLES.OWNER,
      active: true,
      passwordHash: 'dineflow123',
    },
    {
      name: 'Rohit Verma',
      email: 'manager@dineflow.com',
      phone: '+91 98765 43211',
      role: ROLES.MANAGER,
      active: true,
      passwordHash: 'dineflow123',
    },
    {
      name: 'Chef Vikram Singh',
      email: 'kitchen@dineflow.com',
      phone: '+91 98765 43212',
      role: ROLES.KITCHEN,
      station: 'Main Kitchen',
      active: true,
      passwordHash: 'dineflow123',
    },
    {
      name: 'Priya Patel',
      email: 'waiter@dineflow.com',
      phone: '+91 98765 43213',
      role: ROLES.WAITER,
      active: true,
      passwordHash: 'dineflow123',
    },
  ];

  for (const staff of initialStaff) {
    const existing = await User.findOne({ email: staff.email });
    if (!existing) {
      console.log(`[Bootstrap] Creating missing account: ${staff.email} (${staff.role})...`);
      await User.create(staff);
    } else {
      console.log(`[Bootstrap] Verified account: ${staff.email} (${staff.role})`);
    }
  }

  // Seed or update restaurant branding
  let restaurant = await Restaurant.findOne();
  if (!restaurant) {
    console.log('[Bootstrap] Initializing restaurant profile & branding (Rasrang)...');
    restaurant = await Restaurant.create({
      name: 'Rasrang',
      description:
        'Modern Indian Dining — Celebrating regional culinary heritage, crafted royal tandoors, slow-cooked curries, and modern presentation.',
      logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80',
      coverImage:
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=85',
      address: 'Plot 42, Galleria Boulevard, Sector 29, Gurugram, India',
      phone: '+91 98765 43210',
      email: 'namaste@rasrangdining.com',
      openingTime: '12:00 PM',
      closingTime: '11:30 PM',
      currency: '₹',
      taxConfiguration: {
        taxRate: 5,
        serviceChargeRate: 5,
        gstNumber: '07AAAAA0000A1Z5',
      },
      supportedLanguages: ['English', 'Hindi', 'French', 'Spanish'],
      themeConfiguration: {
        primaryColor: '#d97706',
        accentColor: '#b45309',
        fontHeading: 'Playfair Display',
        fontBody: 'Plus Jakarta Sans',
        mode: 'luxury',
      },
    });
    logger.info('✅ Restaurant profile initialized (Rasrang).');
  } else if (restaurant.name !== 'Rasrang') {
    restaurant.name = 'Rasrang';
    restaurant.description =
      'Modern Indian Dining — Celebrating regional culinary heritage, crafted royal tandoors, slow-cooked curries, and modern presentation.';
    restaurant.email = 'namaste@rasrangdining.com';
    await restaurant.save();
    logger.info('✅ Updated restaurant profile to Rasrang.');
  }

  // Seed Kitchen Stations if empty
  const stationCount = await KitchenStationModel.countDocuments();
  if (stationCount === 0) {
    logger.info('Initializing Kitchen Stations...');
    const defaultStations = [
      {
        name: KITCHEN_STATIONS.MAIN_KITCHEN,
        code: 'MAIN',
        description: 'Main culinary prep station for hot appetizers, curries, and breads.',
        color: '#f97316',
        displayOrder: 1,
        active: true,
      },
      {
        name: KITCHEN_STATIONS.GRILL,
        code: 'GRILL',
        description: 'Charcoal tandoor, skewers, kebab grills, and sizzling platters.',
        color: '#ef4444',
        displayOrder: 2,
        active: true,
      },
      {
        name: KITCHEN_STATIONS.BEVERAGE,
        code: 'BEV',
        description: 'Bar, artisanal mocktails, fresh pressed coolers, and hot brews.',
        color: '#3b82f6',
        displayOrder: 3,
        active: true,
      },
      {
        name: KITCHEN_STATIONS.DESSERT,
        code: 'DES',
        description: 'Pastry lab, cold craft kulfis, soufflés, and confectionery.',
        color: '#ec4899',
        displayOrder: 4,
        active: true,
      },
    ];
    for (const st of defaultStations) {
      await KitchenStationModel.findOneAndUpdate({ name: st.name }, st, { upsert: true, new: true });
    }
    logger.info('✅ Initialized 4 Kitchen Stations (Main Kitchen, Grill, Beverage, Dessert).');
  }

  // Seed menu categories & items if empty
  const categoryCount = await Category.countDocuments();
  if (categoryCount === 0) {
    logger.info('Seeding gourmet culinary categories and menu items...');

    const categoriesData = [
      {
        name: 'Small Plates & Appetizers',
        description: 'Crispy, smoky, and aromatic preludes designed for sharing.',
        image: 'https://images.unsplash.com/photo-1541014741259-de529411b96a?auto=format&fit=crop&w=600&q=80',
        sortOrder: 1,
        active: true,
      },
      {
        name: 'Clay Oven & Grills',
        description: 'Charred to perfection in traditional charcoal tandoors.',
        image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
        sortOrder: 2,
        active: true,
      },
      {
        name: 'Heritage Curries',
        description: 'Simmered slow in heavy copper degs with hand-pounded spices.',
        image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
        sortOrder: 3,
        active: true,
      },
      {
        name: 'Dum Biryanis & Breads',
        description: 'Aromatic aged long-grain basmati sealed in dough and freshly baked leavened flatbreads.',
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
        sortOrder: 4,
        active: true,
      },
      {
        name: 'Craft Beverages & Tonics',
        description: 'Artisanal botanicals, cold brews, and refreshing house sodas.',
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
        sortOrder: 5,
        active: true,
      },
      {
        name: 'Decadent Desserts',
        description: 'Modern interpretations of classic confectionary delicacies.',
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
        sortOrder: 6,
        active: true,
      },
    ];

    const createdCats: Record<string, any> = {};
    for (const c of categoriesData) {
      const saved = await Category.create(c);
      createdCats[c.name] = saved._id;
    }

    // Seed Menu Items
    const itemsData = [
      {
        name: 'Smoked Malai Paneer Tikka',
        description: 'Cottage cheese steeped in cardamom, hung curd, and roasted garlic, finished over glowing coals.',
        price: 380,
        categoryId: createdCats['Small Plates & Appetizers'],
        image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEG,
        spiceLevel: 1,
        allergens: ['Dairy'],
        ingredients: ['Paneer', 'Greek Yogurt', 'Cardamom', 'Cream'],
        preparationTime: 12,
        kitchenStationId: KITCHEN_STATIONS.GRILL,
        available: true,
        featured: true,
      },
      {
        name: 'Crispy Lotus Stem in Plum Glaze',
        description: 'Thinly sliced lotus root tossed in Kashmiri chili, crushed peanuts, and tangy dried plum reduction.',
        price: 340,
        categoryId: createdCats['Small Plates & Appetizers'],
        image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEGAN,
        spiceLevel: 2,
        allergens: ['Peanuts'],
        ingredients: ['Lotus Root', 'Plum Glaze', 'Sesame', 'Chili'],
        preparationTime: 10,
        kitchenStationId: KITCHEN_STATIONS.MAIN_KITCHEN,
        available: true,
        featured: false,
      },
      {
        name: 'Tandoori Bhatti Murgh',
        description: 'Charred half spring chicken macerated in yellow mustard oil, deghi mirch, and crushed coriander seeds.',
        price: 520,
        categoryId: createdCats['Clay Oven & Grills'],
        image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.NON_VEG,
        spiceLevel: 2,
        allergens: ['Dairy', 'Mustard'],
        ingredients: ['Spring Chicken', 'Mustard Oil', 'Degi Mirch', 'Ginger Garlic'],
        preparationTime: 18,
        kitchenStationId: KITCHEN_STATIONS.GRILL,
        available: true,
        featured: true,
      },
      {
        name: 'Dal Saffron & Sage (24-Hour Black Lentils)',
        description: 'Urad lentils slow-cooked overnight with vine-ripened tomatoes, churned white butter, and fenugreek leaves.',
        price: 420,
        categoryId: createdCats['Heritage Curries'],
        image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEG,
        spiceLevel: 1,
        allergens: ['Dairy'],
        ingredients: ['Black Lentils', 'Cultured Butter', 'Kasuri Methi', 'Plum Tomatoes'],
        preparationTime: 8,
        kitchenStationId: KITCHEN_STATIONS.MAIN_KITCHEN,
        available: true,
        featured: true,
      },
      {
        name: 'Kashmiri Rogan Josh',
        description: 'Tender baby goat shanks braised in ratan jot infused oil, fennel powder, and mawa broth.',
        price: 680,
        categoryId: createdCats['Heritage Curries'],
        image: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.NON_VEG,
        spiceLevel: 2,
        allergens: ['Dairy'],
        ingredients: ['Goat Meat', 'Ratanjot', 'Fennel', 'Dry Ginger'],
        preparationTime: 16,
        kitchenStationId: KITCHEN_STATIONS.MAIN_KITCHEN,
        available: true,
        featured: true,
      },
      {
        name: 'Awadhi Gosht Dum Biryani',
        description: 'Fragrant basmati rice steamed on dum with marinated mutton, saffron milk, kewra water, and caramelized onions.',
        price: 640,
        categoryId: createdCats['Dum Biryanis & Breads'],
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.NON_VEG,
        spiceLevel: 2,
        allergens: ['Dairy'],
        ingredients: ['Aged Basmati', 'Mutton', 'Saffron', 'Brown Onions'],
        preparationTime: 15,
        kitchenStationId: KITCHEN_STATIONS.MAIN_KITCHEN,
        available: true,
        featured: true,
      },
      {
        name: 'Truffle & Rosemary Butter Naan',
        description: 'Pillow-soft tandoor flatbread brushed with black truffle butter and fresh minced rosemary.',
        price: 160,
        categoryId: createdCats['Dum Biryanis & Breads'],
        image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEG,
        spiceLevel: 0,
        allergens: ['Gluten', 'Dairy'],
        ingredients: ['Refined Flour', 'Truffle Butter', 'Rosemary', 'Nigella Seeds'],
        preparationTime: 6,
        kitchenStationId: KITCHEN_STATIONS.GRILL,
        available: true,
        featured: false,
      },
      {
        name: 'Jamun & Mint Sparkler',
        description: 'Black plum extract, fresh garden mint, Himalayan black salt, and sparkling soda.',
        price: 220,
        categoryId: createdCats['Craft Beverages & Tonics'],
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEGAN,
        spiceLevel: 0,
        allergens: [],
        ingredients: ['Jamun Pulp', 'Mint', 'Kala Namak', 'Club Soda'],
        preparationTime: 4,
        kitchenStationId: KITCHEN_STATIONS.BEVERAGE,
        available: true,
        featured: false,
      },
      {
        name: 'Smoked Saffron Jalebi Caviar',
        description: 'Deconstructed crispy saffron spirals served over chilled pistachio rabri and edible gold leaf.',
        price: 290,
        categoryId: createdCats['Decadent Desserts'],
        image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=600&q=80',
        foodType: FOOD_TYPES.VEG,
        spiceLevel: 0,
        allergens: ['Dairy', 'Nuts', 'Gluten'],
        ingredients: ['Saffron', 'Reduced Milk (Rabri)', 'Pistachio', 'Cardamom'],
        preparationTime: 8,
        kitchenStationId: KITCHEN_STATIONS.DESSERT,
        available: true,
        featured: true,
      },
    ];

    for (const item of itemsData) {
      await MenuItem.create(item);
    }
    logger.info(`✅ Seeded ${categoriesData.length} categories and ${itemsData.length} culinary dishes.`);
  }

  // Seed default Dining Moment if empty
  const momentCount = await DiningMoment.countDocuments();
  if (momentCount === 0) {
    logger.info("Initializing Dining Moments (Tonight's Special)...");
    const specialDishes = await MenuItem.find({
      name: { $in: ['Awadhi Gosht Dum Biryani', 'Smoked Malai Paneer Tikka'] },
    });

    await DiningMoment.create({
      title: "🔥 TONIGHT'S SPECIAL",
      badge: "Tonight's Special",
      description: 'Rasrang Signature Dum Biryani & Charcoal Smoked Kebabs — Crafted with heirloom saffron and slow dum pukht. Available until 10 PM.',
      image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=80',
      menuItemIds: specialDishes.map((d) => d._id),
      active: true,
      displayOrder: 1,
    });
    logger.info('✅ Seeded default Dining Moment.');
  }

  // Seed restaurant floor tables and QR codes if empty
  const tableCount = await Table.countDocuments();
  if (tableCount === 0) {
    logger.info('Seeding restaurant tables with secure random QR tokens...');

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const tablesToSeed = [
      { tableNumber: 'T01', capacity: 2, status: 'AVAILABLE', section: 'Window Booth' },
      { tableNumber: 'T02', capacity: 4, status: 'AVAILABLE', section: 'Main Dining Hall' },
      { tableNumber: 'T03', capacity: 4, status: 'AVAILABLE', section: 'Main Dining Hall' },
      { tableNumber: 'T04', capacity: 6, status: 'AVAILABLE', section: 'Patio Terrace' },
      { tableNumber: 'T05', capacity: 2, status: 'AVAILABLE', section: 'Courtyard' },
      { tableNumber: 'T06', capacity: 8, status: 'AVAILABLE', section: 'Private Dining Suite' },
      { tableNumber: 'T07', capacity: 4, status: 'AVAILABLE', section: 'Main Dining Hall' },
    ];

    for (const t of tablesToSeed) {
      const token = t.tableNumber === 'T07' ? 'X7k92Lm' : generateSecureToken(8);
      const scanUrl = `${frontendUrl}/q/${token}`;
      const qrDataUrl = await generateQrDataUrl(scanUrl);

      await Table.create({
        tableNumber: t.tableNumber,
        capacity: t.capacity,
        status: 'AVAILABLE',
        section: t.section,
        active: true,
        activeSessionId: null,
        qrCode: {
          token,
          active: true,
          generatedAt: new Date(),
          qrDataUrl,
        },
      });
    }

    console.log(`[Bootstrap] Seeded ${tablesToSeed.length} restaurant tables.`);
  }

  // Purge any temporary audit tables
  await Table.deleteMany({ tableNumber: { $regex: /^AUDIT/i } });

  // Ensure ALL floor tables in DB are set to AVAILABLE with 0 active customer sessions
  await Table.updateMany(
    {},
    {
      $set: {
        status: 'AVAILABLE',
        activeSessionId: null,
        active: true,
        'qrCode.active': true,
      },
    }
  );
  await TableSession.updateMany(
    { status: { $ne: 'COMPLETED' } },
    {
      $set: {
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        endedAt: new Date(),
      },
    }
  );
  await SessionMember.updateMany({ active: true }, { $set: { active: false } });
  console.log('[Bootstrap] Initialized all floor tables to AVAILABLE (0 active customer sessions)');

  // Seed initial invoices for Owner Billing & Invoices if none exist
  const invoiceCount = await Invoice.countDocuments();
  if (invoiceCount === 0) {
    const pastInvoices = [
      {
        invoiceNumber: 'INV-2026-0841',
        restaurant: 'Rasrang',
        address: 'Aerocity Hospitality District, New Delhi',
        gstNumber: '07AAACR1234F1Z8',
        table: 'T02',
        session: new mongoose.Types.ObjectId(),
        items: [
          { name: 'Awadhi Gosht Dum Biryani', quantity: 2, price: 640, total: 1280, orderedBy: 'Aditya' },
          { name: 'Truffle & Rosemary Butter Naan', quantity: 3, price: 160, total: 480, orderedBy: 'Pooja' },
          { name: 'Jamun & Mint Sparkler', quantity: 2, price: 220, total: 440, orderedBy: 'Aditya' },
        ],
        quantities: 7,
        subtotal: 2200,
        tax: 110,
        taxRate: 5,
        serviceCharge: 110,
        serviceChargeRate: 5,
        total: 2420,
        paymentMethod: 'UPI',
        transactionId: 'UPI-TXN-984218',
        status: 'PAID',
        splitType: 'FULL',
        payerName: 'Aditya Sen',
        createdAt: new Date(Date.now() - 3600000 * 4),
        paidAt: new Date(Date.now() - 3600000 * 4 + 180000),
      },
      {
        invoiceNumber: 'INV-2026-0842',
        restaurant: 'Rasrang',
        address: 'Aerocity Hospitality District, New Delhi',
        gstNumber: '07AAACR1234F1Z8',
        table: 'T05',
        session: new mongoose.Types.ObjectId(),
        items: [
          { name: 'Smoked Malai Paneer Tikka', quantity: 1, price: 380, total: 380, orderedBy: 'Rohan' },
          { name: 'Dal Makhani 24-Hour Simmer', quantity: 1, price: 420, total: 420, orderedBy: 'Rohan' },
          { name: 'Truffle & Rosemary Butter Naan', quantity: 2, price: 160, total: 320, orderedBy: 'Rohan' },
        ],
        quantities: 4,
        subtotal: 1120,
        tax: 56,
        taxRate: 5,
        serviceCharge: 56,
        serviceChargeRate: 5,
        total: 1232,
        paymentMethod: 'CARD',
        transactionId: 'CARD-TXN-773412',
        status: 'PAID',
        splitType: 'FULL',
        payerName: 'Rohan Deshmukh',
        createdAt: new Date(Date.now() - 3600000 * 2),
        paidAt: new Date(Date.now() - 3600000 * 2 + 120000),
      },
      {
        invoiceNumber: 'INV-2026-0843',
        restaurant: 'Rasrang',
        address: 'Aerocity Hospitality District, New Delhi',
        gstNumber: '07AAACR1234F1Z8',
        table: 'T03',
        session: new mongoose.Types.ObjectId(),
        items: [
          { name: 'Crispy Lotus Stem with Kashmiri Honey', quantity: 2, price: 320, total: 640, orderedBy: 'Simran' },
          { name: 'Smoked Saffron Jalebi Caviar', quantity: 2, price: 280, total: 560, orderedBy: 'Kunal' },
        ],
        quantities: 4,
        subtotal: 1200,
        tax: 60,
        taxRate: 5,
        serviceCharge: 60,
        serviceChargeRate: 5,
        total: 1320,
        paymentMethod: 'CASH',
        transactionId: 'CASH-TXN-109283',
        status: 'PAID',
        splitType: 'FULL',
        payerName: 'Simran Khurana',
        createdAt: new Date(Date.now() - 3600000 * 1),
        paidAt: new Date(Date.now() - 3600000 * 1 + 90000),
      },
    ];

    await Invoice.insertMany(pastInvoices);
    console.log('[Bootstrap] Seeded 3 historical invoices for Owner Billing & Invoices.');
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  (async () => {
    try {
      await connectDatabase();
      await seedInitialUsers();
      await disconnectDatabase();
      process.exit(0);
    } catch (err: any) {
      logger.error('Seed script failed:', err.message);
      process.exit(1);
    }
  })();
}
