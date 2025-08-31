// Exercise Classes - Domain Logic for Workout Types

// Parent class for count-based exercises
export class Count {
  static unit = "reps";
  
  reps: number;
  timestamp: string;

  constructor(reps: number | string) {
    this.reps = parseInt(reps.toString());
    this.timestamp = new Date().toISOString();
  }

  // Validation for all count-based exercises
  static validate(reps: number | string): boolean {
    const num = parseInt(reps.toString());
    return num > 0 && num <= 1000;
  }

  // Convert instance to database record format
  toRecord() {
    return {
      reps: this.reps,
      timestamp: this.timestamp
    };
  }
}

// Child class for Squats
export class Squats extends Count {
  static exerciseName = "Squats";
  static inputLabel = "Number of reps";

  constructor(reps: number | string) {
    super(reps);
  }
}

// Registry of all available exercise classes
export const ExerciseClasses = {
  Squats
} as const;

// Type for exercise class names
export type ExerciseClassName = keyof typeof ExerciseClasses;

// Helper function to get exercise class by name
export function getExerciseClass(name: ExerciseClassName) {
  return ExerciseClasses[name];
}

// Helper function to get all exercise options for UI
export function getExerciseOptions() {
  return Object.entries(ExerciseClasses).map(([key, ExerciseClass]) => ({
    key: key as ExerciseClassName,
    name: ExerciseClass.exerciseName,
    inputLabel: ExerciseClass.inputLabel
  }));
}