import { BookOpen, BriefcaseBusiness, CalendarCheck, Car, ChefHat, Clapperboard, CookingPot, Dumbbell, Fish, Gamepad2, HeartPulse, Landmark, LayoutGrid, Lightbulb, MapPin, Moon, Palette, PiggyBank, Plane, Repeat, Scale, ShoppingBag, TrainFront, TrendingUp, Users, Utensils, Bike, Languages } from 'lucide-react';
import { getCategoryThemeStyle } from '../../data/categoryDefinitions';

const ICONS = { video: Clapperboard, fishing: Fish, dining: Utensils, cooking: CookingPot, exercise: Scale,
  shopping: ShoppingBag, meeting: Users, game: Gamepad2, dream: Moon, idea: Lightbulb, recipe: ChefHat,
  investment: TrendingUp, hospital: HeartPulse, salary: Landmark, savings: PiggyBank, subscription: Repeat,
  kpass: TrainFront, annual_leave: CalendarCheck, outing: Bike, domesticTravel: MapPin, overseasTravel: Plane,
  vehicle: Car, culture: Palette, workMeal: BriefcaseBusiness, delivery: Bike, workout: Dumbbell,
  'english-tutor': BookOpen, 'japanese-tutor': Languages };

export default function CategoryIcon({ categoryId }) {
  const Icon = ICONS[categoryId] || LayoutGrid;
  return <span className="journal-category-icon" style={getCategoryThemeStyle(categoryId)} aria-hidden="true"><Icon size={24} strokeWidth={1.9} /></span>;
}
