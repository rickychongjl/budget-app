import {
  Baby, Banknote, Bike, BookOpen, Briefcase, Bus, Car, Cat, Coffee, CreditCard, Dog, Dumbbell, Film, Fuel, Gamepad2, Gift,
  GraduationCap, HandCoins, Heart, House, Landmark, Music, PiggyBank, Pill, Plane, Receipt, Shirt, ShoppingBag, ShoppingCart,
  Smartphone, Sparkles, Stethoscope, Tag, TrainFront, TrendingUp, Tv, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from 'lucide-react'

// A category's Icon is stored as its Lucide name ("utensils"). Imported one by one so the bundle carries these and not
// all 1,500: the picker (M6 slice 11) offers exactly this list, so the two cannot drift apart.
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  baby: Baby, banknote: Banknote, bike: Bike, 'book-open': BookOpen, briefcase: Briefcase, bus: Bus, car: Car, cat: Cat,
  coffee: Coffee, 'credit-card': CreditCard, dog: Dog, dumbbell: Dumbbell, film: Film, fuel: Fuel, 'gamepad-2': Gamepad2,
  gift: Gift, 'graduation-cap': GraduationCap, 'hand-coins': HandCoins, heart: Heart, house: House, landmark: Landmark,
  music: Music, 'piggy-bank': PiggyBank, pill: Pill, plane: Plane, receipt: Receipt, shirt: Shirt, 'shopping-bag': ShoppingBag,
  'shopping-cart': ShoppingCart, smartphone: Smartphone, sparkles: Sparkles, stethoscope: Stethoscope, tag: Tag,
  'train-front': TrainFront, 'trending-up': TrendingUp, tv: Tv, utensils: Utensils, wallet: Wallet, wifi: Wifi, wrench: Wrench,
  zap: Zap,
}

// A name this build does not know (set by a newer version, or by hand) still gets an icon.
export const categoryIcon = (name: string): LucideIcon => CATEGORY_ICONS[name] ?? Tag
