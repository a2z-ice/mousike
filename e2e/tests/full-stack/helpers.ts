/**
 * Extract a prometheus counter value by matching key labels.
 * Labels can appear in any order in the prometheus text format.
 */
export function extractMetricCount(promText: string, metricName: string, labels: Record<string, string>): number {
  const lines = promText.split('\n');
  for (const line of lines) {
    if (!line.startsWith(metricName + '{')) continue;
    const allMatch = Object.entries(labels).every(([k, v]) => line.includes(`${k}="${v}"`));
    if (allMatch) {
      const valMatch = line.match(/\}\s+([0-9.]+)/);
      if (valMatch) return parseFloat(valMatch[1]);
    }
  }
  return -1; // not found
}
