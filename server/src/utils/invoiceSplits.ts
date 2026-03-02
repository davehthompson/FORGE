export interface InvoiceSplit {
  percentage: number;
  subtotal: number;
}

export function generateInvoiceSplits(count: number, totalAmount: number): InvoiceSplit[] {
  if (count === 1) {
    return [{ percentage: 100, subtotal: Math.round(totalAmount * 100) / 100 }];
  }

  const minWeight = 15;
  const weights: number[] = [];

  for (let i = 0; i < count; i++) {
    weights.push(minWeight + Math.random() * (100 - minWeight * count));
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);

  const rawPercentages = weights.map(w => (w / weightSum) * 100);
  const percentages = rawPercentages.map(p => Math.round(p));

  let diff = 100 - percentages.reduce((a, b) => a + b, 0);
  const maxIdx = percentages.indexOf(Math.max(...percentages));
  percentages[maxIdx] += diff;

  const splits: InvoiceSplit[] = [];
  let allocated = 0;

  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      splits.push({
        percentage: percentages[i],
        subtotal: Math.round((totalAmount - allocated) * 100) / 100,
      });
    } else {
      const subtotal = Math.round(totalAmount * (percentages[i] / 100) * 100) / 100;
      splits.push({ percentage: percentages[i], subtotal });
      allocated += subtotal;
    }
  }

  return splits;
}
