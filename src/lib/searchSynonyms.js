function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Group likely synonym / typo candidates by edit distance. */
export function detectSynonymCandidates(terms, threshold = 2) {
  const unique = [...new Set((terms || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const groups = [];
  const assigned = new Set();
  for (let i = 0; i < unique.length; i++) {
    if (assigned.has(unique[i])) continue;
    const group = [unique[i]];
    assigned.add(unique[i]);
    for (let j = i + 1; j < unique.length; j++) {
      if (!assigned.has(unique[j]) && levenshtein(unique[i], unique[j]) <= threshold) {
        group.push(unique[j]);
        assigned.add(unique[j]);
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}
