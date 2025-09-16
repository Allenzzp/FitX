/**
 * Timezone-aware date utilities for FitX
 * Handles the separation of precise timestamps vs local date grouping
 */

/**
 * Gets current date in user's local timezone as YYYY-MM-DD string
 * This is used for daily summary grouping and ensures workouts
 * appear on the correct calendar day regardless of timezone
 */
export const getUserLocalDate = (date?: Date): string => {
  const targetDate = date || new Date();
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Creates a representative UTC timestamp for a local date
 * Uses noon UTC to avoid timezone boundary issues while maintaining
 * consistent sorting and date comparison in the database
 *
 * @param localDateString - YYYY-MM-DD format
 * @returns ISO string representing noon UTC on that date
 */
export const createDailySummaryDate = (localDateString: string): string => {
  return `${localDateString}T12:00:00.000Z`;
};

/**
 * Extracts local date string from any timestamp in user's timezone
 * Used for grouping existing session data by local calendar days
 *
 * @param isoString - ISO timestamp string
 * @returns YYYY-MM-DD in user's local timezone
 */
export const extractLocalDateFromTimestamp = (isoString: string): string => {
  const date = new Date(isoString);
  return getUserLocalDate(date);
};

/**
 * Checks if a timestamp falls on a specific local date
 * Useful for filtering sessions by local calendar day
 *
 * @param timestamp - ISO timestamp string
 * @param localDate - YYYY-MM-DD string
 * @returns true if timestamp falls on the local date
 */
export const isTimestampOnLocalDate = (timestamp: string, localDate: string): boolean => {
  return extractLocalDateFromTimestamp(timestamp) === localDate;
};

/**
 * Gets date range for a specific local date
 * Returns start and end of day in user's timezone as UTC timestamps
 * Useful for database queries that need precise boundaries
 *
 * @param localDateString - YYYY-MM-DD format
 * @returns Object with start and end UTC timestamps
 */
export const getLocalDateBoundaries = (localDateString: string): { start: string; end: string } => {
  const [year, month, day] = localDateString.split('-').map(Number);

  // Create start of day in user's local timezone
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);

  // Create end of day in user's local timezone
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  return {
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString()
  };
};

/**
 * Formats a local date string for display
 *
 * @param localDateString - YYYY-MM-DD format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export const formatLocalDate = (
  localDateString: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }
): string => {
  // Create date in local timezone to avoid timezone conversion
  const [year, month, day] = localDateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, options);
};