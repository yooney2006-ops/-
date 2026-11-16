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
  /** 세트 종류: 없음 = 본 세트, w = 워밍업(통계 제외), d = 드롭세트 */
  kind?: "w" | "d";
  [k: string]: unknown;
}
export interface WorkoutItem {
  id?: string;
  exId?: string;
  name?: string;
  sets: WorkoutSet[];
  /** 다음 운동과 슈퍼세트로 묶음 */
  ss?: boolean;
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
  /** 운동별 무게 증감 단위(kg) */
  exStep?: Record<string, number>;
  /** 바벨 바 무게(kg), 기본 20 */
  barKg?: number;
  /** 마지막으로 백업 파일을 내보낸 시각 */
  lastBackup?: string;
  /** 운동별 고정 메모 (키: 운동 id 또는 이름) */
  exNotes?: Record<string, string>;
  /** 요일과 무관한 이름 있는 루틴 */
  routines?: { id: string; name: string; items: WorkoutItem[] }[];
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
