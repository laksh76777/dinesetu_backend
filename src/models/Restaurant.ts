import mongoose, { Schema, Document } from 'mongoose';

export interface ITaxConfiguration {
  taxRate: number; // e.g. 5% GST
  serviceChargeRate: number; // e.g. 5%
  gstNumber: string;
}

export interface IThemeConfiguration {
  primaryColor: string; // e.g. '#f97316'
  accentColor: string; // e.g. '#d97706'
  fontHeading: string; // e.g. 'Playfair Display'
  fontBody: string; // e.g. 'Plus Jakarta Sans'
  mode: 'dark' | 'light' | 'luxury';
}

export interface IRestaurant extends Document {
  name: string;
  description: string;
  logo: string;
  coverImage: string;
  address: string;
  phone: string;
  email: string;
  openingTime: string;
  closingTime: string;
  currency: string;
  taxConfiguration: ITaxConfiguration;
  supportedLanguages: string[];
  themeConfiguration: IThemeConfiguration;
  taxRate: number;
  serviceChargeRate: number;
  gstNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true, default: 'Rasrang' },
    description: {
      type: String,
      default:
        'Modern Indian Dining — Celebrating regional culinary heritage, crafted royal tandoors, slow-cooked curries, and modern presentation.',
    },
    logo: {
      type: String,
      default: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80',
    },
    coverImage: {
      type: String,
      default: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=85',
    },
    address: {
      type: String,
      default: 'Plot 42, Galleria Boulevard, Sector 29, Gurugram, India',
    },
    phone: { type: String, default: '+91 98765 43210' },
    email: { type: String, default: 'namaste@rasrangdining.com' },
    openingTime: { type: String, default: '12:00 PM' },
    closingTime: { type: String, default: '11:30 PM' },
    currency: { type: String, default: '₹' },
    taxConfiguration: {
      taxRate: { type: Number, default: 5 },
      serviceChargeRate: { type: Number, default: 5 },
      gstNumber: { type: String, default: '07AAAAA0000A1Z5' },
    },
    supportedLanguages: {
      type: [String],
      default: ['English', 'Hindi', 'French', 'Spanish'],
    },
    themeConfiguration: {
      primaryColor: { type: String, default: '#f97316' },
      accentColor: { type: String, default: '#d97706' },
      fontHeading: { type: String, default: 'Playfair Display' },
      fontBody: { type: String, default: 'Plus Jakarta Sans' },
      mode: { type: String, default: 'luxury' },
    },
  },
  { timestamps: true }
);

// Virtual getters for taxRate, serviceChargeRate, gstNumber
RestaurantSchema.virtual('taxRate').get(function (this: IRestaurant) {
  return this.taxConfiguration?.taxRate ?? 5;
});
RestaurantSchema.virtual('serviceChargeRate').get(function (this: IRestaurant) {
  return this.taxConfiguration?.serviceChargeRate ?? 5;
});
RestaurantSchema.virtual('gstNumber').get(function (this: IRestaurant) {
  return this.taxConfiguration?.gstNumber ?? '07AAAAA0000A1Z5';
});

export const Restaurant = mongoose.model<IRestaurant>('Restaurant', RestaurantSchema);
