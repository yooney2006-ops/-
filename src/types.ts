/** 저장되는 데이터 구조. 아티팩트 시절 문서 구조(`main`, `d-YYYY-MM-DD`)를 그대로 유지한다. */
export interface Profile {
  sex: "m" | "f";
  age: number;
  height: number;
  weight: number;
  activity: number;
  goal: "cut" | "keep" | "bulk";
  example?: boolean;
}
export interface Food {
  name: string;
  serving: string;
  grams: number;
  kcal: number;
  carb: number;
  protein: number;
  fat: number;
  sugar?: number;
  sodium?: number;
}
export interface Meal extends Food {
  id: string;
  meal: string;
  qty: number;
  src?: string;
}
export interface WorkoutSet {
  w?: number | string;
  r?: number | string;
  done?: boolean;
  rir?: string;
  [k: string]: unknown;
}
export interface WorkoutItem {
  id?: string;
  exId?: string;
  name?: string;
  sets: WorkoutSet[];
  [k: string]: unknown;
}
export interface PlanDay {
  title: string;
  items: WorkoutItem[];
  [k: string]: unknown;
}
export interface MainDoc {
  profile: Profile;
  override: { kcal: number; carb: number; protein: number; fat: number } | null;
  customFoods: Food[];
  plan: PlanDay[];
  planNote?: string;
  [k: string]: unknown;
}
export interface DayDoc {
  meals: Meal[];
  workout: { items: WorkoutItem[] };
  [k: string]: unknown;
}
export interface AppState {
  main: MainDoc;
  /** 키는 YYYY-MM-DD */
  days: Record<string, DayDoc>;
}
