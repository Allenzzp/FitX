import axios from 'axios';

const API_BASE = process.env.NODE_ENV === 'development' ? '/.netlify/functions' : '/.netlify/functions';
const STORAGE_KEY_PREFIX = 'repPatterns';

interface RepPatterns {
  [key: string]: number; // rep count -> usage frequency
}

interface UserRepPatterns {
  userId: string;
  topThreeReps: number[];
  updatedAt: string;
}

export class RepPatternsManager {
  private patterns: RepPatterns = {};
  private initialized = false;
  private readonly userId: string;
  private readonly storageKey: string;

  constructor(userId: string) {
    if (!userId) {
      throw new Error('RepPatternsManager requires a userId');
    }
    this.userId = userId;
    this.storageKey = `${STORAGE_KEY_PREFIX}_${userId}`;
  }

  /**
   * Initialize the rep patterns manager by fetching from DB and setting up localStorage
   * Always fetches fresh patterns from DB for new training periods
   */
  async initialize(): Promise<void> {
    try {
      // Always fetch fresh patterns from database for each training period
      const response = await axios.get(`${API_BASE}/user-rep-patterns`);

      if (response.data && response.data.topThreeReps) {
        // Clear localStorage and initialize with fresh DB patterns (value = 2 for established patterns)
        this.patterns = {};
        const dbPatterns: RepPatterns = {};
        response.data.topThreeReps.forEach((rep: number) => {
          dbPatterns[rep.toString()] = 2;
        });

        this.patterns = dbPatterns;
        this.saveToLocalStorage();
      } else {
        // No existing patterns, start with empty localStorage
        this.patterns = {};
        this.saveToLocalStorage();
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        // User has no patterns yet - this is normal for first-time users
        this.patterns = {};
        this.saveToLocalStorage();
      } else {
        console.error('Failed to initialize rep patterns:', error);
        // Fallback to localStorage only if DB is unavailable
        this.loadFromLocalStorage();
      }
    }

    this.initialized = true;
  }

  /**
   * Get the current top 3 rep patterns for UI display
   * Returns array sorted in ascending order (smallest to largest)
   */
  getTopThreePatterns(): number[] {
    const sortedEntries = Object.entries(this.patterns)
      .filter(([rep]) => parseInt(rep) !== 100) // Exclude default 100
      .sort(([,a], [,b]) => b - a) // Sort by frequency (highest first)
      .slice(0, 3); // Take top 3

    // If there are ties in frequency, prefer lower rep counts
    const topFrequency = sortedEntries.length > 0 ? sortedEntries[0][1] : 0;
    const tiedEntries = sortedEntries.filter(([, freq]) => freq === topFrequency);
    
    let finalPatterns: string[];
    
    if (tiedEntries.length > 3) {
      // Handle ties by selecting lowest rep counts
      finalPatterns = tiedEntries
        .sort(([a], [b]) => parseInt(a) - parseInt(b)) // Sort by rep count ascending
        .slice(0, 3)
        .map(([rep]) => rep);
    } else {
      finalPatterns = sortedEntries.map(([rep]) => rep);
    }

    // Convert to numbers and sort in ascending order for UI display
    return finalPatterns
      .map(rep => parseInt(rep))
      .sort((a, b) => a - b);
  }

  /**
   * Track usage of a rep increment during workout
   * @param repCount The number of reps added
   */
  trackRepUsage(repCount: number): void {
    // Don't track the default 100 as per requirements
    if (repCount === 100) {
      return;
    }

    const repKey = repCount.toString();
    
    if (this.patterns[repKey]) {
      // Existing pattern: increment usage
      this.patterns[repKey] += 1;
    } else {
      // New pattern: start with value 1 (must prove itself)
      this.patterns[repKey] = 1;
    }

    this.saveToLocalStorage();
  }

  /**
   * Sync current patterns to database (called on session end/pause)
   * Confidence threshold only applies when we already have established top 3 patterns
   */
  async syncToDatabase(): Promise<void> {
    
    try {
      // First, check if we have existing top 3 patterns in DB
      let hasEstablishedPatterns = false;
      let currentDbPatterns: number[] = [];
      
      try {
        const currentResponse = await axios.get(`${API_BASE}/user-rep-patterns`);
        currentDbPatterns = currentResponse.data?.topThreeReps || [];
        hasEstablishedPatterns = currentDbPatterns.length > 0;
      } catch (error) {
        if (!(axios.isAxiosError(error) && error.response?.status === 404)) {
          throw error; // Re-throw if it's not a 404
        }
        // 404 means no existing patterns - hasEstablishedPatterns stays false
      }

      // Get all valid patterns (excluding default 100)
      const allPatterns = Object.entries(this.patterns)
        .filter(([rep]) => parseInt(rep) !== 100)
        .sort(([,a], [,b]) => b - a); // Sort by frequency (highest first)

      let topThree: number[];

      if (!hasEstablishedPatterns) {
        // No established patterns yet - any new patterns qualify immediately
        if (allPatterns.length === 0) {
          topThree = [];
        } else if (allPatterns.length <= 3) {
          topThree = allPatterns
            .map(([rep]) => parseInt(rep))
            .sort((a, b) => a - b); // Sort ascending for consistency
        } else {
          // More than 3 patterns - take top 3 by frequency, tie-break by lower rep count
          const highestFreq = allPatterns[0][1];
          const tiedPatterns = allPatterns.filter(([, freq]) => freq === highestFreq);
          
          if (tiedPatterns.length > 3) {
            topThree = tiedPatterns
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .slice(0, 3)
              .map(([rep]) => parseInt(rep))
              .sort((a, b) => a - b);
          } else {
            topThree = allPatterns
              .slice(0, 3)
              .map(([rep]) => parseInt(rep))
              .sort((a, b) => a - b);
          }
        }
      } else {
        // We have established patterns - apply confidence threshold (>=3 uses) for new patterns
        const qualifiedPatterns = allPatterns.filter(([, freq]) => freq >= 3);

        if (qualifiedPatterns.length === 0) {
          // No new qualified patterns - keep existing DB patterns
          topThree = currentDbPatterns;
        } else {
          // Include existing DB patterns and merge with new qualified patterns
          // Create a frequency map that includes both current DB patterns and qualified new patterns
          const mergedPatterns = new Map<number, number>();
          
          // Add existing DB patterns (they should have higher weight since they're established)
          currentDbPatterns.forEach(rep => {
            const currentFreq = allPatterns.find(([r]) => parseInt(r) === rep)?.[1] || 5; // Give established patterns high weight
            mergedPatterns.set(rep, currentFreq);
          });
          
          // Add new qualified patterns
          qualifiedPatterns.forEach(([rep, freq]) => {
            const repNum = parseInt(rep);
            // Only replace if this new pattern has higher frequency than existing
            if (!mergedPatterns.has(repNum) || mergedPatterns.get(repNum)! < freq) {
              mergedPatterns.set(repNum, freq);
            }
          });
          
          // Sort merged patterns by frequency (desc) then by rep count (asc) and take top 3
          const sortedMerged = Array.from(mergedPatterns.entries())
            .sort(([repA, freqA], [repB, freqB]) => {
              if (freqB !== freqA) return freqB - freqA; // Higher frequency first
              return repA - repB; // Lower rep count as tiebreaker
            })
            .slice(0, 3);
            
          topThree = sortedMerged.map(([rep]) => rep).sort((a, b) => a - b);
        }
      }

      // Update database with new top 3
      if (topThree.length > 0) {
        await axios.put(`${API_BASE}/user-rep-patterns`, {
          topThreeReps: topThree
        });
      }

    } catch (error) {
      console.error('Failed to sync rep patterns to database:', error);
      throw error; // Re-throw to let caller handle
    }
  }

  /**
   * Save patterns to localStorage
   */
  private saveToLocalStorage(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.patterns));
  }

  /**
   * Load patterns from localStorage (for refresh recovery)
   */
  loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      this.patterns = stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Failed to load rep patterns from localStorage:', error);
      this.patterns = {};
    }
  }

  /**
   * Reset patterns (for testing or cleanup)
   */
  reset(): void {
    this.patterns = {};
    this.saveToLocalStorage();
    this.initialized = false;
  }

  /**
   * Get current patterns for debugging
   */
  getCurrentPatterns(): RepPatterns {
    return { ...this.patterns };
  }

  /**
   * Re-fetch patterns from database and update localStorage (Bug-1 fix)
   * Called after syncToDatabase to ensure localStorage shows only DB patterns
   */
  private async refreshFromDatabase(): Promise<void> {
    try {
      const response = await axios.get(`${API_BASE}/user-rep-patterns`);
      
      // Clear localStorage and reset with fresh DB patterns
      this.patterns = {};
      
      if (response.data && response.data.topThreeReps) {
        response.data.topThreeReps.forEach((rep: number) => {
          this.patterns[rep.toString()] = 2; // DB patterns get value 2
        });
      }
      
      this.saveToLocalStorage();
    } catch (error) {
      console.error('Failed to refresh patterns from database:', error);
      // Don't throw - this is a non-critical refresh operation
    }
  }

  /**
   * Refresh patterns from database (Bug-1 fix)
   * Call this when starting a new session to get fresh DB patterns
   */
  async refreshPatternsFromDatabase(): Promise<void> {
    await this.refreshFromDatabase();
  }

  /**
   * Get all rep patterns from localStorage for UI display (Bug 1 fix)
   * Returns all localStorage keys (both DB patterns and session patterns) sorted ascending
   */
  getAllLocalStorageReps(): number[] {
    return Object.keys(this.patterns)
      .filter(rep => parseInt(rep) !== 100) // Exclude default 100
      .map(rep => parseInt(rep))
      .sort((a, b) => a - b); // Sort ascending for UI display
  }
}
