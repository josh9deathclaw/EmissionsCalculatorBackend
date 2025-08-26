function calculateEmission({ transportMode, distanceKm, metadata = {}, fuelEfficiency = 7.5, factor = 2.31 }) {
  let emissionKg = 0;

  if (transportMode === 'car') {
    emissionKg = (fuelEfficiency / 100) * distanceKm * factor;
  } else if (transportMode === 'flight') {
    const ef = metadata.airlineFactor || 0.09;
    const multiplier = metadata.classMultiplier || 1;
    emissionKg = (metadata.flights || 0) * (metadata.hours || 0) * ef * multiplier * 1000;
  } else {
    const fallbackFactors = {
      bus: 0.0001,
      tram: 0.00007,
      metro: 0.00006,
      bike: 0,
      walk: 0
    };
    emissionKg = distanceKm * (fallbackFactors[transportMode.toLowerCase()] || 0);
  }

  return emissionKg;
}

module.exports = { calculateEmission };