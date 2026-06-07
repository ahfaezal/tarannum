import { AnalysisResult, ReferenceAudio } from '../types';

export interface PracticeAttempt {
  id: string;
  referenceId: string;
  referenceTitle: string;
  timestamp: number;
  score: number;
  segments: AnalysisResult['segments'];
  date: string;
  // NEW: Enhanced feedback tracking
  feedback?: {
    label: string;
    category: string;
    message: string;
    milestones?: string[];
    suggestions?: string[];
  };
  attemptNumber?: number; // NEW: Track attempt number
}

export interface VarianceMetrics {
  standardDeviation: number;
  coefficientOfVariation: number;
  scoreRange: { min: number; max: number; spread: number };
  trend: 'improving' | 'declining' | 'stable' | 'erratic';
}

export interface ConsistencyFlag {
  type: 'outlier' | 'sudden_drop' | 'sudden_rise' | 'erratic' | 'low_consistency';
  severity: 'low' | 'medium' | 'high';
  message: string;
  attemptIndex: number;
}

export interface ConsistencyAnalysis {
  isConsistent: boolean;
  flags: ConsistencyFlag[];
  outlierIndices: number[];
  suddenChanges: Array<{
    fromIndex: number;
    toIndex: number;
    change: number;
    reason: string;
  }>;
}

export interface ConfidenceIntervals {
  interval95: { lower: number; upper: number };
  interval99: { lower: number; upper: number };
  predictionInterval: { lower: number; upper: number };
  sampleSize: number;
}

export interface ProgressData {
  attempts: PracticeAttempt[];
  bestScore: number;
  averageScore: number;
  improvement: number; // percentage improvement
  totalAttempts: number;
  
  // Enhanced: Variance metrics
  variance?: VarianceMetrics;
  
  // Enhanced: Consistency analysis
  consistency?: ConsistencyAnalysis;
  
  // Enhanced: Confidence intervals
  confidence?: ConfidenceIntervals;
}

const STORAGE_KEY = 'tarannum_progress';

export const progressService = {
  // Save an attempt with enhanced feedback tracking
  saveAttempt: (reference: ReferenceAudio, result: AnalysisResult): PracticeAttempt => {
    // Get existing attempts to calculate attempt number
    const existing = progressService.getAllAttempts();
    const referenceAttempts = existing.filter(a => a.referenceId === reference.id);
    const attemptNumber = referenceAttempts.length + 1;
    
    // Extract feedback if available
    const feedback = typeof result.feedback === 'object' && result.feedback !== null 
      ? {
          label: (result.feedback as any).label || '',
          category: (result.feedback as any).category || '',
          message: (result.feedback as any).message || '',
          milestones: (result.feedback as any).milestones || [],
          suggestions: (result.feedback as any).suggestions || []
        }
      : undefined;
    
    const attempt: PracticeAttempt = {
      id: `attempt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      referenceId: reference.id,
      referenceTitle: reference.title,
      timestamp: Date.now(),
      score: result.score,
      segments: result.segments,
      date: new Date().toISOString(),
      feedback: feedback,
      attemptNumber: attemptNumber,
    };

    existing.push(attempt);
    
    // Keep only last 100 attempts
    const recent = existing.slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    
    return attempt;
  },

  // Get all attempts
  getAllAttempts: (): PracticeAttempt[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  // Get attempts for a specific reference
  getAttemptsForReference: (referenceId: string): PracticeAttempt[] => {
    const all = progressService.getAllAttempts();
    return all.filter(a => a.referenceId === referenceId).sort((a, b) => a.timestamp - b.timestamp);
  },

  // Get progress statistics (now includes enhanced metrics by default)
  getProgress: (referenceId?: string): ProgressData => {
    // Use enhanced progress which includes all metrics
    return progressService.getEnhancedProgress(referenceId);
  },

  // Clear all progress
  clearProgress: (): void => {
    localStorage.removeItem(STORAGE_KEY);
  },

  // NEW: Get feedback history for a reference
  getFeedbackHistory: (referenceId?: string): Array<{attempt: PracticeAttempt, feedback: any}> => {
    const attempts = referenceId 
      ? progressService.getAttemptsForReference(referenceId)
      : progressService.getAllAttempts();
    
    return attempts
      .filter(a => a.feedback)
      .map(a => ({ attempt: a, feedback: a.feedback }))
      .sort((a, b) => a.attempt.timestamp - b.attempt.timestamp);
  },

  // NEW: Get milestones achieved
  getMilestones: (referenceId?: string): Array<{milestone: string, date: string, score: number}> => {
    const attempts = referenceId 
      ? progressService.getAttemptsForReference(referenceId)
      : progressService.getAllAttempts();
    
    const milestones: Array<{milestone: string, date: string, score: number}> = [];
    
    attempts.forEach(attempt => {
      if (attempt.feedback?.milestones) {
        attempt.feedback.milestones.forEach((milestone: string) => {
          milestones.push({
            milestone,
            date: attempt.date,
            score: attempt.score
          });
        });
      }
    });
    
    return milestones;
  },

  // NEW: Get improvement trends
  getImprovementTrends: (referenceId?: string): {
    improving: boolean;
    trend: 'improving' | 'declining' | 'stable';
    averageImprovement: number;
    bestImprovement: number;
  } => {
    const attempts = referenceId 
      ? progressService.getAttemptsForReference(referenceId)
      : progressService.getAllAttempts();
    
    if (attempts.length < 2) {
      return {
        improving: false,
        trend: 'stable',
        averageImprovement: 0,
        bestImprovement: 0
      };
    }
    
    const scores = attempts.map(a => a.score);
    const improvements: number[] = [];
    
    for (let i = 1; i < scores.length; i++) {
      improvements.push(scores[i] - scores[i - 1]);
    }
    
    const averageImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;
    const bestImprovement = Math.max(...improvements);
    
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (averageImprovement > 1) {
      trend = 'improving';
    } else if (averageImprovement < -1) {
      trend = 'declining';
    }
    
    return {
      improving: averageImprovement > 0,
      trend,
      averageImprovement,
      bestImprovement
    };
  },

  // NEW: Get consistent problem areas
  getProblemAreas: (referenceId?: string): Array<{segmentIndex: number, frequency: number, avgScore: number}> => {
    const attempts = referenceId 
      ? progressService.getAttemptsForReference(referenceId)
      : progressService.getAllAttempts();
    
    if (attempts.length === 0) return [];
    
    // Count how often each segment has low scores
    const segmentStats: Map<number, {count: number, totalScore: number}> = new Map();
    
    attempts.forEach(attempt => {
      attempt.segments.forEach((seg, index) => {
        if (!segmentStats.has(index)) {
          segmentStats.set(index, { count: 0, totalScore: 0 });
        }
        const stats = segmentStats.get(index)!;
        stats.count++;
        stats.totalScore += seg.score || 0;
      });
    });
    
    const problemAreas: Array<{segmentIndex: number, frequency: number, avgScore: number}> = [];
    
    segmentStats.forEach((stats, index) => {
      const avgScore = stats.totalScore / stats.count;
      if (avgScore < 50) { // Low average score
        problemAreas.push({
          segmentIndex: index,
          frequency: stats.count,
          avgScore
        });
      }
    });
    
    return problemAreas.sort((a, b) => a.avgScore - b.avgScore); // Sort by worst first
  },

  // NEW: Calculate variance metrics
  calculateVariance: (attempts: PracticeAttempt[]): VarianceMetrics => {
    if (attempts.length < 2) {
      return {
        standardDeviation: 0,
        coefficientOfVariation: 0,
        scoreRange: { min: 0, max: 0, spread: 0 },
        trend: 'stable',
      };
    }

    const scores = attempts.map(a => a.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // Calculate standard deviation
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Calculate coefficient of variation
    const coefficientOfVariation = mean > 0 ? standardDeviation / mean : 0;
    
    // Calculate score range
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const spread = max - min;
    
    // Determine trend
    let trend: 'improving' | 'declining' | 'stable' | 'erratic' = 'stable';
    if (attempts.length >= 3) {
      // Use linear regression to determine trend
      const n = attempts.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      
      attempts.forEach((attempt, index) => {
        const x = index;
        const y = attempt.score;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
      });
      
      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      
      // Check if trend is significant (slope > threshold)
      if (Math.abs(slope) < 0.1) {
        // Check if variance is high (erratic)
        if (coefficientOfVariation > 0.15) {
          trend = 'erratic';
        } else {
          trend = 'stable';
        }
      } else if (slope > 0) {
        trend = 'improving';
      } else {
        trend = 'declining';
      }
    }
    
    return {
      standardDeviation,
      coefficientOfVariation,
      scoreRange: { min, max, spread },
      trend,
    };
  },

  // NEW: Detect inconsistent patterns
  detectInconsistencies: (attempts: PracticeAttempt[]): ConsistencyAnalysis => {
    if (attempts.length < 2) {
      return {
        isConsistent: true,
        flags: [],
        outlierIndices: [],
        suddenChanges: [],
      };
    }

    const scores = attempts.map(a => a.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    const flags: ConsistencyFlag[] = [];
    const outlierIndices: number[] = [];
    const suddenChanges: Array<{
      fromIndex: number;
      toIndex: number;
      change: number;
      reason: string;
    }> = [];

    // 1. Detect outliers using Z-score (threshold: |z| > 2.5)
    scores.forEach((score, index) => {
      if (stdDev > 0) {
        const zScore = Math.abs((score - mean) / stdDev);
        if (zScore > 2.5) {
          outlierIndices.push(index);
          flags.push({
            type: 'outlier',
            severity: zScore > 3.5 ? 'high' : zScore > 2.5 ? 'medium' : 'low',
            message: `Score ${score.toFixed(1)}% is ${zScore > 3.5 ? 'highly' : ''} unusual (${(zScore * 100).toFixed(0)}% deviation)`,
            attemptIndex: index,
          });
        }
      }
    });

    // 2. Detect sudden changes (>20% change between consecutive attempts)
    for (let i = 1; i < attempts.length; i++) {
      const prevScore = attempts[i - 1].score;
      const currScore = attempts[i].score;
      const change = currScore - prevScore;
      const changePercent = Math.abs(change / prevScore) * 100;
      
      if (changePercent > 20 && prevScore > 0) {
        const reason = change > 0 
          ? `Sudden rise: +${change.toFixed(1)}% (${changePercent.toFixed(1)}% increase)`
          : `Sudden drop: ${change.toFixed(1)}% (${changePercent.toFixed(1)}% decrease)`;
        
        suddenChanges.push({
          fromIndex: i - 1,
          toIndex: i,
          change,
          reason,
        });
        
        flags.push({
          type: change > 0 ? 'sudden_rise' : 'sudden_drop',
          severity: changePercent > 30 ? 'high' : changePercent > 20 ? 'medium' : 'low',
          message: reason,
          attemptIndex: i,
        });
      }
    }

    // 3. Detect erratic patterns (high variance with no clear trend)
    const varianceMetrics = progressService.calculateVariance(attempts);
    if (varianceMetrics.trend === 'erratic' && varianceMetrics.coefficientOfVariation > 0.2) {
      flags.push({
        type: 'erratic',
        severity: varianceMetrics.coefficientOfVariation > 0.3 ? 'high' : 'medium',
        message: `Erratic scoring pattern detected (CV: ${(varianceMetrics.coefficientOfVariation * 100).toFixed(1)}%)`,
        attemptIndex: attempts.length - 1,
      });
    }

    // 4. Detect low consistency (high coefficient of variation)
    if (varianceMetrics.coefficientOfVariation > 0.15 && attempts.length >= 5) {
      flags.push({
        type: 'low_consistency',
        severity: varianceMetrics.coefficientOfVariation > 0.25 ? 'high' : 'medium',
        message: `Low score consistency (CV: ${(varianceMetrics.coefficientOfVariation * 100).toFixed(1)}%)`,
        attemptIndex: attempts.length - 1,
      });
    }

    const isConsistent = flags.filter(f => f.severity === 'high').length === 0 && 
                         varianceMetrics.coefficientOfVariation < 0.15;

    return {
      isConsistent,
      flags,
      outlierIndices,
      suddenChanges,
    };
  },

  // NEW: Calculate confidence intervals
  calculateConfidenceIntervals: (attempts: PracticeAttempt[]): ConfidenceIntervals => {
    if (attempts.length < 2) {
      return {
        interval95: { lower: 0, upper: 100 },
        interval99: { lower: 0, upper: 100 },
        predictionInterval: { lower: 0, upper: 100 },
        sampleSize: attempts.length,
      };
    }

    const scores = attempts.map(a => a.score);
    const n = scores.length;
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    
    // Calculate standard deviation
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    
    // Standard error
    const standardError = stdDev / Math.sqrt(n);
    
    // For small samples (n < 30), use t-distribution approximation
    // For larger samples, use normal distribution (z-scores)
    // Using approximate t-values for common confidence levels
    let t95, t99;
    if (n < 30) {
      // Approximate t-values (degrees of freedom = n - 1)
      // For 95%: ~2.0-2.1 for small samples, 1.96 for large
      // For 99%: ~2.6-2.8 for small samples, 2.58 for large
      t95 = n <= 5 ? 2.78 : n <= 10 ? 2.26 : n <= 20 ? 2.09 : 2.0;
      t99 = n <= 5 ? 4.60 : n <= 10 ? 3.25 : n <= 20 ? 2.86 : 2.58;
    } else {
      t95 = 1.96; // Normal distribution
      t99 = 2.58;
    }
    
    // Calculate confidence intervals
    const margin95 = t95 * standardError;
    const margin99 = t99 * standardError;
    
    // Prediction interval (for next attempt)
    // Uses: mean ± t * stdDev * sqrt(1 + 1/n)
    const predictionMargin = t95 * stdDev * Math.sqrt(1 + 1 / n);
    
    return {
      interval95: {
        lower: Math.max(0, mean - margin95),
        upper: Math.min(100, mean + margin95),
      },
      interval99: {
        lower: Math.max(0, mean - margin99),
        upper: Math.min(100, mean + margin99),
      },
      predictionInterval: {
        lower: Math.max(0, mean - predictionMargin),
        upper: Math.min(100, mean + predictionMargin),
      },
      sampleSize: n,
    };
  },

  // NEW: Enhanced progress with all metrics
  getEnhancedProgress: (referenceId?: string): ProgressData => {
    const attempts = referenceId 
      ? progressService.getAttemptsForReference(referenceId)
      : progressService.getAllAttempts();

    if (attempts.length === 0) {
      return {
        attempts: [],
        bestScore: 0,
        averageScore: 0,
        improvement: 0,
        totalAttempts: 0,
        variance: {
          standardDeviation: 0,
          coefficientOfVariation: 0,
          scoreRange: { min: 0, max: 0, spread: 0 },
          trend: 'stable',
        },
        consistency: {
          isConsistent: true,
          flags: [],
          outlierIndices: [],
          suddenChanges: [],
        },
        confidence: {
          interval95: { lower: 0, upper: 100 },
          interval99: { lower: 0, upper: 100 },
          predictionInterval: { lower: 0, upper: 100 },
          sampleSize: 0,
        },
      };
    }

    const scores = attempts.map(a => a.score);
    const bestScore = Math.max(...scores);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    // Calculate improvement (compare first half vs second half)
    let improvement = 0;
    if (attempts.length >= 2) {
      const mid = Math.floor(attempts.length / 2);
      const firstHalf = attempts.slice(0, mid).map(a => a.score);
      const secondHalf = attempts.slice(mid).map(a => a.score);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      improvement = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
    }

    // Calculate enhanced metrics
    const variance = progressService.calculateVariance(attempts);
    const consistency = progressService.detectInconsistencies(attempts);
    const confidence = progressService.calculateConfidenceIntervals(attempts);

    return {
      attempts,
      bestScore,
      averageScore,
      improvement,
      totalAttempts: attempts.length,
      variance,
      consistency,
      confidence,
    };
  },
};

