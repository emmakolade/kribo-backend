import { env } from '../config/env';

export function calculateCommission(totalAmount: number): number {
  return Math.round(totalAmount * env.COMMISSION_RATE);
}

export function calculatePayout(totalAmount: number): number {
  return totalAmount - calculateCommission(totalAmount);
}
