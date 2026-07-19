// Word Error Rate: Levenshtein edit distance at the word level, normalized
// by reference length. Standard ASR accuracy metric — insertions, deletions,
// and substitutions all cost 1, matched words cost 0.
export function normalizeForWer(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:।"'`]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

export function wordErrorRate(referenceWords, hypothesisWords) {
  const n = referenceWords.length;
  const m = hypothesisWords.length;
  const distance = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) distance[i][0] = i;
  for (let j = 0; j <= m; j += 1) distance[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = referenceWords[i - 1] === hypothesisWords[j - 1] ? 0 : 1;
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1, // deletion
        distance[i][j - 1] + 1, // insertion
        distance[i - 1][j - 1] + cost, // substitution or match
      );
    }
  }
  return n === 0 ? 0 : distance[n][m] / n;
}
