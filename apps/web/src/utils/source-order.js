const unavailableStatuses = new Set(["error"]);

export function orderSourcesByAvailability(sources, results) {
  return sources
    .map((source, index) => ({ source, index }))
    .sort((left, right) => {
      const leftStatus = results[left.source.id]?.status || left.source.status;
      const rightStatus = results[right.source.id]?.status || right.source.status;
      const availabilityDifference = Number(unavailableStatuses.has(leftStatus)) - Number(unavailableStatuses.has(rightStatus));
      return availabilityDifference || left.index - right.index;
    })
    .map(({ source }) => source);
}
