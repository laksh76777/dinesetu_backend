export const ROLES = {
  OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  KITCHEN: 'KITCHEN',
  WAITER: 'WAITER',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const KITCHEN_STATIONS = {
  MAIN_KITCHEN: 'Main Kitchen',
  GRILL: 'Grill',
  BEVERAGE: 'Beverage',
  DESSERT: 'Dessert',
} as const;

export type KitchenStation = typeof KITCHEN_STATIONS[keyof typeof KITCHEN_STATIONS];

export const ORDER_STATUSES = {
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVED: 'SERVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type OrderStatus = typeof ORDER_STATUSES[keyof typeof ORDER_STATUSES];

export const SESSION_STATUSES = {
  ACTIVE: 'ACTIVE',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  COMPLETED: 'COMPLETED',
} as const;

export type SessionStatus = typeof SESSION_STATUSES[keyof typeof SESSION_STATUSES];

export const TABLE_STATUSES = {
  AVAILABLE: 'AVAILABLE',
  ACTIVE: 'ACTIVE',
  ORDERING: 'ORDERING',
  OCCUPIED: 'OCCUPIED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  SERVING: 'SERVING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT: 'PAYMENT',
  RESERVED: 'RESERVED',
} as const;

export type TableStatus = typeof TABLE_STATUSES[keyof typeof TABLE_STATUSES];

export const STAFF_REQUEST_TYPES = {
  WATER: 'Water',
  CUTLERY: 'Cutlery',
  WAITER: 'Call Waiter',
  BILL: 'Request Bill',
  OTHER: 'Other',
} as const;

export type StaffRequestType = typeof STAFF_REQUEST_TYPES[keyof typeof STAFF_REQUEST_TYPES];

export const STAFF_REQUEST_STATUSES = {
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type StaffRequestStatus = typeof STAFF_REQUEST_STATUSES[keyof typeof STAFF_REQUEST_STATUSES];

export const FOOD_TYPES = {
  VEG: 'VEG',
  NON_VEG: 'NON_VEG',
  VEGAN: 'VEGAN',
  EGG: 'EGG',
} as const;

export type FoodType = typeof FOOD_TYPES[keyof typeof FOOD_TYPES];

export const PAYMENT_METHODS = {
  UPI: 'UPI',
  CARD: 'CARD',
  NET_BANKING: 'NET_BANKING',
} as const;

export type PaymentMethod = typeof PAYMENT_METHODS[keyof typeof PAYMENT_METHODS];

export const PAYMENT_STATUSES = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUSES[keyof typeof PAYMENT_STATUSES];
