// Exact sequential binomial confidence intervals and classification rules.

export const DEFAULT_STAGES = [4, 12, 32, 64];
export const FAST_STAGES = [4, 8, 16, 32];
export const DEFAULT_THRESHOLDS = {
  lower: 0.20,
  upper: 0.85,
  minEvidence: 4
};
export const DEFAULT_TOTAL_ALPHA = 0.05;

// Log-gamma function (Lanczos approximation) for exact Beta function calculations
function logGamma(z) {
  const c = [
    57.1562356658629235,
    -59.5979603554754912,
    14.1360979747417471,
    -0.491913816097620199,
    0.339946499848118887e-4,
    0.465236289270485756e-4,
    -0.983744753048795646e-4,
    0.158088703224377324e-3,
    -0.210264441724104883e-3,
    0.217439618115212643e-3,
    -0.164318106536763890e-3,
    0.844182239838527433e-4,
    -0.261908384015814087e-4,
    0.368991826595316234e-5
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let base = z + 5.24218750000000000;
  let sum = 0.999999999999997092;
  for (let i = 0; i < c.length; i++) {
    sum += c[i] / (z + i + 1);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(base) - base + Math.log(sum);
}

// Regularized incomplete beta function I_x(a, b) via continued fraction
function betacf(x, a, b) {
  const maxIter = 100;
  const eps = 1e-14;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

export function incbeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return bt * betacf(x, a, b) / a;
  }
  return 1 - bt * betacf(1 - x, b, a) / b;
}

// Inverse of regularized incomplete beta function: finds x such that incbeta(x, a, b) = p
export function invincbeta(p, a, b) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // Bisection + Newton-Raphson refinement
  let low = 0;
  let high = 1;
  let x = Math.max(0.001, Math.min(0.999, a / (a + b)));
  for (let i = 0; i < 40; i++) {
    const val = incbeta(x, a, b);
    const err = val - p;
    if (Math.abs(err) < 1e-12) return x;
    if (err > 0) {
      high = x;
    } else {
      low = x;
    }
    // Newton step if derivative is well-behaved
    const deriv = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x));
    const step = deriv > 1e-14 ? err / deriv : 0;
    const nextX = x - step;
    if (nextX > low && nextX < high) {
      x = nextX;
    } else {
      x = 0.5 * (low + high);
    }
  }
  return x;
}

// Clopper-Pearson exact confidence interval for w successes out of n trials at significance alpha
export function clopperPearsonInterval(w, n, alpha = 0.05) {
  if (n <= 0) return [0, 1];
  const halfAlpha = alpha / 2;
  const lower = w === 0 ? 0 : invincbeta(halfAlpha, w, n - w + 1);
  const upper = w === n ? 1 : invincbeta(1 - halfAlpha, w + 1, n - w);
  return [Math.max(0, lower), Math.min(1, upper)];
}

// Stagewise alpha spending schedule (equal Bonferroni alpha allocation)
export function equalAlphaSpending(numStages, totalAlpha = DEFAULT_TOTAL_ALPHA) {
  const perStage = totalAlpha / numStages;
  return Array(numStages).fill(perStage);
}

// Evaluate sequential stage classification
export function classifySequentialStage({
  n,
  wins,
  stageIndex,
  stages = DEFAULT_STAGES,
  alphaSchedule = null,
  thresholds = DEFAULT_THRESHOLDS
}) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('Invalid sample size: n must be a positive integer');
  }
  if (!Number.isInteger(wins) || wins < 0 || wins > n) {
    throw new Error('Invalid wins: wins must be an integer between 0 and n');
  }

  const pLow = thresholds.lower ?? thresholds.pLow ?? 0.20;
  const pHigh = thresholds.upper ?? thresholds.pHigh ?? 0.85;
  const minEvidence = thresholds.minEvidence ?? 4;

  if(!Array.isArray(stages)||!stages.length||stages.some((v,i)=>!Number.isInteger(v)||v<1||(i&&v<=stages[i-1]))||!Number.isInteger(stageIndex)||stageIndex<0||stageIndex>=stages.length||n!==stages[stageIndex])throw Error('Invalid predeclared stage');
  if(!(pLow>=0&&pHigh<=1&&pLow<pHigh))throw Error('Invalid thresholds');
  const totalStages = stages.length;
  const schedule = alphaSchedule ?? equalAlphaSpending(totalStages);
  if(schedule.length!==totalStages||schedule.some(a=>!Number.isFinite(a)||a<=0||a>=1)||schedule.reduce((a,b)=>a+b,0)>DEFAULT_TOTAL_ALPHA+1e-12)throw Error('Invalid alpha spending schedule');
  const stageAlpha = schedule[stageIndex] ?? (DEFAULT_TOTAL_ALPHA / totalStages);

  const [lowerBound, upperBound] = clopperPearsonInterval(wins, n, stageAlpha);
  const winRate = n > 0 ? wins / n : 0;
  const isFinalStage = stageIndex >= totalStages - 1 || n >= stages[stages.length - 1];

  // 1. Weak check: Upper bound strictly below lower acceptable threshold
  if (upperBound < pLow) {
    return {
      classification: 'statistically-weak',
      canStop: true,
      stageIndex,
      n,
      wins,
      winRate,
      confidenceInterval: [lowerBound, upperBound],
      stageAlpha,
      isFinalStage,
      reason: `Upper confidence bound (${(upperBound * 100).toFixed(1)}%) is below the minimum threshold (${(pLow * 100).toFixed(1)}%)`
    };
  }

  // 2. Dominant check: Lower bound strictly above upper acceptable threshold
  if (lowerBound > pHigh) {
    return {
      classification: 'statistically-dominant',
      canStop: true,
      stageIndex,
      n,
      wins,
      winRate,
      confidenceInterval: [lowerBound, upperBound],
      stageAlpha,
      isFinalStage,
      reason: `Lower confidence bound (${(lowerBound * 100).toFixed(1)}%) is above the maximum threshold (${(pHigh * 100).toFixed(1)}%)`
    };
  }

  // 3. Clear acceptance: Entire interval lies strictly within target band [lower, upper]
  if (lowerBound >= pLow && upperBound <= pHigh && n >= minEvidence) {
    return {
      classification: 'statistically-balanced',
      canStop: true,
      stageIndex,
      n,
      wins,
      winRate,
      confidenceInterval: [lowerBound, upperBound],
      stageAlpha,
      isFinalStage,
      reason: `Confidence interval [${(lowerBound * 100).toFixed(1)}%, ${(upperBound * 100).toFixed(1)}%] is fully within the balanced band [${(pLow * 100).toFixed(1)}%, ${(pHigh * 100).toFixed(1)}%]`
    };
  }

  // 4. Intermediate stage: Continue testing
  if (!isFinalStage) {
    return {
      classification: 'continue',
      canStop: false,
      stageIndex,
      n,
      wins,
      winRate,
      confidenceInterval: [lowerBound, upperBound],
      stageAlpha,
      isFinalStage: false,
      reason: `Confidence interval [${(lowerBound * 100).toFixed(1)}%, ${(upperBound * 100).toFixed(1)}%] overlaps threshold boundaries; collecting more evidence`
    };
  }

  return {classification:'inconclusive',canStop:true,stageIndex,n,wins,winRate,confidenceInterval:[lowerBound,upperBound],stageAlpha,isFinalStage:true,inconclusive:true,reason:'Work cap reached while confidence bounds still cross a threshold.'};
}
